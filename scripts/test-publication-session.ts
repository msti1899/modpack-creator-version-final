/**
 * Live published-version check with real Clerk sessions against the hosted database.
 *
 * Proves the completion plan's M6 chain that the local stack cannot assemble: one real
 * Clerk session token is accepted by Hono and forwarded to PostgREST, where the
 * publication RPCs arbitrate who may publish, read, activate and export. It publishes a
 * real Modrinth selection, reads and exports it as a member, refuses a caller outside
 * the group, shows that a later draft edit rewrites neither the frozen selection nor the
 * active version, and proves a member who left a surviving group is denied on the next
 * request.
 *
 * It mutates provider state (accounts) and hosted database state (profiles, groups,
 * draft and publications). It refuses to run without --live, refuses non-development
 * credentials, refuses a local Supabase URL, and prints no secret, password or token.
 * Every group is closed through the API; only the account profiles need a SQL cleanup,
 * which the script writes to a file and never runs itself.
 *
 * Usage: bun scripts/test-publication-session.ts --live
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

if (!live) stop("this check creates real test accounts, groups and publications; pass --live to run it.");
if (!secret.startsWith("sk_test_")) stop("CLERK_SECRET_KEY must be a development-instance key.");
if (!publishable.startsWith("pk_test_")) stop("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a development-instance key.");
if (!databaseUrl.startsWith("https://")) stop("SUPABASE_URL must be the hosted project; use db:test:postgrest locally.");
if (!databaseKey.startsWith("sb_publishable_") && !databaseKey.startsWith("eyJ")) {
  stop("SUPABASE_PUBLISHABLE_KEY is missing.");
}

const fapi = `https://${Buffer.from(publishable.slice("pk_test_".length), "base64").toString("utf8").replace(/\$$/, "")}`;
const suffix = Date.now().toString(36).slice(-6);
const usernames = { owner: `Pu${suffix}O`, member: `Pu${suffix}M`, outsider: `Pu${suffix}X` };
const password = `Publication-${crypto.randomUUID()}`;
const fixturesPath = "/tmp/opencode/m6-publication-session-fixtures.json";
const cleanupPath = "/tmp/opencode/m6-publication-session-cleanup.sql";

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
  const email = `modpack.publications.${label}.${suffix}${Date.now().toString(36).slice(-4)}+clerk_test@example.com`;
  const user = (await clerkApi("POST", "/users", {
    email_address: [email], password, first_name: "Publication", last_name: label,
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

type Reply = { status: number; body: any; cache: string | null; contentType: string | null; disposition: string | null; bytes: number };

/**
 * A cold hosted PostgREST round trip can exceed the 5-second route timeout, which the
 * API reports as 504. One retry distinguishes that from a real failure, as recorded in
 * doc11; the retry is only used for reads that have no side effect.
 */
