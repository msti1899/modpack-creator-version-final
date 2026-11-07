import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "player@example.test" };
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const profile = { username: "Matias", username_changed_at: null };
function setup(data = async (_url: string, _init: RequestInit) => Response.json([profile])) {
  return createApp(async () => { throw new Error("Profiles must not call Modrinth"); },
    { ...config, fetcher: async () => Response.json(user) }, data);
}
function request(app: ReturnType<typeof createApp>, method = "GET", body?: unknown) {
  return app.request("/profile", { method, headers: { authorization: "bearer access-token", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}

test("profile reads require identity and scope Data API access to the verified owner", async () => {
  let calls = 0;
  const app = setup(async (url, init) => {
    calls++;
    const target = new URL(url);
    expect(target.origin + target.pathname).toBe(config.url + "/rest/v1/profiles");
    expect(target.searchParams.get("user_id")).toBe("eq." + user.id);
    expect(target.searchParams.get("select")).toBe("username,username_changed_at");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(new Headers(init.headers).get("apikey")).toBe(config.publishableKey);
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return Response.json([{ ...profile, private: "hidden" }]);
  });
  expect((await app.request("/profile")).status).toBe(401);
  expect(calls).toBe(0);
  const response = await request(app);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ profile: { username: "Matias", usernameChangedAt: null } });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
});

test("profile assignment and rename send only permitted own-user columns", async () => {
  for (const method of ["POST", "PATCH"]) {
    const app = setup(async (url, init) => {
      expect(new URL(url).searchParams.get("user_id")).toBe("eq." + user.id);
      expect(init.method).toBe(method);
      expect(new Headers(init.headers).get("prefer")).toBe("return=representation");
      expect(JSON.parse(String(init.body))).toEqual(method === "POST" ? { user_id: user.id, username: "Mati_1899" } : { username: "Mati_1899" });
      return Response.json([{ username: "Mati_1899", username_changed_at: method === "POST" ? null : "2026-11-05T12:00:00Z" }], { status: method === "POST" ? 201 : 200 });
    });
    const response = await request(app, method, { username: "Mati_1899" });
    expect(response.status).toBe(method === "POST" ? 201 : 200);
    expect((await response.json()).profile.username).toBe("Mati_1899");
  }
});

test("profile writes reject invalid names, forged fields, and unbounded JSON before Data API access", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json([profile], { status: 201 }); });
  for (const body of [{ username: "ab" }, { username: "a".repeat(21) }, { username: "ábc" }, { username: "has space" },
    { username: "abc\n" }, { username: "abc-" }, { username: 123 }, {}, null, [], { username: "Matias", user_id: user.id },
    { username: "Matias", username_changed_at: null }, { username: "a".repeat(2048) }]) {
    expect((await request(app, "POST", body)).status).toBe(400);
    expect((await request(app, "PATCH", body)).status).toBe(400);
  }
  expect((await app.request("/profile", { method: "POST", headers: { authorization: "Bearer token" }, body: "not json" })).status).toBe(400);
  expect(calls).toBe(0);
  for (const username of ["A_1", "Z".repeat(20)]) expect((await request(app, "POST", { username })).status).toBe(201);
});

test("missing profiles are distinct from failed writes and database conflicts are safe", async () => {
  const empty = setup(async () => Response.json([]));
  expect(await (await request(empty)).json()).toEqual({ profile: null });
  expect((await request(empty, "PATCH", { username: "NextName" })).status).toBe(404);
  for (const [code, message, status] of [["23505", "private unique constraint", 409],
    ["P0001", "Username can only be changed every 30 days.", 400]] as const) {
    const response = await request(setup(async () => Response.json({ code, message, details: "secret database detail" }, { status })), "PATCH", { username: "NextName" });
    expect(response.status).toBe(409);
    expect(await response.text()).not.toMatch(/secret|private/);
  }
});

test("Data API auth expiry, outages, malformed responses, and body timeouts are bounded", async () => {
  const expired = await request(setup(async () => new Response("private token", { status: 401 })));
  expect(expired.status).toBe(401);
  expect(expired.headers.get("www-authenticate")).toBe("Bearer");
  for (const value of [null, {}, [profile, profile], [{ username: "bad-name", username_changed_at: null }],
    [{ ...profile, username_changed_at: "not a timestamp" }]]) {
    expect((await request(setup(async () => Response.json(value)))).status).toBe(502);
  }
  for (const status of [302, 403, 429, 500]) {
    const response = await request(setup(async () => Response.json({ code: "private-code", details: "secret" }, { status })));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/private|secret/);
  }
  expect((await request(setup(async () => new Response("x".repeat(4097))))).status).toBe(502);
  expect((await request(setup(async () => { throw new Error("private-network"); }))).status).toBe(502);
  expect((await request(setup(async () => { throw new DOMException("private", "TimeoutError"); }))).status).toBe(504);
  const stalled = () => new ReadableStream<Uint8Array>({ start(c) { c.error(new DOMException("private", "AbortError")); } });
  expect((await request(setup(async () => new Response(stalled())))).status).toBe(504);
});

test("profile credentials and owner filters cannot be supplied through request data", async () => {
  let calls = 0;
  const app = setup(async (url) => { calls++; expect(new URL(url).searchParams.get("user_id")).toBe("eq." + user.id); return Response.json([profile]); });
  for (const method of ["GET", "POST", "PATCH"]) {
    expect((await app.request("/profile", { method })).status).toBe(401);
    expect((await app.request("/profile", { method, headers: { authorization: "Bearer bad token" } })).status).toBe(401);
  }
  expect(calls).toBe(0);
  const response = await app.request("/profile?user_id=other&select=private", { headers: { authorization: "Bearer access-token" } });
  expect(response.status).toBe(200);
  expect(calls).toBe(1);
  expect(await (await app.request("/me", { headers: { authorization: "Bearer access-token" } })).json()).toEqual({ user });
  expect((await app.request("/health")).status).toBe(200);
  expect((await app.request("/not-found")).status).toBe(404);
  expect((await app.request("/profile/not-found")).status).toBe(404);
  expect((await app.request("/profile", { method: "DELETE" })).status).toBe(404);
});

test("profile database configuration is independently guarded against unsafe URLs and privileged keys", async () => {
  let calls = 0;
  const privileged = `a.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.c`;
  for (const database of [{}, { ...config, url: "http://remote.test" }, { ...config, url: "https://db.test/?secret=x" },
    { ...config, url: "https://user:private@db.test" }, { ...config, publishableKey: "sb_secret_private" }, { ...config, publishableKey: privileged }]) {
    const app = createApp(undefined, { ...config, fetcher: async () => Response.json(user) },
      async () => { calls++; return Response.json([profile]); }, database);
    const response = await request(app);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Profile service is not configured." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(calls).toBe(0);
});

test("profile data access can use a separate safe project without changing identity or owner scope", async () => {
  const database = { url: "https://database.example.test", publishableKey: "sb_publishable_database_test" };
  let calls = 0;
  const app = createApp(undefined, { ...config, fetcher: async () => Response.json(user) }, async (url, init) => {
    calls++;
    const target = new URL(url);
    expect(target.origin).toBe(database.url);
    expect(target.pathname).toBe("/rest/v1/profiles");
    expect(target.searchParams.get("user_id")).toBe("eq." + user.id);
    expect(new Headers(init.headers).get("apikey")).toBe(database.publishableKey);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    return Response.json([profile]);
  }, database);
  expect((await request(app)).status).toBe(200);
  expect(calls).toBe(1);
});
