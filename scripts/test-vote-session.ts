/**
 * Live voting-obligation check with real Clerk sessions against the hosted database.
 *
 * Proves the completion plan's M7 chain that the local stack cannot assemble: one real
 * Clerk session token is accepted by Hono and forwarded to PostgREST, where the vote
 * RPCs arbitrate who opens, votes, cancels and incorporates. It opens a concrete
 * Modrinth addition, changes a ballot, reaches the absolute majority, reads the pending
 * obligation from the vote list, shows that a draft save does not discharge it,
 * incorporates it under the revision compare-and-swap, refuses a second incorporation,
 * discharges a duplicate approved addition without rewriting the draft, cancels an open
 * vote, and proves that a transfer moves the obligation to the new owner while the
 * previous owner is refused.
 *
 * It mutates provider state (accounts) and hosted database state (profiles, groups,
 * drafts and votes). It refuses to run without --live, refuses non-development
 * credentials, refuses a local Supabase URL, and prints no secret, password or token.
 * Every group is closed through the API; only the account profiles need a SQL cleanup,
 * which the script writes to a file and never runs itself.
 *
 * Usage: bun scripts/test-vote-session.ts --live
 * Reads CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from the web app env,
 * SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from the API env, and expects a running
 * API at API_URL (default http://127.0.0.1:3001) configured against that database.
 */
export {};

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const live = process.argv.includes("--live");