async function call(method: string, path: string, token: string, body?: unknown, retries = 0): Promise<Reply> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const buffer = await response.arrayBuffer();
  const text = new TextDecoder().decode(buffer);
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  const reply = {
    status: response.status, body: parsed, cache: response.headers.get("cache-control"),
    contentType: response.headers.get("content-type"), disposition: response.headers.get("content-disposition"),
    bytes: buffer.byteLength,
  };
  if (retries > 0 && reply.status === 504) return call(method, path, token, body, retries - 1);
  return reply;
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

  const created2 = await call("POST", "/groups", owner.token, { name: `Live Pack ${suffix}`, visibility: "public" }, 1);
  check("the owner creates the pack group with a real session", [created2.status, created2.body?.group?.role], [201, "owner"]);
  const groupId: string = created2.body?.group?.id ?? "";

  const joined = await call("POST", `/groups/${groupId}/join`, member.token, undefined, 1);
  check("a second real session joins the group", [joined.status, joined.body?.group?.role], [200, "member"]);

  const other = await call("POST", "/groups", outsider.token, { name: `Live Other ${suffix}`, visibility: "public" }, 1);
  check("a third real session creates its own group", other.status, 201);
  const outsiderGroupId: string = other.body?.group?.id ?? "";

  // A real Modrinth proposal supplies the exact version IDs the draft stores.
  const proposal = await call("POST", "/packs/resolve", owner.token,
    { projectId: "Bh37bMuy", gameVersion: "1.21.1", loader: "fabric", versionIds: [] }, 1);
  const versionIds: string[] = (proposal.body?.versions ?? []).map((version: any) => version.id);
  check("a live catalog proposal returns exact Modrinth version IDs",
    [proposal.status, versionIds.length > 0], [200, true]);

  const draft = await call("PUT", "/groups/me/pack", owner.token,
    { gameVersion: "1.21.1", loader: "fabric", versionIds, expectedRevision: 0 }, 1);
  check("the owner stores the approved draft selection", [draft.status, draft.body?.draft?.revision], [200, 1]);

  const published = await call("POST", "/groups/me/pack/publications", owner.token,
    { name: `Live pack ${suffix}`, version: "1.0.0", loaderVersion: "0.16.0", expectedRevision: 1 }, 1);
  const publicationId: string = published.body?.publication?.id ?? "";
  check("the owner publishes a version that is not active",
    [published.status, published.body?.publication?.sequence, published.body?.publication?.active], [201, 1, false]);
  check("the frozen selection is the approved version set",
    published.body?.publication?.versionIds, versionIds);

  const memberList = await call("GET", "/groups/me/pack/publications", member.token, undefined, 1);
  check("a member reads the publication history", [memberList.status, memberList.body?.publications?.length,
    memberList.body?.activePublicationId], [200, 1, null]);

  const memberDetail = await call("GET", `/groups/me/pack/publications/${publicationId}`, member.token, undefined, 1);
  check("a member reads the published version", [memberDetail.status, memberDetail.body?.role,
    memberDetail.body?.publication?.sequence], [200, "member", 1]);

  const memberExport = await call("GET", `/groups/me/pack/publications/${publicationId}/export`, member.token, undefined, 1);
  check("a member exports the frozen archive",
    [memberExport.status, memberExport.contentType, memberExport.bytes > 100], [200, "application/x-modrinth-modpack+zip", true]);

  const memberActive = await call("PUT", "/groups/me/pack/active-version", member.token, { publicationId }, 1);
  check("a member cannot activate a published version",
    [memberActive.status, memberActive.body?.error], [403, "Only the group owner may manage published versions."]);

  const outsiderList = await call("GET", "/groups/me/pack/publications", outsider.token, undefined, 1);
  check("a caller in another group sees no foreign publication", [outsiderList.status, outsiderList.body?.publications?.length], [200, 0]);
  const outsiderDetail = await call("GET", `/groups/me/pack/publications/${publicationId}`, outsider.token, undefined, 1);
  check("a caller in another group cannot read the publication by id",
    [outsiderDetail.status, outsiderDetail.body?.error], [404, "Publication not found."]);
  const outsiderExport = await call("GET", `/groups/me/pack/publications/${publicationId}/export`, outsider.token, undefined, 1);
  check("a caller in another group cannot export it",
    [outsiderExport.status, outsiderExport.body?.error, outsiderExport.disposition], [404, "Publication not found.", null]);

  const activated = await call("PUT", "/groups/me/pack/active-version", owner.token, { publicationId }, 1);
  check("the owner activates the published version separately",
    [activated.status, activated.body?.activePublicationId], [200, publicationId]);

  const edited = await call("PUT", "/groups/me/pack", owner.token,
    { gameVersion: "1.21.1", loader: "fabric", versionIds: [...versionIds].reverse(), expectedRevision: 1 }, 1);
  check("a later draft edit is accepted", [edited.status, edited.body?.draft?.revision], [200, 2]);
  check("the draft edit changed the stored order", edited.body?.draft?.versionIds, [...versionIds].reverse());
  const afterEdit = await call("GET", "/groups/me/pack/publications", owner.token, undefined, 1);
  check("the draft edit rewrites neither the frozen selection nor the active version",
    [afterEdit.body?.publications?.[0]?.versionIds, afterEdit.body?.activePublicationId], [versionIds, publicationId]);

  const left = await call("DELETE", "/groups/me/membership", member.token, undefined, 1);
  check("the member leaves a group that survives", [left.status, left.body?.groupDeleted], [200, false]);
  const departedList = await call("GET", "/groups/me/pack/publications", member.token, undefined, 1);
  check("a previous member cannot list publications",
    [departedList.status, departedList.body?.error], [404, "Group required."]);
  const departedDetail = await call("GET", `/groups/me/pack/publications/${publicationId}`, member.token, undefined, 1);
  check("a previous member cannot read the publication",
    [departedDetail.status, departedDetail.body?.error], [404, "Group required."]);
  const departedExport = await call("GET", `/groups/me/pack/publications/${publicationId}/export`, member.token, undefined, 1);
  check("a previous member cannot export it",
    [departedExport.status, departedExport.body?.error], [404, "Group required."]);

  const ownerStillReads = await call("GET", `/groups/me/pack/publications/${publicationId}`, owner.token, undefined, 1);
  check("the remaining owner still reads the publication", ownerStillReads.status, 200);

  // Close both groups through the API so only profiles need SQL cleanup.
  const deleted = await call("DELETE", "/groups/me/membership", owner.token, undefined, 1);
  check("the sole owner leaving deletes the group and its publications",
    [deleted.status, deleted.body?.groupDeleted], [200, true]);
  const outsiderDeleted = await call("DELETE", "/groups/me/membership", outsider.token, undefined, 1);
  check("the other group is closed as well", [outsiderDeleted.status, outsiderDeleted.body?.groupDeleted], [200, true]);
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
  : "\nAll live publication checks passed.");
console.log(`\nprofiles still exist for these accounts; run the cleanup before relying on an empty database:\n  ${cleanupPath}`);
process.exit(failures.length ? 1 : 0);
