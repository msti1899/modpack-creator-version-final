/**
 * Live account-session check against the configured Clerk development instance.
 *
 * Proves, with a real Clerk-minted session token, that:
 *   - an email/password sign-in completes and mints a session token;
 *   - GET /me accepts that token and returns the same subject;
 *   - missing credentials are refused;
 *   - revoking the session stops new tokens and refuses them;
 *   - a token copied before revocation still verifies until it expires.
 *
 * The last rule is the documented limit of offline verification, not a defect.
 * This script mutates provider state: it creates one uniquely named test account
 * and deletes it in a finally block. It never runs without --live, refuses
 * non-development instances, and prints no secret, password or token value.
 *
 * Usage: bun scripts/test-account-session.ts --live
 * Requires CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in the
 * environment, and a running API at API_URL (default http://127.0.0.1:3001).
 */
export {};

const live = process.argv.includes("--live");
const secret = process.env.CLERK_SECRET_KEY ?? "";
const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";

function stop(reason: string): never {
  console.error(`Refused: ${reason}`);
  process.exit(2);
}

if (!live) stop("this check creates and deletes a real test account; pass --live to run it.");
if (!secret.startsWith("sk_test_")) stop("CLERK_SECRET_KEY must be a development-instance key.");
if (!publishable.startsWith("pk_test_")) stop("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a development-instance key.");

const fapi = `https://${Buffer.from(publishable.slice("pk_test_".length), "base64").toString("utf8").replace(/\$$/, "")}`;
const origin = process.env.CLERK_ORIGIN ?? "http://127.0.0.1:3000";
const email = `modpack.session.${Date.now()}+clerk_test@example.com`;
const password = `Session-${crypto.randomUUID()}`;

const failures: string[] = [];
function check(name: string, actual: unknown, expected: unknown, note?: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${name}: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`);
  const label = ok ? "ok  " : "FAIL";
  console.log(`${label} ${name}${note ? ` — ${note}` : ""}`);
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
  return (response.headers.getSetCookie?.() ?? []).map((value) => value.split(";")[0]).find((value) => value.startsWith("__client="));
}

// Development instances gate client requests behind a short-lived browser token.
const devBrowser = await fetch(`${fapi}/v1/dev_browser?_clerk_js_version=6.43.0`, { method: "POST", headers: { Origin: origin } });
if (!devBrowser.ok) stop(`the development instance did not issue a browser token (${devBrowser.status}).`);
const devToken = ((await devBrowser.json()) as { token?: string }).token;
if (!devToken) stop("the development instance returned no browser token.");
const query = `_clerk_js_version=6.43.0&__clerk_db_jwt=${encodeURIComponent(devToken)}`;

async function form(path: string, body?: Record<string, string>, cookie?: string) {
  const response = await fetch(`${fapi}${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : new URLSearchParams(body).toString(),
  });
  const payload = (await response.json()) as any;
  return { status: response.status, payload, cookie: cookieOf(response), codes: payload?.errors?.map((error: any) => error.code) as string[] | undefined };
}

let userId: string | undefined;
try {
  const user = (await clerkApi("POST", "/users", {
    email_address: [email], password, first_name: "Session", last_name: "Probe",
  })) as { id: string; email_addresses?: { verification?: { status?: string } }[]; password_enabled?: boolean };
  userId = user.id;
  check("test account is verified and password-capable", [user.email_addresses?.[0]?.verification?.status, user.password_enabled], ["verified", true]);

  const created = await form(`/v1/client/sign_ins?${query}`, { identifier: email });
  check("password sign-in reaches the password factor", created.payload?.response?.status, "needs_first_factor");

  const factor = await form(`/v1/client/sign_ins/${created.payload?.response?.id}/attempt_first_factor?${query}`, { strategy: "password", password }, created.cookie);
  check("password factor verifies", factor.payload?.response?.first_factor_verification?.status, "verified");

  // A fresh device needs a trust code; development instances accept the fixed test code.
  const trustPrepared = await form(`/v1/client/sign_ins/${created.payload?.response?.id}/prepare_second_factor?${query}`, { strategy: "email_code" }, factor.cookie);
  check("new-device trust challenge is sent", trustPrepared.payload?.response?.second_factor_verification?.status, "unverified");

  const trusted = await form(`/v1/client/sign_ins/${created.payload?.response?.id}/attempt_second_factor?${query}`, { strategy: "email_code", code: "424242" }, trustPrepared.cookie);
  const sessionId: string | undefined = trusted.payload?.response?.created_session_id;
  check("sign-in completes with a session", [trusted.payload?.response?.status, typeof sessionId], ["complete", "string"]);

  let cookie = trusted.cookie ?? trustPrepared.cookie;
  const mintToken = async () => {
    const result = await form(`/v1/client/sessions/${sessionId}/tokens?${query}`, undefined, cookie);
    if (result.cookie) cookie = result.cookie;
    return { status: result.status, codes: result.codes, jwt: result.payload?.jwt as string | undefined };
  };

  const first = await mintToken();
  check("a session token is issued", [first.status, typeof first.jwt], [200, "string"]);
  const jwt = first.jwt!;

  const me = async (token?: string) => {
    const response = await fetch(`${apiUrl}/me`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: (await response.json()) as any, cache: response.headers.get("cache-control"), vary: response.headers.get("vary") };
  };

  const signedIn = await me(jwt);
  check("GET /me accepts the real session", [signedIn.status, signedIn.body?.user?.id === userId], [200, true]);
  check("identity responses stay uncached", [signedIn.cache, signedIn.vary], ["no-store", "Authorization"]);
  console.log(`info /me email claim: ${typeof signedIn.body?.user?.email === "string" ? "present" : "null (session token template omits email)"}`);

  const anonymous = await me();
  check("GET /me refuses missing credentials", anonymous.status, 401);

  // Read-only use of the same token against the database chain. No profile is written.
  const profile = await fetch(`${apiUrl}/profile`, { headers: { authorization: `Bearer ${jwt}` } });
  const profileBody = (await profile.json()) as any;
  if (profile.status === 503) {
    console.log("info GET /profile: database not configured, chain not exercised");
  } else {
    check("GET /profile reaches the database with the same token",
      [profile.status, profileBody?.profile === null || typeof profileBody?.profile?.username === "string"], [200, true]);
    check("profile responses stay uncached", profile.headers.get("cache-control"), "no-store");
  }

  await clerkApi("POST", `/sessions/${sessionId}/revoke`);
  const afterRevoke = await mintToken();
  check("sign-out stops new tokens", [afterRevoke.status, afterRevoke.codes?.includes("authentication_invalid") ?? false], [401, true]);

  const copied = await me(jwt);
  check("a token copied before sign-out still verifies until it expires", copied.status, 200,
    "documented limit of offline verification, not a defect");
} finally {
  if (userId) await clerkApi("DELETE", `/users/${userId}`);
}

console.log(failures.length ? `\n${failures.length} check(s) failed:\n${failures.join("\n")}` : "\nAll account-session checks passed.");
process.exit(failures.length ? 1 : 0);
