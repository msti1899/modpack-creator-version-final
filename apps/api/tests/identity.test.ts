import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "player@example.test" };
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const catalog = async () => { throw new Error("Auth must not call the catalog fetcher"); };
function setup(fetcher = async (_url: string, _init: RequestInit) => Response.json(user), overrides = {}) {
  return createApp(catalog, { ...config, fetcher, ...overrides });
}
function me(app: ReturnType<typeof createApp>, authorization?: string) {
  return app.request("/me", { headers: authorization ? { authorization } : {} });
}
test("GET /me verifies with Auth and returns only the caller's identity", async () => {
  let calls = 0;
  const app = setup(async (url, init) => {
    calls++;
    expect(url).toBe("http://127.0.0.1:54321/auth/v1/user");
    expect(new Headers(init.headers).get("apikey")).toBe(config.publishableKey);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ ...user, user_metadata: { private: "hidden" }, refresh_token: "hidden" });
  });
  const response = await me(app, "bearer access-token");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
  expect(calls).toBe(1);
});
test("missing and malformed credentials are rejected without an Auth request", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(user); });
  for (const header of [undefined, "Basic token", "Bearer", "Bearer one two", "Bearer one,Bearer two", `Bearer ${"x".repeat(8193)}`]) {
    const response = await me(app, header);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(calls).toBe(0);
});
test("invalid and expired tokens map to unauthorized, not trusted decoded claims", async () => {
  for (const token of ["invalid-token", "expired-token", "sb_publishable_not-a-user"]) {
    const response = await me(setup(async () => Response.json({ message: token }, { status: 401 })), `Bearer ${token}`);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.text()).not.toContain(token);
  }
});
test("configuration failures do not make outbound requests or expose privileged keys", async () => {
  const privileged = `a.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.c`;
  let calls = 0;
  for (const overrides of [{ url: undefined }, { publishableKey: undefined }, { url: "http://example.com" }, { url: "https://user:secret@example.com" }, { url: "https://example.com/?secret=x" }, { publishableKey: "sb_secret_private" }, { publishableKey: privileged }]) {
    const response = await me(setup(async () => { calls++; return Response.json(user); }, overrides), "Bearer token");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  }
  expect(calls).toBe(0);
});
test("legacy anon API keys are supported without treating their payload as a user", async () => {
  const key = `a.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.c`;
  const response = await me(setup(async () => Response.json({ ...user, email: null }), { publishableKey: key }), "Bearer token");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: { ...user, email: null } });
});
test("upstream outages and timeouts are distinct from invalid sessions", async () => {
  for (const [status, expected] of [[400, 401], [403, 401], [429, 502], [500, 502]]) {
    const response = await me(setup(async () => Response.json({ message: "private-token-detail" }, { status })), "Bearer token");
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain("private-token-detail");
  }
  for (const [error, expected] of [[new Error("private-token-detail"), 502], [new DOMException("private-token-detail", "TimeoutError"), 504]] as const) {
    const response = await me(setup(async () => { throw error; }), "Bearer token");
    expect(response.status).toBe(expected);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("private-token-detail");
  }
});
test("malformed or excessive Auth responses cannot become identities", async () => {
  for (const value of [null, { id: "not-a-user" }, { ...user, email: {} }]) {
    expect((await me(setup(async () => Response.json(value)), "Bearer token")).status).toBe(502);
  }
  expect((await me(setup(async () => new Response("invalid JSON")), "Bearer token")).status).toBe(502);
  expect((await me(setup(async () => new Response("x".repeat(65_537))), "Bearer token")).status).toBe(502);
});
test("body timeouts and redirects never expose upstream data", async () => {
  const stream = new ReadableStream({ start(controller) { controller.error(new DOMException("private-token-detail", "AbortError")); } });
  expect((await me(setup(async () => new Response(stream)), "Bearer token")).status).toBe(504);
  expect((await me(setup(async () => new Response("private-token-detail", { status: 302 })), "Bearer token")).status).toBe(502);
});
test("identities are neither cached nor shared across concurrent requests", async () => {
  let calls = 0;
  const other = { ...user, id: "22222222-2222-4222-8222-222222222222" };
  const app = setup(async (_url, init) => {
    calls++;
    const first = new Headers(init.headers).get("authorization") === "Bearer first";
    if (first) await Bun.sleep(5);
    return Response.json(first ? user : other);
  });
  const [first, second] = await Promise.all([me(app, "Bearer first"), me(app, "Bearer second")]);
  expect((await first.json()).user.id).toBe(user.id);
  expect((await second.json()).user.id).toBe(other.id);
  expect((await me(app, "Bearer first")).status).toBe(200);
  expect(calls).toBe(3);
});
test("existing health and unknown routes remain public without identity configuration", async () => {
  const app = createApp(catalog, {});
  expect(await (await app.request("/health")).json()).toEqual({ status: "ok", service: "modpack-api" });
  expect((await app.request("/not-found")).status).toBe(404);
  expect((await me(app, "Bearer token")).status).toBe(503);
});
