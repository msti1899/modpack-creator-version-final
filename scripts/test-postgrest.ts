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
  delOwner: "user_lcdelowner",
  delMember: "user_lcdelmember",
  delVoter: "user_lcdelvoter",
  delSolo: "user_lcdelsolo",
  delReuse: "user_lcdelreuse",
} as const;
const usernames: Record<string, string> = {
  [subjects.owner]: "LcOwner",
  [subjects.member]: "LcMember",
  [subjects.third]: "LcThird",
  [subjects.outside]: "LcOutside",
  [subjects.owner2]: "LcOwner2",
  [subjects.requester]: "LcRequester",
  [subjects.rejectee]: "LcRejectee",
  // delReuse intentionally starts without a profile: it claims the released name later.
  [subjects.delOwner]: "LcDelOwner",
  [subjects.delMember]: "LcDelMember",
  [subjects.delVoter]: "LcDelVoter",
  [subjects.delSolo]: "LcDelSolo",
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

  // Voting obligations on the same signed surface.
  const proposal = (ids: string[]) => ids.map((id) => ({ versionId: id, projectId: `p-${id}`,
    projectTitle: `Mod ${id}`, versionNumber: "1.0" }));
  const openVote = (addition: string[], revision: number) => rpc("open_group_vote", tokens.owner2, {
    p_group_id: privateGroup?.id, p_game_version: "1.21.1", p_loader: "fabric",
    p_addition: addition, p_proposal: proposal(addition), p_duration_hours: 24,
    p_expected_draft_revision: revision,
  });
  const approve = (token: string, id: string) => rpc("cast_group_vote", token, { p_vote_id: id, p_value: "approve" });
  const openVoteBody = readJson(await openVote(["vote-a"], 2));
  const voteId = openVoteBody?.id as string | undefined;
  expect(openVoteBody?.status === "open" && openVoteBody?.electorateSize === 2,
    "The owner opens a vote for a concrete addition with a frozen electorate",
    `status=${openVoteBody?.status} electorate=${String(openVoteBody?.electorateSize)}`);

  const oneApproval = readJson(await approve(tokens.requester, voteId!));
  expect(oneApproval?.approveCount === 1 && oneApproval?.status === "open",
    "One approval of two keeps the vote open",
    `approve=${String(oneApproval?.approveCount)} status=${String(oneApproval?.status)}`);

  expectRefused(await rpc("cancel_group_vote", tokens.requester, { p_vote_id: voteId }),
    "A member cannot cancel an open vote", "Only the group owner may cancel votes.");

  const majority = readJson(await approve(tokens.owner2, voteId!));
  expect(majority?.status === "approved" && majority?.resolvedAt !== null,
    "The absolute majority approves the vote immediately",
    `status=${String(majority?.status)} resolvedAt=${String(majority?.resolvedAt)}`);

  const pendingList = readJson(await rpc("my_group_votes", tokens.requester, { p_limit: 20, p_cursor: null }));
  expect(((pendingList?.votes as Record<string, unknown>[] | undefined) ?? []).some((item) =>
    item.id === voteId && item.status === "approved" && item.incorporatedAt === null),
  "A pending obligation reads from the vote list",
  `votes=${JSON.stringify(pendingList?.votes)?.slice(0, 200)}`);

  const savedAfterApproval = await rpc("save_pack_draft", tokens.owner2, {
    p_group_id: privateGroup?.id, p_game_version: "1.21.1", p_loader: "fabric",
    p_version_ids: ["main-v"], p_expected_revision: 2,
  });
  expect(readJson(savedAfterApproval)?.draft?.revision === 3,
    "The owner saves the draft while the obligation is pending",
    `status=${savedAfterApproval.status} body=${savedAfterApproval.body.slice(0, 200)}`);
  const stillPending = readJson(await rpc("my_group_votes", tokens.requester, { p_limit: 20, p_cursor: null }));
  expect(((stillPending?.votes as Record<string, unknown>[] | undefined) ?? []).some((item) =>
    item.id === voteId && item.incorporatedAt === null),
  "A draft save does not discharge the obligation",
  `votes=${JSON.stringify(stillPending?.votes)?.slice(0, 200)}`);

  expectRefused(await rpc("incorporate_group_vote", tokens.owner2, {
    p_vote_id: voteId, p_expected_draft_revision: 2 }),
  "A stale revision is refused on the signed surface", "Draft revision conflict.");

  const incorporatedBody = readJson(await rpc("incorporate_group_vote", tokens.owner2, {
    p_vote_id: voteId, p_expected_draft_revision: 3 }));
  expect((incorporatedBody?.draft as Record<string, unknown> | undefined)?.revision === 4 &&
    JSON.stringify((incorporatedBody?.draft as Record<string, unknown> | undefined)?.versionIds) ===
      JSON.stringify(["main-v", "vote-a"]),
  "The current owner incorporates and the draft gains the pinned addition",
  `body=${JSON.stringify(incorporatedBody)?.slice(0, 300)}`);

  expectRefused(await rpc("incorporate_group_vote", tokens.owner2, {
    p_vote_id: voteId, p_expected_draft_revision: 4 }),
  "An incorporated vote cannot be incorporated twice", "Vote is already incorporated.");

  // Two approved votes for one addition: the first appends it, the second is satisfied.
  const duplicateOne = readJson(await openVote(["vote-b"], 4))?.id as string;
  const duplicateTwo = readJson(await openVote(["vote-b"], 4))?.id as string;
  expect(typeof duplicateOne === "string" && typeof duplicateTwo === "string" && duplicateOne !== duplicateTwo,
    "Two independent votes may propose one addition at once",
    `first=${String(duplicateOne)} second=${String(duplicateTwo)}`);
  await approve(tokens.requester, duplicateOne);
  await approve(tokens.requester, duplicateTwo);
  await approve(tokens.owner2, duplicateOne);
  await approve(tokens.owner2, duplicateTwo);
  const appended = readJson(await rpc("incorporate_group_vote", tokens.owner2, {
    p_vote_id: duplicateOne, p_expected_draft_revision: 4 }));
  expect((appended?.draft as Record<string, unknown> | undefined)?.revision === 5,
    "The first approved duplicate appends the addition",
    `body=${JSON.stringify(appended)?.slice(0, 300)}`);
  const satisfied = readJson(await rpc("incorporate_group_vote", tokens.owner2, {
    p_vote_id: duplicateTwo, p_expected_draft_revision: 5 }));
  expect((satisfied?.draft as Record<string, unknown> | undefined)?.revision === 5 &&
    JSON.stringify((satisfied?.draft as Record<string, unknown> | undefined)?.versionIds) ===
      JSON.stringify(["main-v", "vote-a", "vote-b"]) &&
    (satisfied?.vote as Record<string, unknown> | undefined)?.incorporatedAt !== null,
  "The second approved duplicate is satisfied without rewriting the draft",
  `body=${JSON.stringify(satisfied)?.slice(0, 300)}`);

  const cancellable = readJson(await openVote(["vote-c"], 5))?.id as string;
  const cancelled = await rpc("cancel_group_vote", tokens.owner2, { p_vote_id: cancellable });
  expect(readJson(cancelled)?.status === "cancelled",
    "The owner cancels an open vote",
    `status=${cancelled.status} body=${cancelled.body.slice(0, 200)}`);
  expectRefused(await approve(tokens.requester, cancellable),
    "A cancelled vote accepts no ballot", "This vote is already closed.");
  expectRefused(await rpc("incorporate_group_vote", tokens.owner2, {
    p_vote_id: cancellable, p_expected_draft_revision: 5 }),
  "A cancelled vote is never incorporated", "Vote is not approved.");

  // The obligation belongs to the group: the current owner discharges it.
  const transferable = readJson(await openVote(["vote-d"], 5))?.id as string;
  await approve(tokens.requester, transferable);
  await approve(tokens.owner2, transferable);
  const handedOver = expectOverview(await rpc("transfer_ownership", tokens.owner2,
    { p_user_id: subjects.requester }), "The owner transfers the group with a pending obligation");
  expect(handedOver?.ownerId === subjects.requester,
    "The previous owner reads the member role immediately",
    `body=${JSON.stringify(handedOver)?.slice(0, 200)}`);
  expectRefused(await rpc("incorporate_group_vote", tokens.owner2, {
    p_vote_id: transferable, p_expected_draft_revision: 5 }),
  "A previous owner cannot discharge the obligation", "Only the group owner may incorporate votes.");
  const transferredDischarge = readJson(await rpc("incorporate_group_vote", tokens.requester, {
    p_vote_id: transferable, p_expected_draft_revision: 5 }));
  expect((transferredDischarge?.draft as Record<string, unknown> | undefined)?.revision === 6 &&
    (transferredDischarge?.vote as Record<string, unknown> | undefined)?.incorporatedAt !== null,
  "The new owner discharges the transferred obligation",
  `body=${JSON.stringify(transferredDischarge)?.slice(0, 300)}`);
  const returned = expectOverview(await rpc("transfer_ownership", tokens.requester,
    { p_user_id: subjects.owner2 }), "The group is transferred back to the original owner");
  expect(returned?.ownerId === subjects.owner2,
    "The original owner reads the owner role again",
    `body=${JSON.stringify(returned)?.slice(0, 200)}`);

  const departed = await rpc("leave_group", tokens.requester);
  expect(readJson(departed)?.groupDeleted === false,
    "The member leaves a group that survives",
    `status=${departed.status} body=${departed.body.slice(0, 200)}`);
  expectRefused(await rpc("my_pack_publications", tokens.requester, { p_limit: 20, p_before_sequence: null }),
    "A previous member cannot list publications", "Group required.");
  expectRefused(await rpc("my_pack_publication", tokens.requester, { p_publication_id: publicationId }),
    "A previous member cannot read a publication by id", "Group required.");
  expectRefused(await rpc("my_group_votes", tokens.requester, { p_limit: 20, p_cursor: null }),
    "A previous member cannot read the group votes", "Group required.");
  expectRefused(await rpc("group_vote_ballots", tokens.requester, { p_vote_id: voteId }),
    "A previous member cannot read a ballot page", "Vote not found.");
  expect((await rpc("my_pack_publication", tokens.owner2, { p_publication_id: publicationId })).status === 200,
    "The remaining owner still reads the publication",
    "the owner lost access after the member left");

  // Account deletion and retention. The group intentionally keeps votes, ballots and a
  // frozen electorate so the deletion path is exercised on real group records.
  const delGroup = expectOverview(await rpc("create_group", tokens.delOwner,
    { p_name: "Postgrest Deletion", p_visibility: "public" }),
  "A prospective deleter creates a public group");
  const delGroupId = delGroup?.id as string;
  expectOverview(await rpc("join_public_group", tokens.delMember, { p_group_id: delGroupId }),
    "The member who will delete joins the deletion group");
  expectOverview(await rpc("join_public_group", tokens.delVoter, { p_group_id: delGroupId }),
    "A second participant joins the deletion group");
  const delDraft = readJson(await rpc("save_pack_draft", tokens.delOwner, {
    p_group_id: delGroupId, p_game_version: "1.21.1", p_loader: "fabric",
    p_version_ids: ["del-main"], p_expected_revision: 0,
  }));
  expect(delDraft?.draft?.revision === 1,
    "The deletion group stores a draft", `body=${JSON.stringify(delDraft)?.slice(0, 200)}`);
  const delProposal = ["del-vote"].map((id) => ({ versionId: id, projectId: `p-${id}`,
    projectTitle: `Mod ${id}`, versionNumber: "1.0" }));
  const delVote = readJson(await rpc("open_group_vote", tokens.delOwner, {
    p_group_id: delGroupId, p_game_version: "1.21.1", p_loader: "fabric",
    p_addition: ["del-vote"], p_proposal: delProposal, p_duration_hours: 24,
    p_expected_draft_revision: 1,
  }));
  const delVoteId = delVote?.id as string;
  expect(delVote?.electorateSize === 3,
    "The deletion vote freezes three participants",
    `body=${JSON.stringify(delVote)?.slice(0, 300)}`);
  const delBallot = readJson(await rpc("cast_group_vote", tokens.delVoter, {
    p_vote_id: delVoteId, p_value: "approve" }));
  expect(delBallot?.approveCount === 1,
    "A participant casts one approval before the deletion",
    `body=${JSON.stringify(delBallot)?.slice(0, 300)}`);

  expectRefused(await rpc("delete_my_account", tokens.delOwner),
    "An owner with other members cannot delete the account",
    "Transfers are required before leaving a group with other members.");
  expect(await psqlCount(`select count(*) from public.profiles where user_id = '${subjects.delOwner}';`) === 1,
    "The refused deletion keeps the owner profile", "the profile was deleted");

  const memberDeletion = await rpc("delete_my_account", tokens.delMember);
  const memberDeletionBody = readJson(memberDeletion);
  expect(memberDeletion.status === 200 && memberDeletionBody?.deleted === true &&
    memberDeletionBody?.groupDeleted === false && memberDeletionBody?.groupId === delGroupId,
  "A member deletes the account and reports the surviving group",
  `status=${memberDeletion.status} body=${memberDeletion.body.slice(0, 200)}`);
  expect(await psqlCount(`select count(*) from public.profiles where user_id = '${subjects.delMember}';`) === 0,
    "The deleted member's profile row is gone", "the profile survived");
  expect(await psqlCount(`select count(*) from public.group_members
    where group_id = '${delGroupId}' and user_id = '${subjects.delMember}';`) === 0,
  "The deleted member's membership is gone", "the membership survived");
  expect(await psqlCount(`select count(*) from public.groups where id = '${delGroupId}';`) === 1,
    "The group survives a member deletion", "the group was deleted");
  expect(await psqlCount(`select count(*) from public.pack_drafts where group_id = '${delGroupId}';`) === 1,
    "The draft survives a member deletion", "the draft was deleted");
  expect(await psqlCount(`select count(*) from public.group_vote_electorate
    where vote_id = '${delVoteId}' and user_id = '${subjects.delMember}';`) === 1,
  "The frozen electorate keeps the departed subject", "the electorate row was deleted");
  expect(await psqlCount(`select count(*) from public.group_vote_ballots
    where vote_id = '${delVoteId}' and user_id = '${subjects.delVoter}';`) === 1,
  "A cast ballot survives another account deletion", "the ballot was deleted");
  const keptVoteRead = readJson(await rpc("my_group_votes", tokens.delOwner, { p_limit: 20, p_cursor: null }));
  const keptVote = ((keptVoteRead?.votes as Record<string, unknown>[] | undefined) ?? [])
    .find((item) => item.id === delVoteId);
  expect(keptVote?.electorateSize === 3 && keptVote?.approveCount === 1 && keptVote?.status === "open",
    "The owner still reads the same electorate, ballot and vote state",
    `vote=${JSON.stringify(keptVote)?.slice(0, 300)}`);
  const ballotPage = readJson(await rpc("group_vote_ballots", tokens.delOwner,
    { p_vote_id: delVoteId, p_cursor: null, p_limit: null }));
  const ballotRows = (ballotPage?.ballots as Record<string, unknown>[] | undefined) ?? [];
  const deletedRow = ballotRows.find((item) => item.userId === subjects.delMember);
  const liveRow = ballotRows.find((item) => item.userId === subjects.delVoter);
  expect(ballotRows.length === 3 && deletedRow?.username === null && deletedRow?.ballot === null &&
    liveRow?.username === "LcDelVoter" && liveRow?.ballot === "approve",
  "The ballot page keeps the deleted participant as an opaque tombstone",
  `rows=${JSON.stringify(ballotRows)?.slice(0, 400)}`);
  const memberAfter = await rpc("my_group", tokens.delMember);
  expect(memberAfter.status === 200 && memberAfter.body === "null",
    "A deleted member no longer reads a group", `status=${memberAfter.status} body=${memberAfter.body.slice(0, 160)}`);
  const repeated = await rpc("delete_my_account", tokens.delMember);
  expect(repeated.status === 200 && readJson(repeated)?.deleted === false,
    "A repeated deletion is idempotent and writes nothing",
    `status=${repeated.status} body=${repeated.body.slice(0, 200)}`);

  const releasedName = await post("/profiles", tokens.delReuse,
    { user_id: subjects.delReuse, username: "LcDelMember" });
  expect(releasedName.status === 201,
    "The deleted username is immediately reusable through the real profile path",
    `status=${releasedName.status} body=${releasedName.body.slice(0, 200)}`);

  expectOverview(await rpc("transfer_ownership", tokens.delOwner, { p_user_id: subjects.delVoter }),
    "The owner transfers before deleting the account");
  const ownerDeletion = await rpc("delete_my_account", tokens.delOwner);
  const ownerDeletionBody = readJson(ownerDeletion);
  expect(ownerDeletion.status === 200 && ownerDeletionBody?.deleted === true &&
    ownerDeletionBody?.groupDeleted === false,
  "A transferred owner deletes only the account",
  `status=${ownerDeletion.status} body=${ownerDeletion.body.slice(0, 200)}`);
  expect(await psqlCount(`select count(*) from public.group_votes
    where id = '${delVoteId}' and created_by = '${subjects.delOwner}';`) === 1,
  "The vote keeps the deleted creator as a subject tombstone", "the vote lost its creator");
  const successorVotes = readJson(await rpc("my_group_votes", tokens.delVoter, { p_limit: 20, p_cursor: null }));
  const successorVote = ((successorVotes?.votes as Record<string, unknown>[] | undefined) ?? [])
    .find((item) => item.id === delVoteId);
  expect(successorVote?.electorateSize === 3 && successorVote?.approveCount === 1,
    "The successor owner reads the same frozen vote",
    `vote=${JSON.stringify(successorVote)?.slice(0, 300)}`);

  const soloGroup = expectOverview(await rpc("create_group", tokens.delSolo,
    { p_name: "Postgrest Solo", p_visibility: "public" }),
  "A last member creates their own group");
  const soloGroupId = soloGroup?.id as string;
  const soloDraft = readJson(await rpc("save_pack_draft", tokens.delSolo, {
    p_group_id: soloGroupId, p_game_version: "1.21.1", p_loader: "fabric",
    p_version_ids: ["solo-main"], p_expected_revision: 0,
  }));
  expect(soloDraft?.draft?.revision === 1,
    "The last member stores a draft", `body=${JSON.stringify(soloDraft)?.slice(0, 200)}`);
  const soloDeletion = readJson(await rpc("delete_my_account", tokens.delSolo));
  expect(soloDeletion?.deleted === true && soloDeletion?.groupDeleted === true,
    "The last member deletes the group with the account",
    `body=${JSON.stringify(soloDeletion)?.slice(0, 200)}`);
  expect(await psqlCount(`select count(*) from public.groups where id = '${soloGroupId}';`) === 0,
    "The deleted solo group row is gone", "the group survived");
  expect(await psqlCount(`select count(*) from public.pack_drafts where group_id = '${soloGroupId}';`) === 0,
    "The solo draft is gone with the group", "the draft survived");
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
           where g.owner_id in (${subjectList}))
      + (select count(*) from public.group_votes v join public.groups g on g.id = v.group_id
           where g.owner_id in (${subjectList}))
      + (select count(*) from public.group_vote_ballots b join public.group_votes v on v.id = b.vote_id
           join public.groups g on g.id = v.group_id where g.owner_id in (${subjectList}));
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
