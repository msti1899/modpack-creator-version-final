import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const token = clerkToken();
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const groupId = "11111111-1111-4111-8111-111111111111";
const noCatalog = async () => { throw new Error("Account deletion must not call Modrinth"); };
function setup(fetcher = async (_url: string, _init: RequestInit) =>
  Response.json({ deleted: true, groupId, groupDeleted: true })) {
  return createApp(noCatalog, clerk, fetcher, config);
}
function request(app: ReturnType<typeof setup>, body?: string, bearer = token) {
  return app.request("/profile", { method: "DELETE",
    headers: { Authorization: `bearer ${bearer}`, "Content-Type": "application/json" }, body });
}

test("account deletion requires verified identity and forwards one empty RPC call", async () => {
  let calls = 0;
  const app = setup(async (url, init) => {
    calls++;
    expect(url).toBe(config.url + "/rest/v1/rpc/delete_my_account");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(init.headers).get("apikey")).toBe(config.publishableKey);
    expect(JSON.parse(String(init.body))).toEqual({});
    return Response.json({ deleted: true, groupId, groupDeleted: true, secret: "sentinel" });
  });
  const unauthenticated = await app.request("/profile", { method: "DELETE" });
  expect(unauthenticated.status).toBe(401);
  expect(await unauthenticated.json()).toEqual({ error: "Authentication required." });
  expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
  expect(calls).toBe(0);
  const response = await request(app);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ account: { deleted: true, group: { id: groupId, deleted: true } } });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
  expect(calls).toBe(1);
});

test("a token without the authenticated database role never reaches the database", async () => {
  for (const role of ["anon", undefined, "service_role"]) {
    let calls = 0;
    const app = setup(async () => { calls++; return Response.json({}); });
    const response = await request(app, undefined, clerkToken({ role }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(calls).toBe(0);
  }
});

test("the response distinguishes a surviving group from an idempotent repeat", async () => {
  const surviving = setup(async () => Response.json({ deleted: true, groupId, groupDeleted: false }));
  expect(await (await request(surviving)).json()).toEqual({ account: { deleted: true, group: { id: groupId, deleted: false } } });
  const repeated = setup(async () => Response.json({ deleted: false, groupId: null, groupDeleted: false }));
  expect(await (await request(repeated)).json()).toEqual({ account: { deleted: false, group: null } });
});

test("a deletion body must be absent or an empty JSON object", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json({ deleted: true, groupId, groupDeleted: false }); });
  expect((await request(app, "{}")).status).toBe(200);
  expect(calls).toBe(1);
  for (const body of ['{"extra":1}', '{"deleted":true}', "not json", "[]", "null"]) {
    const response = await request(app, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid or oversized JSON body." });
  }
  expect(calls).toBe(1);
  expect((await request(app, "{" + '"pad":"' + "a".repeat(1024) + '"' + "}")).status).toBe(400);
  expect(calls).toBe(1);
});

test("transfer-before-deletion is the documented conflict and writes nothing else", async () => {
  const app = setup(async () => Response.json({
    code: "P0001", message: "Transfers are required before leaving a group with other members.",
  }, { status: 400 }));
  const response = await request(app);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Transfers are required before leaving a group with other members." });
});

test("other upstream failures stay generic and keep the client state", async () => {
  for (const [status, body] of [[400, { code: "P0001", message: "Some other rule." }],
    [400, { code: "P0001" }], [400, { code: "23503", message: "violates foreign key constraint" }],
    [403, { message: "permission denied for function delete_my_account" }],
    [500, { message: "sentinel internal detail" }]] as const) {
    const app = setup(async () => Response.json(body, { status }));
    const response = await request(app);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Profile service unavailable." });
  }
  const unauthorized = setup(async () => new Response("sentinel-token", { status: 401 }));
  const response = await request(unauthorized);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Authentication required." });
  expect(response.headers.get("www-authenticate")).toBe("Bearer");
});

test("unconfigured, timed-out and malformed responses fail closed", async () => {
  const missing = createApp(noCatalog, clerk, async () => Response.json({}), {});
  expect((await request(missing)).status).toBe(503);
  expect(await (await request(missing)).json()).toEqual({ error: "Profile service is not configured." });
  const timeout = setup(async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); });
  expect((await request(timeout)).status).toBe(504);
  expect(await (await request(timeout)).json()).toEqual({ error: "Profile service timed out." });
  const broken = setup(async () => new Response("not json"));
  expect((await request(broken)).status).toBe(502);
  for (const body of [{ deleted: true }, { deleted: "yes", groupId: null, groupDeleted: false },
    { deleted: true, groupId: "not-a-uuid", groupDeleted: false },
    { deleted: true, groupId: null, groupDeleted: true },
    { deleted: true, groupId, groupDeleted: "true" }, { deleted: false, groupId, groupDeleted: false },
    { deleted: false, groupId, groupDeleted: true }, [], "ok"]) {
    const app = setup(async () => Response.json(body));
    const response = await request(app);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Profile service unavailable." });
  }
});
