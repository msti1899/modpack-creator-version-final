// Signed-token checks against the local PostgREST surface.
//
// The production request path is Clerk token -> Hono -> PostgREST with the caller's
// token forwarded. Locally the two validators cannot share one signing key: Hono
// accepts only an RSA public key and the local PostgREST accepts only the stack's
// symmetric secret. This script therefore proves the PostgREST half with a locally
// signed token, which is real database-side evidence and explicitly not hosted Clerk
// proof. Hono's own forwarding and status mapping stay covered by its unit tests.
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

const subject = "user_postgrestprobe";

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

async function psql(sql: string): Promise<number> {
  const proc = Bun.spawn(
    [...docker, "exec", "-i", container, "psql", "-X", "-q", "-t", "-A",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"],
    { stdin: new TextEncoder().encode(sql), stdout: "pipe", stderr: "pipe" },
  );
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  if (code !== 0) console.error(`psql failed: ${err.trim()}`);
  return code;
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

const failures: string[] = [];
function expect(held: boolean, message: string, detail: string): void {
  console.log(`${held ? "PASS" : "FAIL"} ${message}`);
  if (!held) failures.push(`${message} — ${detail}`);
}

const token = mintToken(jwtSecret, subject);
const forged = mintToken("not-the-stack-secret-but-long-enough", subject);

try {
  await psql(`insert into public.profiles (user_id, username) values ('${subject}', 'PostgrestProbe');`);

  const created = await post("/rpc/create_group", token, { p_name: "Postgrest Probe", p_visibility: "public" });
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(created.body) as Record<string, unknown>; } catch { payload = {}; }
  expect(created.status === 200 && payload.role === "owner",
    "a signed token reaches the group RPC through PostgREST",
    `status=${created.status} body=${created.body.slice(0, 160)}`);

  const unauthenticated = await post("/rpc/create_group", null, { p_name: "Probe Two", p_visibility: "public" });
  expect(unauthenticated.status === 401,
    "PostgREST rejects a request without a token",
    `status=${unauthenticated.status} body=${unauthenticated.body.slice(0, 160)}`);

  const forgedResponse = await post("/rpc/create_group", forged, { p_name: "Probe Three", p_visibility: "public" });
  expect(forgedResponse.status === 401,
    "PostgREST rejects a token it did not sign",
    `status=${forgedResponse.status} body=${forgedResponse.body.slice(0, 160)}`);

  const direct = await get("/groups?select=id", token);
  expect(direct.status === 403 || direct.status === 401,
    "tables stay closed even to a valid token",
    `status=${direct.status} body=${direct.body.slice(0, 160)}`);

  const mine = await post("/rpc/my_group", token, {});
  let minePayload: Record<string, unknown> = {};
  try { minePayload = JSON.parse(mine.body) as Record<string, unknown>; } catch { minePayload = {}; }
  expect(mine.status === 200 && Array.isArray(minePayload.members) &&
    (minePayload.members as unknown[]).length === 1,
  "the same token reads its group back through RPC",
  `status=${mine.status} body=${mine.body.slice(0, 160)}`);
} finally {
  await psql(`
    delete from public.groups where owner_id = '${subject}';
    delete from public.profiles where user_id = '${subject}';
  `);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} PostgREST check(s) failed.`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nAll PostgREST signed-token checks passed.");
