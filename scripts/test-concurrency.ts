// Real multi-session concurrency checks for the three rules that were previously
// argued from lock discipline only: public admission, publication sequencing and
// ballot counting. Every check opens two independent PostgreSQL sessions inside the
// local stack's own container, so the interleaving is genuine rather than simulated.
//
// Local disposable stack only. No connection string, host path or Docker flag is
// accepted, and the script refuses to run when the local database container is absent.

if (process.argv.length !== 2) {
  console.error("Usage: bun run db:test:concurrency (local Docker stack only; no arguments)");
  process.exit(64);
}

const docker = ["docker", "--host=unix:///var/run/docker.sock"] as const;

const configText = await Bun.file(new URL("../supabase/config.toml", import.meta.url)).text();
const projectMatch = /^project_id\s*=\s*"([a-z0-9-]+)"$/m.exec(configText);
if (!projectMatch) {
  console.error("supabase/config.toml does not declare a project_id.");
  process.exit(1);
}
const container = `supabase_db_${projectMatch[1]}`;

const inspected = Bun.spawnSync([...docker, "container", "inspect", container], { timeout: 30_000 });
if (inspected.exitCode !== 0) {
  console.error(`Local database container ${container} is not running. Start it with bun run db:start.`);
  process.exit(1);
}

type SessionResult = { code: number; out: string; err: string };

async function psql(sql: string): Promise<SessionResult> {
  const proc = Bun.spawn(
    [...docker, "exec", "-i", container, "psql", "-X", "-q", "-t", "-A",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
    { stdin: new TextEncoder().encode(sql), stdout: "pipe", stderr: "pipe" },
  );
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, out: out.trim(), err: err.trim() };
}

function session(subject: string, statement: string, holdMilliseconds: number): string {
  return [
    "begin;",
    "set local role authenticated;",
    `select set_config('request.jwt.claims', '{"sub":"${subject}","role":"authenticated"}', true);`,
    `${statement};`,
    holdMilliseconds > 0 ? `select pg_sleep(${(holdMilliseconds / 1000).toFixed(3)});` : "",
    "commit;",
  ].filter(Boolean).join("\n");
}

// A race that never overlapped proves nothing about the rule it claims to test, so the
// contender is observed waiting on a lock before the run accepts the outcome. A timing
// accident becomes a failure with a clear message instead of a silent pass.
async function waitForOpenTransactions(timeoutMilliseconds: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    // Two transactions open at the same instant is what makes this a race, whether the
    // second one blocks on a lock or meets a constraint evaluated at commit.
    const probe = await psql(`
      select count(*) from pg_stat_activity
      where state = 'active' and xact_start is not null and pid <> pg_backend_pid();
    `);
    if (probe.code === 0 && Number(probe.out) >= 2) return true;
    await Bun.sleep(20);
  }
  return false;
}

// The first session keeps its transaction open after taking the lock the second one
// needs, so the second arrives while the first is still uncommitted.
async function race(
  first: { subject: string; statement: string },
  second: { subject: string; statement: string },
  options: { delayMilliseconds?: number; holdMilliseconds?: number } = {},
): Promise<[SessionResult, SessionResult]> {
  const holdMilliseconds = options.holdMilliseconds ?? 2_500;
  const holder = psql(session(first.subject, first.statement, holdMilliseconds));
  await Bun.sleep(options.delayMilliseconds ?? 300);
  const contender = psql(session(second.subject, second.statement, 0));
  const overlapped = await waitForOpenTransactions(holdMilliseconds + 2_000);
  const results = await Promise.all([holder, contender]);
  if (!overlapped) throw new Error("the race never overlapped: two transactions were never open at once");
  return results;
}

// Every run owns its rows: a leftover from an earlier run, or two runners at once, cannot
// satisfy or poison these checks. The token is short because usernames cap at 20 characters.
const runId = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
// Clerk subjects allow only alphanumerics after the `user_` prefix, so the token joins the
// suffix instead of adding another underscore.
const ownerOne = `user_race${runId}o1`;
const ownerTwo = `user_race${runId}o2`;
const joiner = `user_race${runId}j`;
const publisher = `user_race${runId}p`;
const voteOwner = `user_race${runId}v`;
const voterOne = `user_race${runId}v1`;
const voterTwo = `user_race${runId}v2`;

