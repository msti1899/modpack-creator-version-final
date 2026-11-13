// Signed-token lifecycle checks against the local PostgREST surface.
//
// The production request path is Clerk token -> Hono -> PostgREST with the caller's
// token forwarded. Locally the two validators cannot share one signing key: Hono
// accepts only an RSA public key and the local PostgREST accepts only the stack's
// symmetric secret. This script therefore proves the PostgREST half with locally
// signed tokens, which is real database-side evidence and explicitly not hosted Clerk
// proof. Hono's own forwarding and status mapping stay covered by its unit tests.
//
// The suite exercises the approved group lifecycle end to end on that surface: public
// direct admission, private invitation plus request and approval, rejection, rotation
// and revocation, pages, immediate ownership transfer and departure. Every check names
// the observed result, so a regression that changes access or visibility fails here.
//
// Local disposable stack only. No arguments, no connection string, no forwarded flags.

if (process.argv.length !== 2) {
  console.error("Usage: bun run db:test:postgrest (local Docker stack only; no arguments)");
  process.exit(64);
}

const root = new URL("..", import.meta.url).pathname;
const docker = ["docker", "--host=unix:///var/run/docker.sock"] as const;

const status = Bun.spawnSync([`${root}node_modules/.bin/supabase`, "status", "-o", "env", "--workdir", root], {
  timeout: 120_000,
  env: { ...process.env, PATH: `${process.env.PATH ?? ""}:/usr/bin:/bin` },
});
if (status.exitCode !== 0) {
  console.error("The local stack is not running. Start it with bun run db:start.");
  process.exit(1);
}
const settings = new Map<string, string>();
for (const line of status.stdout.toString().split("\n")) {
  const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
  if (match) settings.set(match[1], match[2]);
}
const restUrl = settings.get("REST_URL");
const apiKey = settings.get("PUBLISHABLE_KEY") ?? settings.get("ANON_KEY");
const jwtSecret = settings.get("JWT_SECRET");
if (!restUrl || !apiKey || !jwtSecret) {
  console.error("The local stack did not report REST_URL, a publishable key and JWT_SECRET.");
  process.exit(1);
}

const configText = await Bun.file(new URL("../supabase/config.toml", import.meta.url)).text();
const projectId = /^project_id\s*=\s*"([a-z0-9-]+)"$/m.exec(configText)?.[1];
if (!projectId) {
  console.error("supabase/config.toml does not declare a project_id.");
  process.exit(1);
}
const container = `supabase_db_${projectId}`;

const subjects = {
  owner: "user_lcowner",
  member: "user_lcmember",
  third: "user_lcthird",
  outside: "user_lcoutside",
  owner2: "user_lcowner2",
  requester: "user_lcrequester",
  rejectee: "user_lcrejectee",
} as const;
const usernames: Record<string, string> = {
  [subjects.owner]: "LcOwner",
  [subjects.member]: "LcMember",
  [subjects.third]: "LcThird",
  [subjects.outside]: "LcOutside",
  [subjects.owner2]: "LcOwner2",
  [subjects.requester]: "LcRequester",
  [subjects.rejectee]: "LcRejectee",
};
const subjectList = Object.values(subjects).map((value) => `'${value}'`).join(", ");

function base64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintToken(secret: string, sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub, role: "authenticated", iat: now, exp: now + 300 }));
  // HMAC-SHA256 over header.payload using the stack's own signing secret.
  const key = new Bun.CryptoHasher("sha256", secret);
  key.update(`${header}.${payload}`);
  return `${header}.${payload}.${base64url(key.digest())}`;
}

async function psql(sql: string): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(
    [...docker, "exec", "-i", container, "psql", "-X", "-q", "-t", "-A",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
    { stdin: new TextEncoder().encode(sql), stdout: "pipe", stderr: "pipe" },
  );
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  return { code, out: out.trim(), err: err.trim() };
}

async function psqlCount(sql: string): Promise<number> {
  const result = await psql(sql);
  if (result.code !== 0) throw new Error(`psql failed: ${result.err}`);
  return Number(result.out);
}

type Probe = { status: number; body: string };