function envFiles(paths: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const path of paths) {
    let text = "";
    try { text = readFileSync(path, "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
  return values;
}

const root = new URL("..", import.meta.url).pathname;
const fileEnv = envFiles([`${root}apps/api/.env`, `${root}apps/web/.env`]);
const value = (name: string) => process.env[name] ?? fileEnv[name] ?? "";
const secret = value("CLERK_SECRET_KEY");
const publishable = value("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
const databaseUrl = value("SUPABASE_URL");
const databaseKey = value("SUPABASE_PUBLISHABLE_KEY");
const apiUrl = value("API_URL") || "http://127.0.0.1:3001";
const origin = value("CLERK_ORIGIN") || "http://127.0.0.1:3000";

function stop(reason: string): never {
  console.error(`Refused: ${reason}`);
  process.exit(2);
}

if (!live) stop("this check creates real test accounts, groups and votes; pass --live to run it.");
if (!secret.startsWith("sk_test_")) stop("CLERK_SECRET_KEY must be a development-instance key.");
if (!publishable.startsWith("pk_test_")) stop("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a development-instance key.");
if (!databaseUrl.startsWith("https://")) stop("SUPABASE_URL must be the hosted project; use db:test:postgrest locally.");
if (!databaseKey.startsWith("sb_publishable_") && !databaseKey.startsWith("eyJ")) {
  stop("SUPABASE_PUBLISHABLE_KEY is missing.");
}

const fapi = `https://${Buffer.from(publishable.slice("pk_test_".length), "base64").toString("utf8").replace(/\$$/, "")}`;
const suffix = Date.now().toString(36).slice(-6);
const usernames = { owner: `Vt${suffix}O`, member: `Vt${suffix}M`, outsider: `Vt${suffix}X` };
const password = `Voting-${crypto.randomUUID()}`;
const fixturesPath = "/tmp/opencode/m7-vote-session-fixtures.json";
const cleanupPath = "/tmp/opencode/m7-vote-session-cleanup.sql";

const failures: string[] = [];
function check(name: string, actual: unknown, expected: unknown, note?: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${name}: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${note ? ` — ${note}` : ""}`);
  return ok;
}

async function clerkApi(method: string, path: string, body?: unknown) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Clerk API ${method} ${path} failed with ${response.status}`);
  return response.status === 204 ? null : await response.json();
}

function cookieOf(response: Response) {
  return (response.headers.getSetCookie?.() ?? []).map((item) => item.split(";")[0]).find((item) => item.startsWith("__client="));
}

// Development instances gate client requests behind a short-lived browser token, and one
// token does not serve a second sign-in flow, so each account obtains its own.
async function browserQuery(): Promise<string> {
  const response = await fetch(`${fapi}/v1/dev_browser?_clerk_js_version=6.43.0`, { method: "POST", headers: { Origin: origin } });
  if (!response.ok) throw new Error(`the development instance did not issue a browser token (${response.status})`);
  const token = ((await response.json()) as { token?: string }).token;
  if (!token) throw new Error("the development instance returned no browser token");
  return `_clerk_js_version=6.43.0&__clerk_db_jwt=${encodeURIComponent(token)}`;
}

async function form(path: string, body?: Record<string, string>, cookie?: string) {
  const response = await fetch(`${fapi}${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : new URLSearchParams(body).toString(),
  });
  const payload = (await response.json()) as any;
  return { status: response.status, payload, cookie: cookieOf(response) };
}

type Account = { label: string; id: string; email: string; token: string };

const createdUserIds: string[] = [];

async function createAccount(label: string): Promise<Account> {
  const email = `modpack.votes.${label}.${suffix}${Date.now().toString(36).slice(-4)}+clerk_test@example.com`;
  const user = (await clerkApi("POST", "/users", {
    email_address: [email], password, first_name: "Voting", last_name: label,
  })) as { id: string };
  // Register the id before any provider call that can fail, so cleanup always sees it.
  createdUserIds.push(user.id);
  const query = await browserQuery();
  const created = await form(`/v1/client/sign_ins?${query}`, { identifier: email });
  if (created.payload?.response?.status !== "needs_first_factor") throw new Error(`${label}: sign-in did not reach the password factor.`);
  const factor = await form(`/v1/client/sign_ins/${created.payload?.response?.id}/attempt_first_factor?${query}`,
    { strategy: "password", password }, created.cookie);
  const trustPrepared = await form(`/v1/client/sign_ins/${created.payload?.response?.id}/prepare_second_factor?${query}`,
    { strategy: "email_code" }, factor.cookie);
  const trusted = await form(`/v1/client/sign_ins/${created.payload?.response?.id}/attempt_second_factor?${query}`,
    { strategy: "email_code", code: "424242" }, trustPrepared.cookie);
  const sessionId: string | undefined = trusted.payload?.response?.created_session_id;
  if (!sessionId) throw new Error(`${label}: sign-in produced no session.`);
  const minted = await form(`/v1/client/sessions/${sessionId}/tokens?${query}`, undefined, trusted.cookie ?? trustPrepared.cookie);
  const jwt = minted.payload?.jwt as string | undefined;
  if (!jwt) throw new Error(`${label}: the session produced no token.`);
  return { label, id: user.id, email, token: jwt };
}

type Reply = { status: number; body: any };

/**
 * A cold hosted PostgREST round trip can exceed the 5-second route timeout, which the
 * API reports as 504. One retry distinguishes that from a real failure, as recorded in
 * doc11; the retry is only used for requests that have no additional side effect.
 */
async function call(method: string, path: string, token: string, body?: unknown, retries = 0): Promise<Reply> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  const reply = { status: response.status, body: parsed };
  if (retries > 0 && reply.status === 504) return call(method, path, token, body, retries - 1);
  return reply;
}

/** A public catalog page supplies real project IDs for concrete additions. */
async function candidateProjects(): Promise<string[]> {
  const pages = [0, 20];
  const ids: string[] = [];
  for (const offset of pages) {
    const response = await fetch(`${apiUrl}/mods?gameVersion=1.21.1&loader=fabric&offset=${offset}`);
    if (!response.ok) throw new Error(`the catalog page failed with ${response.status}`);
    const page = (await response.json()) as { hits?: { projectId?: string }[] };
    for (const hit of page.hits ?? []) if (hit.projectId) ids.push(hit.projectId);
  }
  return ids;
}

type Addition = { versionIds: string[]; titles: string[] };

/**
 * Resolve one candidate project against the current selection and keep only what the
 * vote would add. Candidates that fail to resolve or add nothing are skipped, so the
 * check depends on the live catalog rather than on hardcoded version IDs.
 */
async function nextAddition(token: string, current: string[], candidates: string[], used: Set<string>): Promise<Addition> {
  for (const projectId of candidates) {
    if (used.has(projectId)) continue;
    const resolved = await call("POST", "/packs/resolve", token,
      { projectId, gameVersion: "1.21.1", loader: "fabric", versionIds: current }, 1);
    if (resolved.status !== 200) continue;
    const versions = (resolved.body?.versions ?? []) as { id: string; projectTitle?: string }[];
    const addition = versions.filter((version) => !current.includes(version.id));
    if (addition.length === 0) continue;
    used.add(projectId);
    return { versionIds: addition.map((version) => version.id),
      titles: addition.map((version) => version.projectTitle ?? "") };
  }
  throw new Error("no candidate project produced a usable addition");
}

const accounts: Account[] = [];
try {
  for (const label of ["owner", "member", "outsider"] as const) {
    accounts.push(await createAccount(label));
  }
  check("three real sessions were minted", accounts.length, 3);
  const [owner, member, outsider] = accounts;

  mkdirSync("/tmp/opencode", { recursive: true });
  writeFileSync(fixturesPath, JSON.stringify({
    run: suffix,
    accounts: accounts.map(({ label, id, email }) => ({ label, id, email })),
    usernames,
  }, null, 2));

  for (const account of accounts) {
    const created = await call("POST", "/profile", account.token,
      { username: usernames[account.label as keyof typeof usernames] });
    check(`${account.label} creates its profile`, created.status, 201);
  }
  writeFileSync(cleanupPath,
    `delete from public.profiles where user_id in (${accounts.map((a) => `'${a.id}'`).join(", ")});\n`);

  const createdGroup = await call("POST", "/groups", owner.token, { name: `Live Votes ${suffix}`, visibility: "public" }, 1);
  check("the owner creates the voting group with a real session",
    [createdGroup.status, createdGroup.body?.group?.role], [201, "owner"]);
  const groupId: string = createdGroup.body?.group?.id ?? "";

  const joined = await call("POST", `/groups/${groupId}/join`, member.token, undefined, 1);
  check("a second real session joins the group", [joined.status, joined.body?.group?.role], [200, "member"]);

  const other = await call("POST", "/groups", outsider.token, { name: `Live Votes Other ${suffix}`, visibility: "public" }, 1);
  check("a third real session creates its own group", other.status, 201);
  const outsiderGroupId: string = other.body?.group?.id ?? "";

  const candidates = await candidateProjects();
  check("the live catalog supplies candidate projects", candidates.length >= 3, true,
    `${candidates.length} project(s) on two pages`);

  // A real draft the votes can be opened against.
  const used = new Set<string>();
  const seed = await nextAddition(owner.token, [], candidates, used);
  const seeded = await call("PUT", "/groups/me/pack", owner.token,
    { gameVersion: "1.21.1", loader: "fabric", versionIds: seed.versionIds, expectedRevision: 0 }, 1);
  check("the owner stores a live draft selection", [seeded.status, seeded.body?.draft?.revision], [200, 1]);
  let selection: string[] = seeded.body?.draft?.versionIds ?? [];

  // Open, change a ballot, reach the majority, and read the pending obligation.
  const first = await nextAddition(owner.token, selection, candidates, used);
  const opened = await call("POST", "/groups/me/votes", owner.token, {
    gameVersion: "1.21.1", loader: "fabric", addVersionIds: first.versionIds,
    durationHours: 24, expectedDraftRevision: 1,
  }, 1);
  const voteId: string = opened.body?.id ?? "";
  check("the owner opens a vote for a live concrete addition",
    [opened.status, opened.body?.status, opened.body?.electorateSize], [200, "open", 2]);
  check("the vote stores the proposal titles read from the catalog",
    (opened.body?.proposal ?? []).map((item: any) => item.versionId), first.versionIds);

  const memberBallot = await call("POST", `/groups/me/votes/${voteId}/ballots`, member.token, { value: "approve" }, 1);
  check("a member approves and the vote stays open",
    [memberBallot.status, memberBallot.body?.approveCount, memberBallot.body?.status], [200, 1, "open"]);
  const changed = await call("POST", `/groups/me/votes/${voteId}/ballots`, member.token, { value: "reject" }, 1);
  check("the member replaces their own ballot",
    [changed.status, changed.body?.approveCount, changed.body?.rejectCount], [200, 0, 1]);
  const restored = await call("POST", `/groups/me/votes/${voteId}/ballots`, member.token, { value: "approve" }, 1);
  check("the restored ballot counts once", [restored.body?.approveCount, restored.body?.rejectCount], [1, 0]);

  const memberCancel = await call("POST", `/groups/me/votes/${voteId}/cancel`, member.token, undefined, 1);
  check("a member cannot cancel an open vote",
    [memberCancel.status, memberCancel.body?.error], [403, "Only the group owner may cancel votes."]);

  const approved = await call("POST", `/groups/me/votes/${voteId}/ballots`, owner.token, { value: "approve" }, 1);
  check("the absolute majority approves the vote immediately",
    [approved.status, approved.body?.status, typeof approved.body?.resolvedAt], [200, "approved", "string"]);
  check("approval edits no draft", ((await call("GET", "/groups/me/pack", owner.token, undefined, 1)).body?.draft?.versionIds), selection);

  const pendingList = await call("GET", "/groups/me/votes?limit=20", member.token, undefined, 1);
  const pendingVote = (pendingList.body?.votes ?? []).find((vote: any) => vote.id === voteId);
  check("the pending obligation reads from the vote list",
    [pendingList.status, pendingVote?.status, pendingVote?.incorporatedAt], [200, "approved", null]);

  const savedAgain = await call("PUT", "/groups/me/pack", owner.token,
    { gameVersion: "1.21.1", loader: "fabric", versionIds: selection, expectedRevision: 1 }, 1);
  check("a draft save is accepted while the obligation is pending",
    [savedAgain.status, savedAgain.body?.draft?.revision], [200, 2]);
  const stillPending = await call("GET", "/groups/me/votes?limit=20", member.token, undefined, 1);
  const unchangedObligation = (stillPending.body?.votes ?? []).find((vote: any) => vote.id === voteId);
  check("the draft save does not discharge the obligation", unchangedObligation?.incorporatedAt, null);

  const stale = await call("POST", `/groups/me/votes/${voteId}/incorporate`, owner.token, { expectedRevision: 1 }, 1);
  check("a stale revision is refused", [stale.status, stale.body?.error], [409, "Draft revision conflict."]);

  const incorporated = await call("POST", `/groups/me/votes/${voteId}/incorporate`, owner.token, { expectedRevision: 2 }, 1);
  check("the current owner incorporates the approved addition",
    [incorporated.status, incorporated.body?.draft?.revision, incorporated.body?.vote?.incorporatedAt !== null], [200, 3, true]);
  const appended = incorporated.body?.draft?.versionIds as string[];
  check("the draft gained the pinned addition without rewriting the selection",
    [appended.slice(0, selection.length), appended.slice(selection.length)], [selection, first.versionIds]);
  selection = appended;

  const twice = await call("POST", `/groups/me/votes/${voteId}/incorporate`, owner.token, { expectedRevision: 3 }, 1);
  check("an incorporated vote cannot be incorporated twice",
    [twice.status, twice.body?.error], [409, "Vote is already incorporated."]);

  // Two approved votes for one addition: the first appends, the second is satisfied.
  const second = await nextAddition(owner.token, selection, candidates, used);
  const firstDuplicate = await call("POST", "/groups/me/votes", owner.token, {
    gameVersion: "1.21.1", loader: "fabric", addVersionIds: second.versionIds, durationHours: 24, expectedDraftRevision: 3 }, 1);
  const secondDuplicate = await call("POST", "/groups/me/votes", owner.token, {
    gameVersion: "1.21.1", loader: "fabric", addVersionIds: second.versionIds, durationHours: 24, expectedDraftRevision: 3 }, 1);
  check("two independent votes may propose one addition at once",
    [firstDuplicate.status, secondDuplicate.status, firstDuplicate.body?.id !== secondDuplicate.body?.id], [200, 200, true]);
  const duplicateIds = [firstDuplicate.body?.id as string, secondDuplicate.body?.id as string];
  for (const id of duplicateIds) {
    await call("POST", `/groups/me/votes/${id}/ballots`, member.token, { value: "approve" }, 1);
    await call("POST", `/groups/me/votes/${id}/ballots`, owner.token, { value: "approve" }, 1);
  }
  const duplicateApproved = await call("GET", "/groups/me/votes?limit=20", owner.token, undefined, 1);
  check("both duplicate votes reach the majority",
    duplicateIds.map((id) => (duplicateApproved.body?.votes ?? []).find((vote: any) => vote.id === id)?.status),
    ["approved", "approved"]);

  const firstDischarge = await call("POST", `/groups/me/votes/${duplicateIds[0]}/incorporate`, owner.token, { expectedRevision: 3 }, 1);
  check("the first approved duplicate appends the addition",
    [firstDischarge.status, firstDischarge.body?.draft?.revision], [200, 4]);
  const satisfied = await call("POST", `/groups/me/votes/${duplicateIds[1]}/incorporate`, owner.token, { expectedRevision: 4 }, 1);
  check("the second approved duplicate is satisfied without rewriting the draft",
    [satisfied.status, satisfied.body?.draft?.revision, satisfied.body?.vote?.incorporatedAt !== null,
      satisfied.body?.draft?.versionIds?.includes(second.versionIds[0])], [200, 4, true, true]);
  check("a satisfied addition is stored once",
    (satisfied.body?.draft?.versionIds ?? []).filter((id: string) => id === second.versionIds[0]).length, 1);
  selection = satisfied.body?.draft?.versionIds ?? selection;

  // Cancellation is terminal and adds nothing.
  const third = await nextAddition(owner.token, selection, candidates, used);
  const cancellable = await call("POST", "/groups/me/votes", owner.token, {
    gameVersion: "1.21.1", loader: "fabric", addVersionIds: third.versionIds, durationHours: 24, expectedDraftRevision: 4 }, 1);
  const cancelled = await call("POST", `/groups/me/votes/${cancellable.body?.id}/cancel`, owner.token, undefined, 1);
  check("the owner cancels an open vote", [cancelled.status, cancelled.body?.status], [200, "cancelled"]);
  const ballotAfterCancel = await call("POST", `/groups/me/votes/${cancellable.body?.id}/ballots`, member.token, { value: "approve" }, 1);
  check("a cancelled vote accepts no ballot",
    [ballotAfterCancel.status, ballotAfterCancel.body?.error], [409, "This vote is already closed."]);
  const incorporateCancelled = await call("POST", `/groups/me/votes/${cancellable.body?.id}/incorporate`, owner.token, { expectedRevision: 4 }, 1);
  check("a cancelled vote is never incorporated",
    [incorporateCancelled.status, incorporateCancelled.body?.error], [409, "Vote is not approved."]);

  // The obligation belongs to the group: the current owner discharges it.
  const fourth = await nextAddition(owner.token, selection, candidates, used);
  const transferable = await call("POST", "/groups/me/votes", owner.token, {
    gameVersion: "1.21.1", loader: "fabric", addVersionIds: fourth.versionIds, durationHours: 24, expectedDraftRevision: 4 }, 1);
  const transferableId: string = transferable.body?.id ?? "";
  await call("POST", `/groups/me/votes/${transferableId}/ballots`, member.token, { value: "approve" }, 1);
  await call("POST", `/groups/me/votes/${transferableId}/ballots`, owner.token, { value: "approve" }, 1);
  const handedOver = await call("POST", "/groups/me/ownership", owner.token, { userId: member.id }, 1);
  check("the owner transfers the group with a pending obligation",
    [handedOver.status, handedOver.body?.group?.role], [200, "member"]);
  const previousOwner = await call("POST", `/groups/me/votes/${transferableId}/incorporate`, owner.token, { expectedRevision: 4 }, 1);
  check("the previous owner cannot discharge the obligation",
    [previousOwner.status, previousOwner.body?.error], [403, "Only the group owner may incorporate votes."]);
  const transferred = await call("POST", `/groups/me/votes/${transferableId}/incorporate`, member.token, { expectedRevision: 4 }, 1);
  check("the new owner discharges the transferred obligation",
    [transferred.status, transferred.body?.draft?.revision, transferred.body?.vote?.incorporatedAt !== null], [200, 5, true]);
  selection = transferred.body?.draft?.versionIds ?? selection;
  const returned = await call("POST", "/groups/me/ownership", member.token, { userId: owner.id }, 1);
  check("the group is transferred back to the original owner",
    [returned.status, returned.body?.group?.role], [200, "member"]);

  const left = await call("DELETE", "/groups/me/membership", member.token, undefined, 1);
  check("the member leaves a group that survives", [left.status, left.body?.groupDeleted], [200, false]);
  const departedVotes = await call("GET", "/groups/me/votes", member.token, undefined, 1);
  check("a previous member cannot read the group votes",
    [departedVotes.status, departedVotes.body?.error], [404, "Group required."]);

  const outsiderVotes = await call("GET", "/groups/me/votes", outsider.token, undefined, 1);
  check("a caller in another group sees no foreign votes",
    [outsiderVotes.status, outsiderVotes.body?.votes?.length], [200, 0]);

  // Close both groups through the API so only profiles need SQL cleanup.
  const deleted = await call("DELETE", "/groups/me/membership", owner.token, undefined, 1);
  check("the sole owner leaving deletes the group and its votes",
    [deleted.status, deleted.body?.groupDeleted], [200, true]);
  const outsiderDeleted = await call("DELETE", "/groups/me/membership", outsider.token, undefined, 1);
  check("the other group is closed as well", [outsiderDeleted.status, outsiderDeleted.body?.groupDeleted], [200, true]);

  // The live catalog stays the only source of version IDs; record what was used.
  writeFileSync(fixturesPath, JSON.stringify({
    run: suffix, groupId, outsiderGroupId,
    accounts: accounts.map(({ label, id, email }) => ({ label, id, email })),
    usernames, versionCount: selection.length,
  }, null, 2));
} catch (error) {
  failures.push(`run aborted: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const id of createdUserIds) {
    try { await clerkApi("DELETE", `/users/${id}`); }
    catch (error) { failures.push(`could not delete ${id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
}

console.log(failures.length
  ? `\n${failures.length} check(s) failed:\n${failures.join("\n")}`
  : "\nAll live voting checks passed.");
console.log(`\nprofiles still exist for these accounts; run the cleanup before relying on an empty database:\n  ${cleanupPath}`);
process.exit(failures.length ? 1 : 0);
