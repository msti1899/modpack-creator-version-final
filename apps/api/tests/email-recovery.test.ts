import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "player@example.test" };
const session = { user, access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600, token_type: "bearer" };
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const setup = (fetcher: (url: string, init: RequestInit) => Promise<Response>) =>
  createApp(async () => { throw new Error("Auth must not call Modrinth"); }, { ...config, fetcher });
const request = (app: ReturnType<typeof createApp>, path: string, body: unknown, authorization?: string) =>
  app.request("/auth/" + path, { method: path === "password" ? "PATCH" : "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });

test("signup and recovery verification return only the JSON session without redirects", async () => {
  for (const type of ["signup", "recovery"]) {
    let calls = 0;
    const app = setup(async (url, init) => {
      calls++;
      expect(url).toBe(config.url + "/auth/v1/verify");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ token_hash: "email-token-hash", type });
      expect(new Headers(init.headers).get("authorization")).toBeNull();
      expect(new Headers(init.headers).get("apikey")).toBe(config.publishableKey);
      expect(init.redirect).toBe("error");
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ ...session, provider_token: "private", user: { ...user, user_metadata: { private: true } } });
    });
    const response = await request(app, "verify", { tokenHash: "email-token-hash", type }, "Bearer ignored");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ user, session: { accessToken: "access-token", refreshToken: "refresh-token", expiresIn: 3600, tokenType: "bearer" } });
    expect(calls).toBe(1);
  }
});

test("recovery requests acknowledge generically without returning provider data", async () => {
  for (const reply of [{ status: 200, body: { private: "hidden" } }, { status: 422, body: { error_code: "user_not_found" } }]) {
    let calls = 0;
    const app = setup(async (url, init) => {
      calls++;
      expect(url).toBe(config.url + "/auth/v1/recover");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ email: user.email });
      expect(new Headers(init.headers).get("authorization")).toBeNull();
      return Response.json(reply.body, { status: reply.status });
    });
    const response = await request(app, "recover", { email: user.email });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls).toBe(1);
  }
});

test("an authenticated password update forwards only the unchanged password and returns its owner", async () => {
  const password = "  New-password1!  ";
  let calls = 0;
  const app = setup(async (url, init) => {
    calls++;
    expect(url).toBe(config.url + "/auth/v1/user");
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer recovery-access-token");
    expect(JSON.parse(String(init.body))).toEqual({ password });
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    return Response.json({ ...user, user_metadata: { private: true } });
  });
  const response = await request(app, "password", { password }, "Bearer recovery-access-token");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toBe("Authorization");
  expect(calls).toBe(1);
  for (const authorization of [undefined, "Basic credentials", "Bearer invalid token"]) {
    const denied = await request(app, "password", { password }, authorization);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toBe("Bearer");
  }
  expect(calls).toBe(1);
});

const validInputs = { verify: { tokenHash: "email-token-hash", type: "recovery" }, recover: { email: user.email }, password: { password: "New-password1!" } };
test("invalid input, redirect injection and undeclared methods cannot consume email tokens or change passwords", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(session); });
  for (const [path, valid] of Object.entries(validInputs)) {
    for (const body of [null, [], {}, { ...valid, redirect_to: "https://evil.test" }, { ...valid, userId: user.id }, { ...valid, extra: "x".repeat(2048) }]) {
      expect((await request(app, path, body, "Bearer valid-token")).status).toBe(400);
    }
    expect((await app.request("/auth/" + path, { method: "GET" })).status).toBe(404);
    expect((await app.request("/auth/" + path, { method: path === "password" ? "POST" : "PATCH" })).status).toBe(404);
  }
  for (const body of [{ tokenHash: "x", type: "magiclink" }, { tokenHash: "x", type: ["signup"] }, { tokenHash: " ", type: "signup" }, { tokenHash: "x".repeat(1025), type: "recovery" }]) {
    expect((await request(app, "verify", body)).status).toBe(400);
  }
  expect((await request(app, "recover", { email: "invalid" })).status).toBe(400);
  expect((await request(app, "password", { password: "" }, "Bearer valid-token")).status).toBe(400);
  expect((await request(app, "password", { password: "x".repeat(1025) }, "Bearer valid-token")).status).toBe(400);
  expect((await app.request("/auth/verify", { method: "POST", body: "not-json" })).status).toBe(400);
  expect(calls).toBe(0);
});

test("email token rejection, provider failures and timeouts stay bounded, private and uncached", async () => {
  for (const [path, body] of Object.entries(validInputs)) {
    for (const [status, expected] of [[400, 400], [422, 400], [429, 429], [500, 502], [302, 502], [401, path === "password" ? 401 : path === "verify" ? 400 : 502]]) {
      let calls = 0;
      const response = await request(setup(async () => { calls++; return Response.json({ message: "private-token", error_code: "rejected" }, { status }); }), path, body, "Bearer valid-token");
      expect(response.status).toBe(expected);
      expect(await response.text()).not.toContain("private-token");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(calls).toBe(1);
    }
    for (const value of [null, [], { private: "x".repeat(65_536) }]) {
      expect((await request(setup(async () => Response.json(value)), path, body, "Bearer valid-token")).status).toBe(502);
    }
    expect((await request(setup(async () => { throw new DOMException("private", "TimeoutError"); }), path, body, "Bearer valid-token")).status).toBe(504);
    expect((await request(setup(async () => { throw new Error("private"); }), path, body, "Bearer valid-token")).status).toBe(502);
    const unconfigured = createApp(undefined, { ...config, publishableKey: "sb_secret_private", fetcher: async () => { throw new Error("must not fetch"); } });
    expect((await request(unconfigured, path, body, "Bearer valid-token")).status).toBe(503);
  }
  for (const value of [{}, { ...session, access_token: "" }, { ...session, refresh_token: null }, { ...session, user: {} }, { ...session, expires_in: -1 }, { ...session, token_type: "bad" }]) {
    expect((await request(setup(async () => Response.json(value)), "verify", validInputs.verify)).status).toBe(502);
  }
});