const fixtures = `
insert into public.profiles (user_id, username) values
  ('${ownerOne}', 'RaceO1_${runId}'), ('${ownerTwo}', 'RaceO2_${runId}'), ('${joiner}', 'RaceJ_${runId}'),
  ('${publisher}', 'RaceP_${runId}'), ('${voteOwner}', 'RaceV_${runId}'),
  ('${voterOne}', 'RaceV1_${runId}'), ('${voterTwo}', 'RaceV2_${runId}');

with created as (
  insert into public.groups (name, visibility, owner_id) values
    ('Race Admission One', 'public', '${ownerOne}'),
    ('Race Admission Two', 'public', '${ownerTwo}'),
    ('Race Publication', 'public', '${publisher}'),
    ('Race Voting', 'public', '${voteOwner}')
  returning id, owner_id
)
insert into public.group_members (group_id, user_id)
  select id, owner_id from created;

insert into public.group_members (group_id, user_id)
  select g.id, m.user_id from public.groups g
  join (values ('${voterOne}'), ('${voterTwo}')) as m(user_id) on true
  where g.owner_id = '${voteOwner}';

set constraints all immediate;

insert into public.pack_drafts (group_id, game_version, loader, version_ids, revision)
  select id, '1.21.1', 'fabric', array['race_version_a'], 1 from public.groups
  where owner_id in ('${publisher}', '${voteOwner}');

insert into public.group_votes (group_id, created_by, game_version, loader, addition,
  proposal, duration_hours, electorate_size, closes_at, status, resolved_at)
  select g.id, '${voteOwner}', '1.21.1', 'fabric', v.addition,
    jsonb_build_array(jsonb_build_object('versionId', v.addition[1],
      'projectId', 'race_project_' || v.addition[1], 'projectTitle', 'Race Project',
      'versionNumber', '1.0.0')),
    24, 3, now() + interval '24 hours', v.status, v.resolved
  from public.groups g
  cross join (values
    (array['race_version_b']::text[], 'open', null::timestamptz),
    (array['race_version_c']::text[], 'approved', now()),
    (array['race_version_d']::text[], 'approved', now()),
    (array['race_version_e']::text[], 'approved', now()),
    (array['race_version_e']::text[], 'approved', now()),
    (array['race_version_f']::text[], 'approved', now())
  ) as v(addition, status, resolved)
  where g.owner_id = '${voteOwner}';
insert into public.group_vote_electorate (vote_id, user_id)
  select v.id, m.user_id from public.group_votes v
  join public.group_members m on m.group_id = v.group_id;
-- Two independent approvals per ready vote, so the incorporation races start approved.
insert into public.group_vote_ballots (vote_id, user_id, value)
  select v.id, m.user_id, 'approve' from public.group_votes v
  join (values ('${voterOne}'), ('${voterTwo}')) as m(user_id) on true
  where v.status = 'approved';
`;

// Identifiers are resolved as the database owner so no fixture read depends on
// privileges the client role does not have.
const identifiers = `
select json_build_object(
  'admissionOne', (select id from public.groups where owner_id = '${ownerOne}'),
  'admissionTwo', (select id from public.groups where owner_id = '${ownerTwo}'),
  'ballotVote', (select id from public.group_votes where addition = array['race_version_b']),
  'voteC', (select id from public.group_votes where addition = array['race_version_c']),
  'voteD', (select id from public.group_votes where addition = array['race_version_d']),
  'voteE1', (select id from public.group_votes where addition = array['race_version_e'] order by id limit 1),
  'voteE2', (select id from public.group_votes where addition = array['race_version_e'] order by id offset 1 limit 1),
  'voteF', (select id from public.group_votes where addition = array['race_version_f']),
  'voteGroup', (select id from public.groups where owner_id = '${voteOwner}')
)::text;
`;

const observation = `
select json_build_object(
  'joinerMemberships', (select count(*) from public.group_members where user_id = '${joiner}'),
  'sequences', (select coalesce(json_agg(p.sequence order by p.sequence), '[]'::json)
    from public.pack_publications p join public.groups g on g.id = p.group_id
    where g.owner_id = '${publisher}'),
  'activePublications', (select count(*) from public.pack_publications where is_active),
  'ballots', (select count(*) from public.group_vote_ballots b join public.group_votes v on v.id = b.vote_id
    where v.addition = array['race_version_b']),
  'approvedBallots', (select count(*) from public.group_vote_ballots b join public.group_votes v on v.id = b.vote_id
    where v.addition = array['race_version_b'] and b.value = 'approve'),
  'voteStatus', (select status from public.group_votes where addition = array['race_version_b']),
  'resolvedAtSet', (select resolved_at is not null from public.group_votes where addition = array['race_version_b']),
  'draftRevision', (select revision from public.pack_drafts d join public.groups g on g.id = d.group_id
    where g.owner_id = '${voteOwner}'),
  'draftVersions', (select to_json(version_ids) from public.pack_drafts d join public.groups g on g.id = d.group_id
    where g.owner_id = '${voteOwner}'),
  'incorporatedVotes', (select count(*) from public.group_votes v
    join public.groups g on g.id = v.group_id
    where g.owner_id = '${voteOwner}' and v.incorporated_at is not null)
)::text;
`;

