import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "player@example.test" };
const credentials = { email: user.email, password: "  Strong-password1!  " };
const session = { access_token: "user-access-token", refresh_token: "user-refresh-token", expires_in: 3600, token_type: "bearer", user };
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
function setup(fetcher = async (_url: string, _init: RequestInit) => Response.json(session), overrides = {}) {
  return createApp(async () => { throw new Error("Auth must not call Modrinth"); }, { ...config, fetcher, ...overrides });
}
const post = (app: ReturnType<typeof createApp>, path: string, body: unknown = credentials) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("registration and login delegate credentials unchanged and return only allowed session fields", async () => {
  for (const action of ["register", "login"]) {
    let calls = 0;
    const app = setup(async (url, init) => {
      calls++;
      expect(url).toBe(config.url + (action === "register" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password"));
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("apikey")).toBe(config.publishableKey);
      expect(new Headers(init.headers).get("authorization")).toBeNull();
      expect(JSON.parse(String(init.body))).toEqual(credentials);
      expect(init.redirect).toBe("error");
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ ...session, provider_token: "private", user: { ...user, user_metadata: { role: "private" } } });
    });
    const response = await post(app, "/auth/" + action);
    expect(response.status).toBe(action === "register" ? 201 : 200);
    expect(await response.json()).toEqual({ user, session: { accessToken: "user-access-token", refreshToken: "user-refresh-token", expiresIn: 3600, tokenType: "bearer" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls).toBe(1);
  }
});

test("credential input is bounded and rejects usernames, metadata and redirects without an Auth call", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(session); });
  for (const body of [null, [], {}, { email: user.email }, { ...credentials, password: 123 }, { ...credentials, email: "not-email" },
    { ...credentials, username: "Matias" }, { ...credentials, data: { role: "admin" } }, { ...credentials, redirect_to: "https://evil.test" },
    { ...credentials, password: "x".repeat(3000) }]) {
    for (const path of ["/auth/register", "/auth/login"]) expect((await post(app, path, body)).status).toBe(400);
  }
  expect((await app.request("/auth/login", { method: "POST", body: "invalid JSON" })).status).toBe(400);
  expect(calls).toBe(0);
});

test("registration without a session or for an existing account never exposes an account identifier", async () => {
  for (const reply of [Response.json({ ...user, identities: [{ private: "hidden" }] }),
    Response.json({ code: "user_already_exists", message: "private account details" }, { status: 422 }),
    Response.json({ code: 422, error_code: "user_already_exists", msg: "private account details" }, { status: 422 }),
    Response.json({ code: "email_exists", message: "private account details" }, { status: 400 })]) {
    const response = await post(setup(async () => reply), "/auth/register");
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ user: null, session: null });
  }
  expect((await post(setup(async () => Response.json(user)), "/auth/login")).status).toBe(502);
});

test("bad credentials, provider limits and outages produce safe errors without retries", async () => {
  for (const code of ["invalid_credentials", "email_not_confirmed", "user_not_found"]) {
    const response = await post(setup(async () => Response.json({ code, message: "private account details" }, { status: 400 })), "/auth/login");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid email or password." });
  }
  for (const [status, expected] of [[429, 429], [500, 502], [302, 502], [400, 400]]) {
    let calls = 0;
    const response = await post(setup(async () => { calls++; return Response.json({ message: credentials.password }, { status }); }), "/auth/register");
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain(credentials.password);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls).toBe(1);
  }
});

test("configuration, protocol and timeout failures cannot return sessions or credentials", async () => {
  let calls = 0;
  const privileged = `a.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.c`;
  for (const overrides of [{ url: undefined }, { url: "http://remote.test" }, { url: "https://x.test/?private=x" }, { publishableKey: "sb_secret_private" }, { publishableKey: privileged }]) {
    expect((await post(setup(async () => { calls++; return Response.json(session); }, overrides), "/auth/login")).status).toBe(503);
  }
  expect(calls).toBe(0);
  for (const value of [null, {}, { ...session, access_token: "" }, { ...session, refresh_token: null },
    { ...session, user: { id: "invalid" } }, { ...session, expires_in: -1 }, { ...session, token_type: "invalid" }]) {
    expect((await post(setup(async () => Response.json(value)), "/auth/login")).status).toBe(502);
  }
  expect((await post(setup(async () => Response.json({ ...session, private: "x".repeat(65_536) })), "/auth/login")).status).toBe(502);
  expect((await post(setup(async () => { throw new DOMException("private", "TimeoutError"); }), "/auth/login")).status).toBe(504);
  const stalled = new ReadableStream<Uint8Array>({ start(c) { c.error(new DOMException("private", "AbortError")); } });
  expect((await post(setup(async () => new Response(stalled)), "/auth/register")).status).toBe(504);
  const key = `a.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.c`;
  expect((await post(setup(undefined, { publishableKey: key }), "/auth/login")).status).toBe(200);
});

test("only declared credential methods change; caller headers and query cannot choose the Auth grant", async () => {
  let calls = 0;
  const app = setup(async (url, init) => {
    calls++;
    expect(url).toBe(config.url + "/auth/v1/token?grant_type=password");
    expect(new Headers(init.headers).get("authorization")).toBeNull();
    return Response.json(session);
  });
  for (const [path, method] of [["/auth/login", "GET"], ["/auth/register", "DELETE"], ["/auth/unknown", "POST"], ["/auth/login/unknown", "POST"]]) {
    expect((await app.request(path, { method })).status).toBe(404);
  }
  expect(calls).toBe(0);
  const response = await app.request("/auth/login?grant_type=refresh_token&redirect_to=https://evil.test", {
    method: "POST", headers: { authorization: "Bearer caller-token" }, body: JSON.stringify(credentials),
  });
  expect(response.status).toBe(200);
  expect(calls).toBe(1);
});
