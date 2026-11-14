import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";
const accessToken = clerkToken();

const user = { id: "user_player", email: "player@example.test" };
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const profile = { username: "Matias", username_changed_at: null };
function setup(data = async (_url: string, _init: RequestInit) => Response.json([profile])) {
  return createApp(async () => { throw new Error("Profiles must not call Modrinth"); },
    clerk, data, config);
}
function request(app: ReturnType<typeof createApp>, method = "GET", body?: unknown) {
  return app.request("/profile", { method, headers: { authorization: `bearer ${accessToken}`, "content-type": "application/json" },
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
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
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
  expect((await app.request("/profile", { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: "not json" })).status).toBe(400);
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

test("a new account reads an empty profile, creates one, and then reads it back", async () => {
  let assigned = false;
  const app = setup(async (_url, init) => {
    if (init.method === "POST") {
      assigned = true;
      return Response.json([{ username: "Matias", username_changed_at: null }], { status: 201 });
    }
    return Response.json(assigned ? [profile] : []);
  });
  expect(await (await request(app)).json()).toEqual({ profile: null });
  const created = await request(app, "POST", { username: "Matias" });
  expect(created.status).toBe(201);
  expect(await (await request(app)).json()).toEqual({ profile: { username: "Matias", usernameChangedAt: null } });
});

test("profile onboarding tells an assigned account apart from a taken username", async () => {
  const conflict = () => Response.json({ code: "23505", message: "duplicate key value violates unique constraint \"profiles_username_unique\"", details: "private" }, { status: 409 });
  const assigned = setup(async (_url, init) => init.method === "GET" ? Response.json([{ username: "Other", username_changed_at: null }]) : conflict());
  let response = await request(assigned, "POST", { username: "Matias" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Profile already exists." });

  const taken = setup(async (_url, init) => init.method === "GET" ? Response.json([]) : conflict());
  response = await request(taken, "POST", { username: "Matias" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Username is already taken." });

  const unknown = setup(async (_url, init) => init.method === "GET" ? new Response("private", { status: 500 }) : conflict());
  response = await request(unknown, "POST", { username: "Matias" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Profile or username already exists." });

  const rename = setup(async () => conflict());
  response = await request(rename, "PATCH", { username: "Matias" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Username is already taken." });
});

test("profile collision classification reads only the verified owner's profile", async () => {
  const calls: { method: string; target: URL }[] = [];
  const app = setup(async (url, init) => {
    calls.push({ method: init.method ?? "GET", target: new URL(url) });
    if (init.method === "POST") return Response.json({ code: "23505", message: "private", details: "secret" }, { status: 409 });
    return Response.json([profile]);
  });
  const response = await request(app, "POST", { username: "Matias" });
  expect(response.status).toBe(409);
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({ error: "Profile already exists." });
  expect(calls.map((call) => call.method)).toEqual(["POST", "GET"]);
  expect(calls[1]!.target.searchParams.get("user_id")).toBe("eq." + user.id);
  expect(calls[1]!.target.searchParams.get("select")).toBe("username,username_changed_at");
  expect(body).not.toMatch(/private|secret|profiles_username_unique/);
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
  const response = await app.request("/profile?user_id=other&select=private", { headers: { authorization: `Bearer ${accessToken}` } });
  expect(response.status).toBe(200);
  expect(calls).toBe(1);
  expect(await (await app.request("/me", { headers: { authorization: `Bearer ${accessToken}` } })).json()).toEqual({ user });
  expect((await app.request("/health")).status).toBe(200);
  expect((await app.request("/not-found")).status).toBe(404);
  expect((await app.request("/profile/not-found")).status).toBe(404);
  // Account deletion is a deliberate contract change: the route exists and refuses an
  // unauthenticated caller instead of being absent. Its full behavior is covered by
  // account-deletion.test.ts.
  expect((await app.request("/profile", { method: "DELETE" })).status).toBe(401);
});

test("profile database configuration is independent, guarded and never accepts privileged keys", async () => {
  let calls = 0;
  const privileged = `a.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.c`;
  for (const database of [{}, { ...config, url: "http://remote.test" }, { ...config, url: "https://db.test/?secret=x" },
    { ...config, url: "https://user:private@db.test" }, { ...config, publishableKey: "sb_secret_private" }, { ...config, publishableKey: privileged }]) {
    const app = createApp(undefined, clerk, async () => { calls++; return Response.json([profile]); }, database);
    const response = await request(app);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Profile service is not configured." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(calls).toBe(0);
});

test("legacy Supabase credential endpoints are absent under Clerk-only auth", async () => {
  const app = setup();
  for (const [method, path] of [["POST", "/auth/register"], ["POST", "/auth/login"], ["POST", "/auth/verify"],
    ["POST", "/auth/recover"], ["PATCH", "/auth/password"], ["POST", "/auth/refresh"], ["POST", "/auth/logout"]]) {
    expect((await app.request(path, { method, headers: { authorization: `Bearer ${accessToken}` }, body: "{}" })).status).toBe(404);
  }
});

test("profile access never forwards a Clerk token with missing or privileged database role", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json([profile]); });
  for (const role of [undefined, "anon", "service_role", "postgres", { private: true }]) {
    const authorization = `Bearer ${clerkToken({ role })}`;
    expect((await app.request("/me", { headers: { authorization } })).status).toBe(200);
    const response = await app.request("/profile", { headers: { authorization } });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  }
  expect(calls).toBe(0);
});

test("profile data access can use a separate safe project without changing identity or owner scope", async () => {
  const database = { url: "https://database.example.test", publishableKey: "sb_publishable_database_test" };
  let calls = 0;
  const app = createApp(undefined, clerk, async (url, init) => {
    calls++;
    const target = new URL(url);
    expect(target.origin).toBe(database.url);
    expect(target.pathname).toBe("/rest/v1/profiles");
    expect(target.searchParams.get("user_id")).toBe("eq." + user.id);
    expect(new Headers(init.headers).get("apikey")).toBe(database.publishableKey);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
    return Response.json([profile]);
  }, database);
  expect((await request(app)).status).toBe(200);
  expect(calls).toBe(1);
});

test("conflict classification fails safe and ignores submitted scope", async () => {
  const conflict = () => Response.json({ code: "23505", message: "private", details: "secret" }, { status: 409 });
  const unsafe: (() => Response)[] = [
    () => new Response("private", { status: 500 }),
    () => new Response("private token", { status: 401 }),
    () => new Response("not json", { status: 200 }),
    () => Response.json({ user_id: user.id }),
    () => Response.json([profile, profile]),
    () => Response.json([null]),
    () => Response.json([{}]),
    () => Response.json([{ username: "bad-name", username_changed_at: null }]),
    () => Response.json([{ ...profile, username_changed_at: "not a timestamp" }]),
    () => new Response("x".repeat(4097), { status: 200 }),
    () => { throw new Error("private-network"); },
    () => { throw new DOMException("private", "TimeoutError"); },
  ];
  for (const lookup of unsafe) {
    const app = setup(async (_url, init) => init.method === "POST" ? conflict() : lookup());
    const response = await request(app, "POST", { username: "Matias" });
    expect(response.status).toBe(409);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "Profile or username already exists." });
    expect(body).not.toMatch(/private|secret|profiles_username_unique/);
  }

  const calls: { method: string; url: string; authorization: string | null; body: unknown }[] = [];
  const app = setup(async (url, init) => {
    calls.push({ method: init.method!, url, authorization: new Headers(init.headers).get("authorization"), body: init.body });
    return init.method === "POST" ? conflict() : Response.json([profile]);
  });
  const response = await app.request("/profile?user_id=attacker&select=private", {
    method: "POST", headers: { authorization: `bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ username: "Matias" }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Profile already exists." });
  expect(calls.map((call) => call.method)).toEqual(["POST", "GET"]);
  const followUp = calls[1]!;
  const target = new URL(followUp.url);
  expect(target.pathname).toBe("/rest/v1/profiles");
  expect(target.searchParams.get("user_id")).toBe("eq." + user.id);
  expect(target.searchParams.get("select")).toBe("username,username_changed_at");
  expect([...target.searchParams.keys()].sort()).toEqual(["select", "user_id"]);
  expect(followUp.authorization).toBe(`Bearer ${accessToken}`);
  expect(followUp.body).toBeUndefined();
  expect(calls[0]!.body).toBe(JSON.stringify({ user_id: user.id, username: "Matias" }));

  const renameCalls: string[] = [];
  const rename = setup(async (_url, init) => { renameCalls.push(init.method!); return conflict(); });
  const renamed = await request(rename, "PATCH", { username: "NextName" });
  expect(renamed.status).toBe(409);
  expect(await renamed.json()).toEqual({ error: "Username is already taken." });
  expect(renameCalls).toEqual(["PATCH"]);
});