async function post(path: string, token: string | null, body: unknown): Promise<Probe> {
  const headers: Record<string, string> = { apikey: apiKey!, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${restUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.text() };
}

async function get(path: string, token: string): Promise<Probe> {
  const response = await fetch(`${restUrl}${path}`, {
    headers: { apikey: apiKey!, Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.text() };
}

const tokens = Object.fromEntries(
  Object.entries(subjects).map(([key, subject]) => [key, mintToken(jwtSecret!, subject)]),
) as Record<keyof typeof subjects, string>;

function rpc(operation: string, token: string, args: Record<string, unknown> = {}): Promise<Probe> {
  return post(`/rpc/${operation}`, token, args);
}

function readJson(probe: Probe): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(probe.body);
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const failures: string[] = [];
function expect(held: boolean, message: string, detail: string): void {
  console.log(`${held ? "PASS" : "FAIL"} ${message}`);
  if (!held) failures.push(`${message} — ${detail}`);
}

function expectRefused(probe: Probe, message: string, expected: string): void {
  const body = readJson(probe);
  expect(probe.status === 400 && body?.code === "P0001" && body?.message === expected,
    message, `status=${probe.status} body=${probe.body.slice(0, 200)}`);
}

// PostgREST returns each RPC's raw jsonb value, not the Hono response envelope.
function expectOverview(probe: Probe, message: string): Record<string, unknown> | null {
  const body = readJson(probe);
  const held = probe.status === 200 && body !== null && typeof body.id === "string" &&
    Array.isArray(body.members) && typeof body.role === "string";
  expect(held, message, `status=${probe.status} body=${probe.body.slice(0, 200)}`);
  return held ? body : null;
}

const forged = mintToken("not-the-stack-secret-but-long-enough", subjects.owner);

try {
  await psql(`
    insert into public.profiles (user_id, username) values
      ${Object.entries(usernames).map(([id, name]) => `('${id}', '${name}')`).join(", ")};
  `);

  // Public direct admission and idempotence.
  const created = expectOverview(await rpc("create_group", tokens.owner,
    { p_name: "Postgrest Public", p_visibility: "public" }),
  "A signed token creates a public group through PostgREST");
  expect(created?.role === "owner" && created?.memberCount === 1,
    "The creator reads the owner role and one member",
    `body=${JSON.stringify(created)?.slice(0, 200)}`);
  const publicId = created?.id as string;

  const joined = expectOverview(await rpc("join_public_group", tokens.member, { p_group_id: publicId }),
    "A registered user joins the public group directly");
  expect(joined?.role === "member" && joined?.memberCount === 2,
    "The joiner reads the member role immediately",
    `body=${JSON.stringify(joined)?.slice(0, 200)}`);

  const rejoined = expectOverview(await rpc("join_public_group", tokens.member, { p_group_id: publicId }),
    "A repeated public join succeeds");
  expect(rejoined?.memberCount === 2,
    "A repeated public join adds no membership",
    `body=${JSON.stringify(rejoined)?.slice(0, 200)}`);

  expectOverview(await rpc("join_public_group", tokens.third, { p_group_id: publicId }),
    "A third user joins the public group");
  const thirdRejoin = expectOverview(await rpc("join_public_group", tokens.third, { p_group_id: publicId }),
    "A third user's repeated join succeeds");
  expect(thirdRejoin?.memberCount === 3,
    "A repeated join by an existing member adds no membership",
    `body=${JSON.stringify(thirdRejoin)?.slice(0, 200)}`);
  expectOverview(await rpc("create_group", tokens.outside,
    { p_name: "Postgrest Outside", p_visibility: "public" }),
  "A user outside the group creates their own public group");
  expectRefused(await rpc("join_public_group", tokens.outside, { p_group_id: publicId }),
    "A user already in a group cannot join another public group", "Already in a group.");

  const unauthenticated = await post("/rpc/create_group", null, { p_name: "Probe Two", p_visibility: "public" });
  expect(unauthenticated.status === 401,
    "PostgREST rejects a request without a token",
    `status=${unauthenticated.status} body=${unauthenticated.body.slice(0, 160)}`);

  const forgedResponse = await post("/rpc/create_group", forged, { p_name: "Probe Three", p_visibility: "public" });
  expect(forgedResponse.status === 401,
    "PostgREST rejects a token it did not sign",
    `status=${forgedResponse.status} body=${forgedResponse.body.slice(0, 160)}`);

  const direct = await get("/groups?select=id", tokens.owner);
  expect(direct.status === 403 || direct.status === 401,
    "tables stay closed even to a valid token",
    `status=${direct.status} body=${direct.body.slice(0, 160)}`);

  // Member pages cross cursors and keep the requested bound.
  const firstPage = await post("/rpc/group_members_page", tokens.member, { p_limit: 1, p_cursor: null });
  const firstPageBody = readJson(firstPage);
  const firstMembers = firstPageBody?.members as unknown[] | undefined;
  const firstCursor = firstPageBody?.nextCursor as string | null | undefined;
  expect(firstPage.status === 200 && firstMembers?.length === 1 && typeof firstCursor === "string",
    "A member page returns one bounded page with a next cursor",
    `status=${firstPage.status} body=${firstPage.body.slice(0, 200)}`);

  const secondPage = await post("/rpc/group_members_page", tokens.member, { p_limit: 1, p_cursor: firstCursor });
  const secondPageBody = readJson(secondPage);
  const secondMembers = secondPageBody?.members as unknown[] | undefined;
  const secondCursor = secondPageBody?.nextCursor as string | null | undefined;
  expect(secondPage.status === 200 && secondMembers?.length === 1 &&
    (secondMembers[0] as Record<string, unknown>)?.userId !== (firstMembers?.[0] as Record<string, unknown>)?.userId,
  "The next member page continues after the cursor",
  `status=${secondPage.status} body=${secondPage.body.slice(0, 200)}`);

  const lastPage = await post("/rpc/group_members_page", tokens.member, { p_limit: 1, p_cursor: secondCursor });
  const lastPageBody = readJson(lastPage);
  expect(lastPage.status === 200 && (lastPageBody?.members as unknown[] | undefined)?.length === 1 &&
    lastPageBody?.nextCursor === null,
  "The last member page carries the remainder and no cursor",
  `status=${lastPage.status} body=${lastPage.body.slice(0, 200)}`);

  const clamped = await post("/rpc/group_members_page", tokens.member, { p_limit: 0, p_cursor: null });
  expect(clamped.status === 200 && (readJson(clamped)?.members as unknown[] | undefined)?.length === 1,
    "The database clamps a page limit below the minimum instead of failing",
    `status=${clamped.status} body=${clamped.body.slice(0, 200)}`);

  const pastEnd = await post("/rpc/group_members_page", tokens.member,
    { p_limit: 2, p_cursor: "9999999999999999.user_zzz" });
  const pastEndBody = readJson(pastEnd);
  expect(pastEnd.status === 200 && (pastEndBody?.members as unknown[] | undefined)?.length === 0 &&
    pastEndBody?.nextCursor === null,
  "A member page past the end is empty with no cursor",
  `status=${pastEnd.status} body=${pastEnd.body.slice(0, 200)}`);

  // Non-owner refusals on the real surface.
  expectRefused(await rpc("create_invitation", tokens.member),
    "A member cannot create an invitation", "Only the owner can perform this action.");
  expectRefused(await post("/rpc/group_requests_page", tokens.member, { p_limit: 50, p_cursor: null }),
    "A member cannot read the pending-request page", "Only the owner can perform this action.");
  expectRefused(await rpc("transfer_ownership", tokens.member, { p_user_id: subjects.owner }),
    "A member cannot transfer ownership", "Only the owner can perform this action.");
  expectRefused(await rpc("join_public_group", tokens.member, { p_group_id: "00000000-0000-4000-8000-000000000000" }),
    "A missing public group is reported", "Group not found.");

  // Immediate ownership transfer without acceptance.
  const transferred = expectOverview(await rpc("transfer_ownership", tokens.owner, { p_user_id: subjects.member }),
    "The owner transfers ownership to an existing member");
  expect(transferred?.role === "member" && transferred?.ownerId === subjects.member,
    "The previous owner reads the member role immediately",
    `body=${JSON.stringify(transferred)?.slice(0, 200)}`);

  const newOwner = expectOverview(await rpc("my_group", tokens.member),
    "The new owner reads the group back");
  expect(newOwner?.role === "owner" && newOwner?.ownerId === subjects.member,
    "The new owner reads the owner role immediately",
    `body=${JSON.stringify(newOwner)?.slice(0, 200)}`);

  expectRefused(await rpc("leave_group", tokens.member),
    "An owner with other members cannot leave",
    "Transfers are required before leaving a group with other members.");

  const left = await rpc("leave_group", tokens.owner);
  const leftBody = readJson(left);
  expect(left.status === 200 && leftBody?.groupDeleted === false,
    "A member leaves the group and is told the group survived",
    `status=${left.status} body=${left.body.slice(0, 200)}`);
  const departedRead = await rpc("my_group", tokens.owner);
  expect(departedRead.status === 200 && departedRead.body === "null",
    "The departing member loses access immediately",
    `status=${departedRead.status} body=${departedRead.body.slice(0, 200)}`);

  const thirdLeft = await rpc("leave_group", tokens.third);
  expect(readJson(thirdLeft)?.groupDeleted === false,
    "The remaining member leaves without deleting the group",
    `status=${thirdLeft.status} body=${thirdLeft.body.slice(0, 200)}`);
  const deleted = await rpc("leave_group", tokens.member);
  expect(readJson(deleted)?.groupDeleted === true,
    "The sole owner leaving deletes the group",
    `status=${deleted.status} body=${deleted.body.slice(0, 200)}`);
  expectRefused(await rpc("leave_group", tokens.member),
    "A former owner is no longer in a group", "Membership required.");
  expect(await psqlCount(`select count(*) from public.groups where owner_id = '${subjects.member}';`) === 0,
    "The deleted group row is gone", "the owner row survived deletion");

  // Private invitation, request, approval and rejection.
  const privateGroup = expectOverview(await rpc("create_group", tokens.owner2,
    { p_name: "Postgrest Private", p_visibility: "private" }),
  "A signed token creates a private group through PostgREST");
  expect(privateGroup?.invitation === null,
    "A new private group has no invitation",
    `body=${JSON.stringify(privateGroup)?.slice(0, 200)}`);

  const issued = await rpc("create_invitation", tokens.owner2);
  const issuedBody = readJson(issued);
  const invitationToken = issuedBody?.token as string | undefined;
  expect(issued.status === 200 && typeof invitationToken === "string" && /^[a-f0-9]{64}$/.test(invitationToken),
    "The owner issues a 64-character lowercase hex invitation",
    `status=${issued.status} body=${issued.body.slice(0, 200)}`);

  const resolved = await rpc("resolve_invitation", tokens.requester, { p_token: invitationToken ?? "" });
  const resolvedBody = readJson(resolved);
  expect(resolved.status === 200 && resolvedBody?.name === "Postgrest Private" &&
    resolvedBody?.ownerUsername === "LcOwner2" && resolvedBody?.member === false &&
    resolvedBody?.requested === false,
  "The token holder resolves the group without gaining membership",
  `status=${resolved.status} body=${resolved.body.slice(0, 200)}`);

  const requested = await rpc("request_join", tokens.requester, { p_token: invitationToken ?? "" });
  expect(readJson(requested)?.status === "pending",
    "The token holder creates a pending join request",
    `status=${requested.status} body=${requested.body.slice(0, 200)}`);

  const ownerView = expectOverview(await rpc("my_group", tokens.owner2), "The owner reads the pending request");
  const pending = ownerView?.requests as Record<string, unknown>[] | undefined;
  expect(pending?.length === 1 && pending[0]?.userId === subjects.requester,
    "The owner sees exactly the pending requester",
    `body=${JSON.stringify(ownerView)?.slice(0, 300)}`);

  const requestPage = await post("/rpc/group_requests_page", tokens.owner2, { p_limit: 1, p_cursor: null });
  const requestPageBody = readJson(requestPage);
  expect(requestPage.status === 200 && (requestPageBody?.requests as unknown[] | undefined)?.length === 1 &&
    requestPageBody?.nextCursor === null,
  "The owner reads a bounded request page with no further cursor",
  `status=${requestPage.status} body=${requestPage.body.slice(0, 200)}`);

  expectRefused(await post("/rpc/group_requests_page", tokens.requester, { p_limit: 1, p_cursor: null }),
    "A requester cannot read the owner request page", "Only the owner can perform this action.");

  const approved = expectOverview(await rpc("approve_join_request", tokens.owner2, { p_user_id: subjects.requester }),
    "The owner approves the pending request");
  expect(approved?.memberCount === 2,
    "Approval adds exactly the requested member",
    `body=${JSON.stringify(approved)?.slice(0, 200)}`);
  const approvedRead = expectOverview(await rpc("my_group", tokens.requester),
    "The approved user reads the group back");
  expect(approvedRead?.role === "member",
    "The approved user reads the member role immediately",
    `body=${JSON.stringify(approvedRead)?.slice(0, 200)}`);

  const rejecteeRequest = await rpc("request_join", tokens.rejectee, { p_token: invitationToken ?? "" });
  expect(readJson(rejecteeRequest)?.status === "pending",
    "Another token holder creates a pending request",
    `status=${rejecteeRequest.status} body=${rejecteeRequest.body.slice(0, 200)}`);
  const rejected = await rpc("reject_join_request", tokens.owner2, { p_user_id: subjects.rejectee });
  const rejectedBody = readJson(rejected);
  expect(rejected.status === 200 && rejectedBody?.status === "rejected" &&
    rejectedBody?.userId === subjects.rejectee,
    "The owner rejects the pending request",
    `status=${rejected.status} body=${rejected.body.slice(0, 200)}`);
  const rejecteeRead = await rpc("my_group", tokens.rejectee);
  expect(rejecteeRead.status === 200 && rejecteeRead.body === "null",
    "A rejected user gains no membership",
    `status=${rejecteeRead.status} body=${rejecteeRead.body.slice(0, 200)}`);
  expectRefused(await rpc("reject_join_request", tokens.owner2, { p_user_id: subjects.rejectee }),
    "A decided request cannot be rejected twice", "Request not found.");

  // Rotation and revocation invalidate the previous token.
  const rotated = await rpc("create_invitation", tokens.owner2);
  const rotatedToken = readJson(rotated)?.token as string;
  expect(rotated.status === 200 && rotatedToken !== invitationToken,
    "Rotation issues a new token",
    `status=${rotated.status} body=${rotated.body.slice(0, 200)}`);
  expectRefused(await rpc("resolve_invitation", tokens.third, { p_token: invitationToken ?? "" }),
    "The rotated token stops resolving", "Invitation is invalid.");
  expectRefused(await rpc("request_join", tokens.third, { p_token: invitationToken ?? "" }),
    "The rotated token cannot create a join request", "Invitation is invalid.");

  const revoked = await rpc("revoke_invitation", tokens.owner2);
  expect(revoked.status === 200 && readJson(revoked)?.invitation === null,
    "The owner revokes the current invitation",
    `status=${revoked.status} body=${revoked.body.slice(0, 200)}`);
  expectRefused(await rpc("resolve_invitation", tokens.third, { p_token: rotatedToken }),
    "The revoked token stops resolving", "Invitation is invalid.");
  expectRefused(await rpc("request_join", tokens.third, { p_token: rotatedToken }),
    "The revoked token cannot create a join request", "Invitation is invalid.");

  // Published versions and sharing on the same signed surface.
  const savedDraft = await rpc("save_pack_draft", tokens.owner2, {
    p_group_id: privateGroup?.id, p_game_version: "1.21.1", p_loader: "fabric",
    p_version_ids: ["main-v", "dep-v"], p_expected_revision: 0,
  });
  expect(readJson(savedDraft)?.draft?.revision === 1,
    "The owner stores the approved draft selection",
    `status=${savedDraft.status} body=${savedDraft.body.slice(0, 200)}`);

  const published = await rpc("publish_pack_draft", tokens.owner2, {
    p_name: "Postgrest Pack", p_pack_version: "1.0.0", p_loader_version: "0.16.0", p_expected_revision: 1,
  });
  const publishedBody = readJson(published);
  const publicationId = (publishedBody?.publication as Record<string, unknown> | undefined)?.id as string | undefined;
  expect(published.status === 200 &&
    (publishedBody?.publication as Record<string, unknown> | undefined)?.sequence === 1 &&
    (publishedBody?.publication as Record<string, unknown> | undefined)?.active === false,
  "A real signed owner publishes an immutable version that is not active",
  `status=${published.status} body=${published.body.slice(0, 300)}`);

  const memberList = await rpc("my_pack_publications", tokens.requester, { p_limit: 20, p_before_sequence: null });
  const memberListBody = readJson(memberList);
  expect(memberList.status === 200 && (memberListBody?.publications as unknown[] | undefined)?.length === 1 &&
    memberListBody?.activePublicationId === null,
  "A member reads the publication history with nothing active",
  `status=${memberList.status} body=${memberList.body.slice(0, 200)}`);

  const memberDetail = await rpc("my_pack_publication", tokens.requester, { p_publication_id: publicationId });
  const memberDetailBody = readJson(memberDetail);
  expect(memberDetail.status === 200 && memberDetailBody?.role === "member" &&
    (memberDetailBody?.publication as Record<string, unknown> | undefined)?.sequence === 1,
  "A member reads one published version and is not reported as owner",
  `status=${memberDetail.status} body=${memberDetail.body.slice(0, 300)}`);

  expectRefused(await rpc("activate_pack_publication", tokens.requester, { p_publication_id: publicationId }),
    "A member cannot activate a published version", "Only the group owner may manage published versions.");

  expectRefused(await rpc("my_pack_publications", tokens.third, { p_limit: 20, p_before_sequence: null }),
    "A caller outside the group cannot list publications", "Group required.");
  expectRefused(await rpc("my_pack_publication", tokens.third, { p_publication_id: publicationId }),
    "A caller without a group cannot read a publication", "Group required.");
  expectRefused(await rpc("my_pack_publication", tokens.outside, { p_publication_id: publicationId }),
    "A caller in another group cannot read a foreign publication", "Publication not found.");
  expectRefused(await rpc("activate_pack_publication", tokens.third, { p_publication_id: publicationId }),
    "A caller outside the group cannot activate a publication", "Group required.");

  const activated = await rpc("activate_pack_publication", tokens.owner2, { p_publication_id: publicationId });
  expect(readJson(activated)?.activePublicationId === publicationId,
    "The owner activates the published version separately",
    `status=${activated.status} body=${activated.body.slice(0, 200)}`);

  const beforeEdit = (await rpc("my_pack_publications", tokens.owner2, { p_limit: 20, p_before_sequence: null })).body;
  const edited = await rpc("save_pack_draft", tokens.owner2, {
    p_group_id: privateGroup?.id, p_game_version: "1.21.1", p_loader: "fabric",
    p_version_ids: ["main-v"], p_expected_revision: 1,
  });
  const afterEdit = await rpc("my_pack_publications", tokens.owner2, { p_limit: 20, p_before_sequence: null });
  expect(readJson(edited)?.draft?.revision === 2 && afterEdit.body === beforeEdit,
    "A later draft edit rewrites neither the frozen selection nor the active version",
    `status=${edited.status} before=${beforeEdit.slice(0, 200)} after=${afterEdit.body.slice(0, 200)}`);

  const departed = await rpc("leave_group", tokens.requester);
  expect(readJson(departed)?.groupDeleted === false,
    "The member leaves a group that survives",
    `status=${departed.status} body=${departed.body.slice(0, 200)}`);
  expectRefused(await rpc("my_pack_publications", tokens.requester, { p_limit: 20, p_before_sequence: null }),
    "A previous member cannot list publications", "Group required.");
  expectRefused(await rpc("my_pack_publication", tokens.requester, { p_publication_id: publicationId }),
    "A previous member cannot read a publication by id", "Group required.");
  expect((await rpc("my_pack_publication", tokens.owner2, { p_publication_id: publicationId })).status === 200,
    "The remaining owner still reads the publication",
    "the owner lost access after the member left");
} finally {
  const cleanup = await psql(`
    delete from public.groups where owner_id in (${subjectList});
    delete from public.profiles where user_id in (${subjectList});
  `);
  if (cleanup.code !== 0) failures.push(`cleanup failed — ${cleanup.err}`);
}

// Cleanup failure must fail the runner, and no probe fixture may survive it.
try {
  const leftovers = await psqlCount(`
    select (select count(*) from public.profiles where user_id in (${subjectList}))
      + (select count(*) from public.groups where owner_id in (${subjectList}))
      + (select count(*) from public.group_members where user_id in (${subjectList}))
      + (select count(*) from public.group_join_requests where user_id in (${subjectList}))
      + (select count(*) from public.pack_publications p join public.groups g on g.id = p.group_id
           where g.owner_id in (${subjectList}))
      + (select count(*) from public.pack_drafts d join public.groups g on g.id = d.group_id
           where g.owner_id in (${subjectList}));
  `);
  expect(leftovers === 0, "No probe fixture survives cleanup", `${leftovers} leftover row(s)`);
} catch (error) {
  failures.push(`cleanup verification failed — ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} PostgREST check(s) failed.`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nAll PostgREST signed-token checks passed.");
