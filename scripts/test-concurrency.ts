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

// The first session keeps its transaction open after taking the lock the second one
// needs, so the second arrives while the first is still uncommitted.
async function race(
  first: { subject: string; statement: string },
  second: { subject: string; statement: string },
  delayMilliseconds = 250,
): Promise<[SessionResult, SessionResult]> {
  const holder = psql(session(first.subject, first.statement, 900));
  await Bun.sleep(delayMilliseconds);
  const contender = psql(session(second.subject, second.statement, 0));
  return Promise.all([holder, contender]);
}

const ownerOne = "user_raceownerone";
const ownerTwo = "user_raceownertwo";
const joiner = "user_racejoiner";
const publisher = "user_racepub";
const voteOwner = "user_racevote";
const voterOne = "user_racev1";
const voterTwo = "user_racev2";

const fixtures = `
insert into public.profiles (user_id, username) values
  ('${ownerOne}', 'RaceOwnerOne'), ('${ownerTwo}', 'RaceOwnerTwo'), ('${joiner}', 'RaceJoiner'),
  ('${publisher}', 'RacePublisher'), ('${voteOwner}', 'RaceVoteOwner'),
  ('${voterOne}', 'RaceVoterOne'), ('${voterTwo}', 'RaceVoterTwo');

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
    (array['race_version_e']::text[], 'approved', now())
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
  'voteE2', (select id from public.group_votes where addition = array['race_version_e'] order by id offset 1 limit 1)
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
  'incorporatedVotes', (select count(*) from public.group_votes where incorporated_at is not null)
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
    voteC: string; voteD: string; voteE1: string; voteE2: string;
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

  // Two independent approved votes incorporated at once: the group lock serializes
  // them, so exactly one writes and the other is refused for the moved revision.
  const incorporate = (id: string, revision: number) =>
    `select public.incorporate_group_vote('${id}'::uuid, ${revision})`;
  const run = async (subject: string, statement: string) =>
    psql(session(subject, statement, 0));

  const [firstIndependent, secondIndependent] = await race(
    { subject: voteOwner, statement: incorporate(ids.voteC, 1) },
    { subject: voteOwner, statement: incorporate(ids.voteD, 1) },
  );
  expect(
    (firstIndependent.code === 0) !== (secondIndependent.code === 0) &&
      (firstIndependent.err.includes("Draft revision conflict.") ||
        secondIndependent.err.includes("Draft revision conflict.")),
    "concurrent independent incorporations keep exactly one draft write",
    `first=${firstIndependent.code} second=${secondIndependent.code} ${firstIndependent.err} ${secondIndependent.err}`,
  );

  const independentWinner = firstIndependent.code === 0 ? ids.voteC : ids.voteD;
  const independentLoser = firstIndependent.code === 0 ? ids.voteD : ids.voteC;
  const retried = await run(voteOwner, incorporate(independentLoser, 2));
  expect(retried.code === 0,
    "the refused independent incorporation succeeds against the new revision",
    `code=${retried.code} ${retried.err}`);

  // Two approved votes for one addition, incorporated at once, then the refused one
  // incorporated twice: one discharge, one already-incorporated refusal, one copy.
  const [firstDuplicate, secondDuplicate] = await race(
    { subject: voteOwner, statement: incorporate(ids.voteE1, 3) },
    { subject: voteOwner, statement: incorporate(ids.voteE2, 3) },
  );
  expect(
    (firstDuplicate.code === 0) !== (secondDuplicate.code === 0) &&
      (firstDuplicate.err.includes("Draft revision conflict.") ||
        secondDuplicate.err.includes("Draft revision conflict.")),
    "concurrent duplicate approvals keep exactly one draft write",
    `first=${firstDuplicate.code} second=${secondDuplicate.code} ${firstDuplicate.err} ${secondDuplicate.err}`,
  );

  const duplicateLoser = firstDuplicate.code === 0 ? ids.voteE2 : ids.voteE1;
  const [firstRetry, secondRetry] = await race(
    { subject: voteOwner, statement: incorporate(duplicateLoser, 4) },
    { subject: voteOwner, statement: incorporate(duplicateLoser, 4) },
  );
  expect(
    firstRetry.code === 0 && secondRetry.code !== 0 &&
      secondRetry.err.includes("Vote is already incorporated."),
    "one vote incorporated twice is discharged once",
    `first=${firstRetry.code} second=${secondRetry.code} ${secondRetry.err}`,
  );

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
  expect(observed.draftRevision === 4 &&
    storedVersions.filter((id) => id === "race_version_c").length === 1 &&
    storedVersions.filter((id) => id === "race_version_d").length === 1 &&
    storedVersions.filter((id) => id === "race_version_e").length === 1,
  "the incorporation races store every addition exactly once",
  `revision=${String(observed.draftRevision)} versions=${JSON.stringify(storedVersions)}`);
  expect(observed.incorporatedVotes === 4,
    "every approved vote is discharged exactly once",
    `incorporatedVotes=${String(observed.incorporatedVotes)}`);
} finally {
  const cleanup = await psql(`
    delete from public.groups where owner_id like 'user_race%';
    delete from public.profiles where user_id like 'user_race%';
  `);
  if (cleanup.code !== 0) console.error(`Cleanup failed: ${cleanup.err}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} concurrency check(s) failed.`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nAll concurrency checks passed.");