const failures: string[] = [];
function expect(held: boolean, message: string, detail: string): void {
  console.log(`${held ? "PASS" : "FAIL"} ${message}`);
  if (!held) failures.push(`${message} — ${detail}`);
}

try {
  const setup = await psql(fixtures);
  if (setup.code !== 0) throw new Error(`Fixture setup failed: ${setup.err}`);

  const resolved = await psql(identifiers);
  if (resolved.code !== 0) throw new Error(`Identifier lookup failed: ${resolved.err}`);
  const ids = JSON.parse(resolved.out) as {
    admissionOne: string; admissionTwo: string; ballotVote: string;
    voteC: string; voteD: string; voteE1: string; voteE2: string; voteF: string; voteGroup: string;
  };

  const [admissionHolder, admissionContender] = await race(
    { subject: joiner, statement: `select public.join_public_group('${ids.admissionOne}'::uuid)` },
    { subject: joiner, statement: `select public.join_public_group('${ids.admissionTwo}'::uuid)` },
  );
  expect(
    admissionHolder.code === 0 && admissionContender.code !== 0 &&
      admissionContender.err.includes("Already in a group."),
    "concurrent public admission keeps one membership",
    `holder=${admissionHolder.code} contender=${admissionContender.code} ${admissionContender.err}`,
  );

  const publishStatement = `select public.publish_pack_draft('Race Pack', '1.0.0', '1.21.1', 1)`;
  const [firstPublish, secondPublish] = await race(
    { subject: publisher, statement: publishStatement },
    { subject: publisher, statement: publishStatement },
  );
  expect(
    firstPublish.code === 0 && secondPublish.code === 0,
    "concurrent publications both complete",
    `first=${firstPublish.code} second=${secondPublish.code} ${firstPublish.err} ${secondPublish.err}`,
  );

  const ballot = `select public.cast_group_vote('${ids.ballotVote}'::uuid, 'approve')`;
  const [firstBallot, secondBallot] = await race(
    { subject: voterOne, statement: ballot },
    { subject: voterTwo, statement: ballot },
  );
  expect(
    firstBallot.code === 0 && secondBallot.code === 0,
    "concurrent ballots both complete",
    `first=${firstBallot.code} second=${secondBallot.code} ${firstBallot.err} ${secondBallot.err}`,
  );

  // A draft save and an incorporation both compare-and-swap the same revision under the
  // group lock, so exactly one wins and the loser changes nothing.
  const incorporation = (id: string, expected: number) =>
    `select public.incorporate_group_vote('${id}'::uuid, ${expected})`;
  const draftSave = (expected: number) => `select public.save_pack_draft(
    '${ids.voteGroup}'::uuid, '1.21.1', 'fabric', array['race_version_a'], ${expected})`;
  const run = async (subject: string, statement: string) => psql(session(subject, statement, 0));

  // The draft revision advances by exactly one per successful writer, so every expected
  // value below is derived instead of hardcoded.
  let revision = 1;
  const [saveHolder, saveContender] = await race(
    { subject: voteOwner, statement: draftSave(revision) },
    { subject: voteOwner, statement: incorporation(ids.voteC, revision) },
  );
  const saveWon = saveHolder.code === 0;
  expect(
    saveWon !== (saveContender.code === 0) &&
      (saveWon ? saveContender.err.includes("Draft revision conflict.") : saveHolder.err.includes("Draft revision conflict.")),
    "a draft save and an incorporation cannot both write one revision",
    `save=${saveHolder.code} incorporate=${saveContender.code} ${saveHolder.err} ${saveContender.err}`,
  );
  revision += 1;
  if (saveWon) {
    const retriedSave = await run(voteOwner, incorporation(ids.voteC, revision));
    expect(retriedSave.code === 0,
      "the refused incorporation succeeds against the saved revision",
      `code=${retriedSave.code} ${retriedSave.err}`);
    revision += 1;
  }

  // Two independent approved votes incorporated at once: exactly one writes and the
  // other is refused for the moved revision, then succeeds against it.
  const [firstIndependent, secondIndependent] = await race(
    { subject: voteOwner, statement: incorporation(ids.voteD, revision) },
    { subject: voteOwner, statement: incorporation(ids.voteF, revision) },
  );
  expect(
    (firstIndependent.code === 0) !== (secondIndependent.code === 0) &&
      (firstIndependent.err.includes("Draft revision conflict.") ||
        secondIndependent.err.includes("Draft revision conflict.")),
    "concurrent independent incorporations keep exactly one draft write",
    `first=${firstIndependent.code} second=${secondIndependent.code} ${firstIndependent.err} ${secondIndependent.err}`,
  );
  revision += 1;
  const independentLoser = firstIndependent.code === 0 ? ids.voteF : ids.voteD;
  const retriedIndependent = await run(voteOwner, incorporation(independentLoser, revision));
  expect(retriedIndependent.code === 0,
    "the refused independent incorporation succeeds against the new revision",
    `code=${retriedIndependent.code} ${retriedIndependent.err}`);
  revision += 1;

  // Two approved votes for one addition, incorporated at once, then the refused one
  // incorporated twice: one discharge, one already-incorporated refusal, one copy.
  const [firstDuplicate, secondDuplicate] = await race(
    { subject: voteOwner, statement: incorporation(ids.voteE1, revision) },
    { subject: voteOwner, statement: incorporation(ids.voteE2, revision) },
  );
  expect(
    (firstDuplicate.code === 0) !== (secondDuplicate.code === 0) &&
      (firstDuplicate.err.includes("Draft revision conflict.") ||
        secondDuplicate.err.includes("Draft revision conflict.")),
    "concurrent duplicate approvals keep exactly one draft write",
    `first=${firstDuplicate.code} second=${secondDuplicate.code} ${firstDuplicate.err} ${secondDuplicate.err}`,
  );
  revision += 1;
  const duplicateLoser = firstDuplicate.code === 0 ? ids.voteE2 : ids.voteE1;
  const [firstRetry, secondRetry] = await race(
    { subject: voteOwner, statement: incorporation(duplicateLoser, revision) },
    { subject: voteOwner, statement: incorporation(duplicateLoser, revision) },
  );
  expect(
    firstRetry.code === 0 && secondRetry.code !== 0 &&
      secondRetry.err.includes("Vote is already incorporated."),
    "one vote incorporated twice is discharged once",
    `first=${firstRetry.code} second=${secondRetry.code} ${secondRetry.err}`,
  );
  // A satisfied discharge records the obligation without bumping the revision.
  const expectedRevision = revision;

  const snapshot = await psql(observation);
  if (snapshot.code !== 0) throw new Error(`Observation failed: ${snapshot.err}`);
  const observed = JSON.parse(snapshot.out) as Record<string, unknown>;

  const sequences = observed.sequences as number[];
  expect(observed.joinerMemberships === 1,
    "the admission race leaves exactly one membership",
    `joinerMemberships=${String(observed.joinerMemberships)}`);
  expect(Array.isArray(sequences) && sequences.length === 2 &&
    sequences[0] === 1 && sequences[1] === 2,
  "the publication race assigns both sequences without collision",
  `sequences=${JSON.stringify(sequences)}`);
  expect(observed.activePublications === 0,
    "concurrent publications never activate a version",
    `activePublications=${String(observed.activePublications)}`);
  expect(observed.ballots === 2 && observed.approvedBallots === 2,
    "concurrent ballots count once per voter",
    `ballots=${String(observed.ballots)} approved=${String(observed.approvedBallots)}`);
  expect(observed.voteStatus === "approved" && observed.resolvedAtSet === true,
    "the majority closes the vote exactly once",
    `status=${String(observed.voteStatus)} resolvedAtSet=${String(observed.resolvedAtSet)}`);

  const storedVersions = observed.draftVersions as string[];
  expect(observed.draftRevision === expectedRevision &&
    ["race_version_c", "race_version_d", "race_version_e", "race_version_f"]
      .every((id) => storedVersions.filter((stored) => stored === id).length === 1),
  "the incorporation races store every addition exactly once",
  `revision=${String(observed.draftRevision)} expected=${expectedRevision} versions=${JSON.stringify(storedVersions)}`);
  expect(observed.incorporatedVotes === 5,
    "every approved vote is discharged exactly once",
    `incorporatedVotes=${String(observed.incorporatedVotes)}`);
} finally {
  const cleanup = await psql(`
    delete from public.groups where owner_id like 'user_race${runId}%';
    delete from public.profiles where user_id like 'user_race${runId}%';
  `);
  if (cleanup.code !== 0) failures.push(`cleanup failed — ${cleanup.err}`);
  const leftovers = await psql(`
    select (select count(*) from public.profiles where user_id like 'user_race${runId}%')
         + (select count(*) from public.groups where owner_id like 'user_race${runId}%');
  `);
  if (leftovers.code !== 0 || leftovers.out.trim() !== "0") {
    failures.push(`cleanup left fixtures behind — ${leftovers.code !== 0 ? leftovers.err : leftovers.out.trim()}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} concurrency check(s) failed.`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nAll concurrency checks passed.");
