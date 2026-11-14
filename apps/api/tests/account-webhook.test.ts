import { expect, test } from "bun:test";
import { createHmac, randomBytes } from "node:crypto";
import { createApp } from "../src/index";
import { clerk } from "./fixtures/clerk";

const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const secretKey = "sb_secret_local_fixture";
// Standard Webhooks signs its secret with base64 after an optional `whsec_` prefix.
const rawSecret = randomBytes(24).toString("base64");
const webhooks = { signingSecret: `whsec_${rawSecret}`, secretKey };
const noCatalog = async () => { throw new Error("Webhooks must not call Modrinth"); };
const succeeded = { deleted: true, groupId: null, groupDeleted: false, transferredTo: null };

function signed(body: string, options: { id?: string; timestamp?: number; secret?: string } = {}) {
  const id = options.id ?? "msg_1";
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(options.secret ?? rawSecret, "base64"))
    .update(`${id}.${timestamp}.${body}`).digest("base64");
  return { "content-type": "application/json", "svix-id": id,
    "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` };
}

function setup(fetcher = async (_url: string, _init: RequestInit) => Response.json(succeeded),
  options: { signingSecret?: string; secretKey?: string } | null = webhooks) {
  return createApp(noCatalog, clerk, fetcher, config, options ?? {});
}
function deliver(app: ReturnType<typeof setup>, body: string, headers: Record<string, string> = signed(body)) {
  return app.request("/webhooks/clerk", { method: "POST", headers, body });
}
const deleted = JSON.stringify({ type: "user.deleted", object: "event",
  data: { id: "user_deleted", object: "user", deleted: true } });

test("a verified provider deletion forwards one service-role RPC call", async () => {
  let calls = 0;
  const app = setup(async (url, init) => {
    calls++;
    expect(url).toBe(config.url + "/rest/v1/rpc/delete_account_for");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("apikey")).toBe(secretKey);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${secretKey}`);
    expect(JSON.parse(String(init.body))).toEqual({ p_sub: "user_deleted" });
    return Response.json({ ...succeeded, groupId: "11111111-1111-4111-8111-111111111111",
      transferredTo: "user_heir" });
  });
  const response = await deliver(app, deleted);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toBe(1);
});

test("an unconfigured or unverifiable delivery never reaches the database", async () => {
  for (const options of [{}, { secretKey }, { signingSecret: "" }]) {
    let calls = 0;
    const unconfigured = createApp(noCatalog, clerk, async () => { calls++; return Response.json(succeeded); }, config, options);
    const response = await deliver(unconfigured, deleted);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Webhook verification is not configured." });
    expect(calls).toBe(0);
  }
  let calls = 0;
  const noSecret = createApp(noCatalog, clerk, async () => { calls++; return Response.json(succeeded); },
    config, { signingSecret: webhooks.signingSecret });
  const unconfiguredService = await deliver(noSecret, deleted);
  expect(unconfiguredService.status).toBe(503);
  expect(await unconfiguredService.json()).toEqual({ error: "Account service is not configured." });
  expect(calls).toBe(0);
  const app = setup(async () => { calls++; return Response.json(succeeded); });
  for (const headers of [{ "content-type": "application/json" },
    signed(deleted, { secret: randomBytes(24).toString("base64") }),
    signed(deleted, { timestamp: Math.floor(Date.now() / 1000) - 600 }),
    { ...signed(deleted), "svix-signature": "v1,AAAA" }]) {
    const response = await deliver(app, deleted, headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid webhook signature." });
  }
  expect(calls).toBe(0);
});

test("every event other than user.deleted is acknowledged and ignored", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(succeeded); });
  for (const type of ["user.created", "user.updated", "session.created", "organization.created"]) {
    const body = JSON.stringify({ type, object: "event", data: { id: "user_other" } });
    const response = await deliver(app, body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
  }
  expect(calls).toBe(0);
});

test("a deletion without a Clerk subject is refused before the write", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(succeeded); });
  for (const data of [{ id: "not-a-clerk-id" }, { id: 42 }, {}, null]) {
    const response = await deliver(app, JSON.stringify({ type: "user.deleted", object: "event", data }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid webhook payload." });
  }
  expect(calls).toBe(0);
});

test("an oversized delivery is refused without verification", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(succeeded); });
  const body = JSON.stringify({ type: "user.deleted", object: "event",
    data: { id: "user_deleted", padding: "a".repeat(70_000) } });
  const response = await deliver(app, body, { ...signed(body), "content-length": String(body.length) });
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: "Webhook body is too large." });
  expect(calls).toBe(0);
});

test("service failures stay distinct and never report success", async () => {
  for (const [status, body, expected, error] of [
    [401, { message: "bad jwt" }, 503, "Account service is not configured."],
    [403, { message: "permission denied for function delete_account_for" }, 503, "Account service is not configured."],
    [400, { code: "P0001", message: "Invalid account subject." }, 502, "Account service unavailable."],
    [500, { message: "sentinel internal detail" }, 502, "Account service unavailable."],
  ] as const) {
    const app = setup(async () => Response.json(body, { status }));
    const response = await deliver(app, deleted);
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({ error });
  }
  const timeout = setup(async () => { throw Object.assign(new Error("slow"), { name: "TimeoutError" }); });
  expect((await deliver(timeout, deleted)).status).toBe(504);
  expect(await (await deliver(timeout, deleted)).json()).toEqual({ error: "Account service timed out." });
  const broken = setup(async () => new Response("not json"));
  expect((await deliver(broken, deleted)).status).toBe(502);
  for (const body of [{ deleted: false, groupId: "11111111-1111-4111-8111-111111111111", groupDeleted: false },
    { deleted: true, groupId: null, groupDeleted: true },
    { deleted: true, groupId: "not-a-uuid", groupDeleted: false, transferredTo: null },
    { deleted: true, groupId: null, groupDeleted: false, transferredTo: "heir" },
    { deleted: true, groupId: null, groupDeleted: false, transferredTo: 7 }, []]) {
    const app = setup(async () => Response.json(body));
    expect((await deliver(app, deleted)).status).toBe(502);
  }
});

test("the secret key configuration rejects a publishable or wrongly-roled credential", async () => {
  for (const key of ["sb_publishable_local_fixture",
    `a.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.c`,
    "a.b.c", "not-a-key"]) {
    let calls = 0;
    const app = createApp(noCatalog, clerk, async () => { calls++; return Response.json(succeeded); },
      config, { signingSecret: webhooks.signingSecret, secretKey: key });
    const response = await deliver(app, deleted);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Account service is not configured." });
    expect(calls).toBe(0);
  }
});

test("a legacy service-role JWT is accepted for the provider write", async () => {
  const legacy = `a.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.c`;
  let calls = 0;
  const app = createApp(noCatalog, clerk, async (_url, init) => {
    calls++;
    expect(new Headers(init.headers).get("apikey")).toBe(legacy);
    return Response.json(succeeded);
  }, config, { signingSecret: webhooks.signingSecret, secretKey: legacy });
  expect((await deliver(app, deleted)).status).toBe(200);
  expect(calls).toBe(1);
});
