/**
 * Live group lifecycle check with real Clerk sessions against the hosted database.
 *
 * Proves the hosted chain the local stack cannot: one real Clerk session token is
 * accepted by Hono and forwarded to PostgREST, where the group RPCs arbitrate the
 * approved lifecycle. It creates disposable `+clerk_test` accounts, signs each one in
 * for a real session token, and exercises public admission, member pages, owner-only
 * refusals, immediate ownership transfer, both departure paths, and the private
 * invitation path with approval, rejection, rotation and revocation. Every group is
 * removed through the API; only the account profiles need a SQL cleanup, which the
 * script writes to a file and never runs itself.
 *
 * It mutates provider state (accounts) and hosted database state (profiles and groups).
 * It refuses to run without --live, refuses non-development credentials, refuses a
 * local Supabase URL, and prints no secret, password, token or full e-mail address.
 *
 * Usage: bun scripts/test-group-session.ts --live
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

if (!live) stop("this check creates real test accounts and group rows; pass --live to run it.");
if (!secret.startsWith("sk_test_")) stop("CLERK_SECRET_KEY must be a development-instance key.");
if (!publishable.startsWith("pk_test_")) stop("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a development-instance key.");
if (!databaseUrl.startsWith("https://")) stop("SUPABASE_URL must be the hosted project; use db:test:postgrest locally.");
if (!databaseKey.startsWith("sb_publishable_") && !databaseKey.startsWith("eyJ")) {
  stop("SUPABASE_PUBLISHABLE_KEY is missing.");
}

const fapi = `https://${Buffer.from(publishable.slice("pk_test_".length), "base64").toString("utf8").replace(/\$$/, "")}`;
const suffix = Date.now().toString(36).slice(-6);
const usernames = { owner: `Lc${suffix}O`, member: `Lc${suffix}M`, requester: `Lc${suffix}R` };
const password = `Lifecycle-${crypto.randomUUID()}`;
const fixturesPath = "/tmp/opencode/m5-group-session-fixtures.json";
const cleanupPath = "/tmp/opencode/m5-group-session-cleanup.sql";

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
  return { status: response.status, payload, cookie: cookieOf(response), codes: payload?.errors?.map((error: any) => error.code) as string[] | undefined };
}

type Account = { label: string; id: string; email: string; token: string };

async function createAccount(label: string): Promise<Account> {
  const email = `modpack.groups.${label}.${suffix}${Date.now().toString(36).slice(-4)}+clerk_test@example.com`;
  const user = (await clerkApi("POST", "/users", {
    email_address: [email], password, first_name: "Group", last_name: label,
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

type Reply = { status: number; body: any; cache: string | null };

async function call(method: string, path: string, token: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: any = null;
  const text = await response.text();
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed, cache: response.headers.get("cache-control") };
}

const accounts: Account[] = [];
const createdUserIds: string[] = [];
try {
  for (const label of ["owner", "member", "requester"] as const) {
    accounts.push(await createAccount(label));
  }
  check("three real sessions were minted", accounts.length, 3);
  const [owner, member, requester] = accounts;

  mkdirSync("/tmp/opencode", { recursive: true });
  writeFileSync(fixturesPath, JSON.stringify({
    run: suffix,
    accounts: accounts.map(({ label, id, email }) => ({ label, id, email })),
    usernames,
  }, null, 2));

  // Profiles through the real interface; there is no profile delete route.
  for (const account of accounts) {
    const created = await call("POST", "/profile", account.token, { username: usernames[account.label as keyof typeof usernames] });
    check(`${account.label} creates its profile`, created.status, 201);
  }
  writeFileSync(cleanupPath,
    `delete from public.profiles where user_id in (${accounts.map((a) => `'${a.id}'`).join(", ")});\n`);

  const direct = await fetch(`${databaseUrl}/rest/v1/groups?select=id`, {
    headers: { apikey: databaseKey, Authorization: `Bearer ${owner.token}` },
  });
  check("hosted tables stay closed even for a real session token", [401, 403].includes(direct.status), true);

  // Public admission.
  const created = await call("POST", "/groups", owner.token, { name: `Live Public ${suffix}`, visibility: "public" });
  check("the owner creates a public group with a real session", [created.status, created.body?.group?.role], [201, "owner"]);
  const groupId: string = created.body?.group?.id ?? "";

  const joined = await call("POST", `/groups/${groupId}/join`, member.token);
  check("a second real session joins the public group directly", [joined.status, joined.body?.group?.role, joined.body?.group?.memberCount], [200, "member", 2]);

  const invitationOnPublic = await call("POST", "/groups/me/invitation", member.token);
  check("a member cannot create an invitation", [invitationOnPublic.status, invitationOnPublic.body?.error],
    [403, "Only the owner can perform this action."]);

  const memberRequests = await call("GET", "/groups/me/requests", member.token);
  check("a member cannot read the pending-request page", [memberRequests.status, memberRequests.body?.error],
    [403, "Only the owner can perform this action."]);

  const memberPage = await call("GET", "/groups/me/members?limit=1", member.token);
  check("a member reads a bounded member page with a cursor",
    [memberPage.status, memberPage.body?.members?.length, typeof memberPage.body?.nextCursor], [200, 1, "string"]);

  // Immediate ownership transfer without acceptance.
  const transferred = await call("POST", "/groups/me/ownership", owner.token, { userId: member.id });
  check("the owner transfers ownership to the member",
    [transferred.status, transferred.body?.group?.role, transferred.body?.group?.ownerId], [200, "member", member.id]);
  const newOwner = await call("GET", "/groups/me", member.token);
  check("the new owner reads the owner role immediately",
    [newOwner.status, newOwner.body?.group?.role, newOwner.body?.group?.ownerId], [200, "owner", member.id]);

  const blockedLeave = await call("DELETE", "/groups/me/membership", member.token);
  check("an owner with other members cannot leave",
    [blockedLeave.status, blockedLeave.body?.error],
    [409, "Transfers are required before leaving a group with other members."]);

  const left = await call("DELETE", "/groups/me/membership", owner.token);
  check("the previous owner leaves as a member", [left.status, left.body?.groupDeleted], [200, false]);
  const departed = await call("GET", "/groups/me", owner.token);
  check("the departing member loses access immediately", [departed.status, departed.body], [200, { group: null }]);

  const deleted = await call("DELETE", "/groups/me/membership", member.token);
  check("the sole owner leaving deletes the group", [deleted.status, deleted.body?.groupDeleted], [200, true]);

  // Private invitation, approval, rejection, rotation and revocation.
  const privateGroup = await call("POST", "/groups", requester.token, { name: `Live Private ${suffix}`, visibility: "private" });
  check("a real session creates a private group", [privateGroup.status, privateGroup.body?.group?.visibility], [201, "private"]);

  const issued = await call("POST", "/groups/me/invitation", requester.token);
  const firstToken: string = issued.body?.invitation?.token ?? "";
  check("the owner issues an invitation", [issued.status, /^[a-f0-9]{64}$/.test(firstToken)], [201, true]);

  const resolved = await call("GET", `/groups/invitations/${firstToken}`, owner.token);
  check("the token holder resolves the group without membership",
    [resolved.status, resolved.body?.invitation?.member, resolved.body?.invitation?.requested], [200, false, false]);

  const requested = await call("POST", `/groups/invitations/${firstToken}/requests`, owner.token);
  check("the token holder creates a pending request", [requested.status, requested.body?.request?.status], [201, "pending"]);

  const ownerView = await call("GET", "/groups/me", requester.token);
  check("the owner sees the pending requester",
    [ownerView.status, ownerView.body?.group?.requests?.map((item: any) => item.userId)], [200, [owner.id]]);

  const approved = await call("POST", `/groups/me/requests/${owner.id}/approve`, requester.token);
  check("the owner approves the request", [approved.status, approved.body?.group?.memberCount], [200, 2]);
  const approvedRead = await call("GET", "/groups/me", owner.token);
  check("the approved user reads the member role immediately", [approvedRead.status, approvedRead.body?.group?.role], [200, "member"]);

  const redecided = await call("POST", `/groups/me/requests/${owner.id}/reject`, requester.token);
  check("a decided request cannot be rejected", [redecided.status, redecided.body?.error], [404, "Request not found."]);

  const rotated = await call("POST", "/groups/me/invitation", requester.token);
  const rotatedToken: string = rotated.body?.invitation?.token ?? "";
  check("rotation issues a new token", [rotated.status, rotatedToken !== firstToken], [201, true]);
  const staleResolve = await call("GET", `/groups/invitations/${firstToken}`, owner.token);
  check("the rotated token stops resolving", [staleResolve.status, staleResolve.body?.error], [404, "Invitation is invalid."]);

  const revoked = await call("DELETE", "/groups/me/invitation", requester.token);
  check("the owner revokes the current invitation", [revoked.status, revoked.body], [200, { invitation: null }]);
  const revokedResolve = await call("GET", `/groups/invitations/${rotatedToken}`, owner.token);
  check("the revoked token stops resolving", [revokedResolve.status, revokedResolve.body?.error], [404, "Invitation is invalid."]);

  // Close both groups through the API so only profiles need SQL cleanup.
  const memberLeaves = await call("DELETE", "/groups/me/membership", owner.token);
  check("the private group member leaves", [memberLeaves.status, memberLeaves.body?.groupDeleted], [200, false]);
  const privateDeleted = await call("DELETE", "/groups/me/membership", requester.token);
  check("the private group owner leaves and deletes it", [privateDeleted.status, privateDeleted.body?.groupDeleted], [200, true]);
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
  : "\nAll live group lifecycle checks passed.");
console.log(`\nprofiles still exist for these accounts; run the cleanup before relying on an empty database:\n  ${cleanupPath}`);
process.exit(failures.length ? 1 : 0);
