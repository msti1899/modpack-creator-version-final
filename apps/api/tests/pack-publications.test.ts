import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const bearer = clerkToken();
const database = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const groupId = "11111111-1111-4111-8111-111111111111";
const publicationId = "22222222-2222-4222-8222-222222222222";
const otherPublicationId = "33333333-3333-4333-8333-333333333333";
const selection = { gameVersion: "1.21.1", loader: "fabric", versionIds: ["main-v", "dep-v"] };
const draft = { ...selection, revision: 1, updatedAt: "2026-11-12T00:00:00Z" };
const draftContext = { groupId, role: "owner", draft };
const publication = {
  id: publicationId, sequence: 1, name: "Friends pack", version: "1.0.0", loaderVersion: "0.16.0",
  ...selection, active: false, publishedAt: "2026-11-12T00:00:00Z",
};
const publicationList = {
  groupId, role: "owner", activePublicationId: null, publications: [publication], nextBeforeSequence: null,
};
const publicationDetail = { groupId, role: "owner", publication };
const activeResult = { groupId, activePublicationId: publicationId };
const presentation = { name: "Friends pack", version: "1.0.0", loaderVersion: "0.16.0", expectedRevision: 1 };

const metadata = (id: string, project: string) => ({
  id, project_id: project, name: id, version_number: "1.0", date_published: "2026-01-01",
  game_versions: ["1.21.1", "1.21.2"], loaders: ["fabric", "quilt"],
  dependencies: [],
  files: [{ filename: project + ".jar", primary: true, hashes: { sha1: "a".repeat(40), sha512: "b".repeat(128) },
    url: `https://cdn.modrinth.com/data/${project}/versions/${id}/mod.jar`, size: 100 }],
});
const catalog: Record<string, unknown> = {
  "/version/main-v": { ...metadata("main-v", "main"), dependencies: [{ dependency_type: "required", project_id: "dep", version_id: "dep-v" }] },
  "/version/dep-v": metadata("dep-v", "dep"),
  "/project/main": { id: "main", project_type: "mod", client_side: "required", server_side: "optional" },
  "/project/dep": { id: "dep", project_type: "mod", client_side: "required", server_side: "optional" },
};

type Options = {
  responses?: Record<string, unknown>;
  failures?: Record<string, { status: number; body: unknown }>;
  faults?: { data?: Error };
  database?: { url: string; publishableKey?: string };
  modules?: Record<string, { status?: number; body?: unknown; fault?: Error }>;
};

function setup(options: Options = {}) {
  const operations: { name: string; args: unknown }[] = [];
  const lookups: string[] = [];
  const defaults: Record<string, unknown> = {
    my_pack_draft: draftContext,
    my_pack_publications: publicationList,
    my_pack_publication: publicationDetail,
    publish_pack_draft: publicationDetail,
    activate_pack_publication: activeResult,
  };
  const api = createApp(async (input) => {
    const path = new URL(String(input)).pathname.replace("/v2", "");
    lookups.push(path);
    const override = options.modules?.[path];
    if (override?.fault) throw override.fault;
    if (override) return override.body === undefined
      ? new Response(null, { status: override.status ?? 200 })
      : Response.json(override.body, { status: override.status ?? 200 });
    const value = catalog[path];
    return value ? Response.json(value) : new Response(null, { status: 404 });
  }, clerk, async (url, init) => {
    if (options.faults?.data) throw options.faults.data;
    const name = new URL(url).pathname.split("/").at(-1)!;
    operations.push({ name, args: JSON.parse(String(init.body)) });
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${bearer}`);
    expect(new Headers(init.headers).get("apikey")).toBe(database.publishableKey);
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const failure = options.failures?.[name];
    if (failure) return Response.json(failure.body, { status: failure.status });
    return Response.json(options.responses?.[name] ?? defaults[name]);
  }, options.database ?? database);
  const request = (method: string, body?: unknown, path = "/groups/me/pack", token = bearer) => api.request(path, {
    method, headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { api, request, operations, lookups };
}

test("publication routes require verified Clerk database identity before any upstream call", async () => {
  const { request, operations, lookups } = setup();
  for (const [method, path, body] of [
    ["GET", "/groups/me/pack/publications", undefined],
    ["GET", `/groups/me/pack/publications/${publicationId}`, undefined],
    ["GET", `/groups/me/pack/publications/${publicationId}/export`, undefined],
    ["POST", "/groups/me/pack/publications", presentation],
    ["PUT", "/groups/me/pack/active-version", { publicationId }],
  ] as const) {
    for (const token of ["bad", clerkToken({ role: undefined })]) {
      const response = await request(method, body, path, token);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Authentication required." });
    }
  }
  expect(operations).toEqual([]);
  expect(lookups).toEqual([]);
});

test("the owner publishes the current draft with frozen presentation metadata", async () => {
  const { request, operations, lookups } = setup();
  const response = await request("POST", presentation, "/groups/me/pack/publications");
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(publicationDetail);
  expect(operations).toEqual([
    { name: "my_pack_draft", args: {} },
    { name: "publish_pack_draft", args: { p_name: "Friends pack", p_pack_version: "1.0.0",
      p_loader_version: "0.16.0", p_expected_revision: 1 } },
  ]);
  expect(lookups.sort()).toEqual(Object.keys(catalog).sort());
});

test("publishing never activates a version and activation is a separate owner action", async () => {
  const publish = setup();
  const published = await publish.request("POST", presentation, "/groups/me/pack/publications");
  expect((await published.json()).publication.active).toBe(false);
  expect(publish.operations.map((operation) => operation.name)).not.toContain("activate_pack_publication");

  const activate = setup();
  const response = await activate.request("PUT", { publicationId }, "/groups/me/pack/active-version");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(activeResult);
  expect(activate.operations).toEqual([{ name: "activate_pack_publication", args: { p_publication_id: publicationId } }]);
});

test("members read their group's publications but cannot publish or activate", async () => {
  const { request, operations, lookups } = setup({
    responses: {
      my_pack_draft: { ...draftContext, role: "member" },
      my_pack_publications: { ...publicationList, role: "member" },
    },
    failures: { activate_pack_publication: { status: 400,
      body: { code: "P0001", message: "Only the group owner may manage published versions." } } },
  });
  const read = await request("GET", undefined, "/groups/me/pack/publications");
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({ ...publicationList, role: "member" });
  for (const [method, path, body] of [
    ["POST", "/groups/me/pack/publications", presentation],
    ["PUT", "/groups/me/pack/active-version", { publicationId }],
  ] as const) {
    const response = await request(method, body, path);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Only the group owner may manage published versions." });
  }
  expect(lookups).toEqual([]);
  expect(operations.map((operation) => operation.name))
    .toEqual(["my_pack_publications", "my_pack_draft", "activate_pack_publication"]);
});

test("stale, missing or empty drafts are rejected before catalog validation", async () => {
  for (const [inputs, status, message, calls] of [
    [{ ...presentation, expectedRevision: 2 }, 409, "Draft revision conflict.", ["my_pack_draft"]],
    [{ ...presentation, expectedRevision: 0 }, 400, "Invalid draft revision.", []],
    [{ ...presentation, expectedRevision: -1 }, 400, "Invalid draft revision.", []],
  ] as const) {
    const { request, operations, lookups } = setup();
    const response = await request("POST", inputs, "/groups/me/pack/publications");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(lookups).toEqual([]);
    expect(operations.map((operation) => operation.name)).toEqual([...calls]);
  }
  const missing = setup({ responses: { my_pack_draft: { groupId, role: "owner", draft: null } } });
  const absent = await missing.request("POST", presentation, "/groups/me/pack/publications");
  expect(absent.status).toBe(404);
  expect(await absent.json()).toEqual({ error: "Draft not found." });
  expect(missing.lookups).toEqual([]);

  const empty = setup({ responses: { my_pack_draft: { ...draftContext,
    draft: { ...selection, versionIds: [], revision: 2, updatedAt: draft.updatedAt } } } });
  const blank = await empty.request("POST", { ...presentation, expectedRevision: 2 }, "/groups/me/pack/publications");
  expect(blank.status).toBe(400);
  expect(await blank.json()).toEqual({ error: "Cannot publish an empty draft." });
  expect(empty.lookups).toEqual([]);
});

test("publication input is limited to the documented body, query and identifiers", async () => {
  const { request, operations } = setup();
  for (const body of [[], null, { name: "Friends pack", version: "1.0.0", loaderVersion: "0.16.0" },
    { ...presentation, ownerId: "user_other" },
    { ...presentation, name: undefined }, { ...presentation, name: "  " },
    { ...presentation, name: "x".repeat(101) }, { ...presentation, loaderVersion: "0.16.0 beta" },
    { ...presentation, version: "x".repeat(51) }, { ...presentation, name: "Bad\uFEFFName" }]) {
    expect((await request("POST", body, "/groups/me/pack/publications")).status).toBe(400);
  }
  expect(operations).toEqual([]);
  for (const path of ["/groups/me/pack/publications?limit=0", "/groups/me/pack/publications?limit=51",
    "/groups/me/pack/publications?limit=abc", "/groups/me/pack/publications?cursor=1",
    "/groups/me/pack/publications?before=0", "/groups/me/pack/publications?before=abc",
    "/groups/me/pack/publications?before=9999999999", "/groups/me/pack/publications/not-a-uuid",
    "/groups/me/pack/publications/not-a-uuid/export"]) {
    expect((await request("GET", undefined, path)).status).toBe(400);
  }
  expect(operations).toEqual([]);
});

test("C1 control characters in publication metadata return 400 and never reach the RPC", async () => {
  for (const input of [
    { ...presentation, name: "A\u0081B" },
    { ...presentation, name: "Friends\u0085" },
    { ...presentation, version: "1.0.\u0081" },
  ]) {
    const { request, operations, lookups } = setup();
    const response = await request("POST", input, "/groups/me/pack/publications");
    expect(response.status).toBe(400);
    expect(typeof (await response.json()).error).toBe("string");
    expect(operations).toEqual([]);
    expect(lookups).toEqual([]);
  }
});

test("published metadata stays inside the existing pack export contract", async () => {
  const astral = "\u{1F680}".repeat(100);
  const rejected = setup();
  const response = await rejected.request("POST", { ...presentation, name: astral }, "/groups/me/pack/publications");
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid publication name." });
  expect(rejected.operations).toEqual([]);
  expect(rejected.lookups).toEqual([]);
  const accepted = setup();
  const published = await accepted.request("POST", { ...presentation, name: "x".repeat(100), version: "y".repeat(50) },
    "/groups/me/pack/publications");
  expect(published.status).toBe(201);
});

test("published exports accept exactly the metadata that publish accepted", async () => {
  const frozen = { ...publication, name: "x".repeat(100), version: "y".repeat(50) };
  const { request } = setup({ responses: { my_pack_publication: { ...publicationDetail, publication: frozen } } });
  const exported = await request("GET", undefined, `/groups/me/pack/publications/${publicationId}/export`);
  expect(exported.status).toBe(200);
  expect(exported.headers.get("content-type")).toBe("application/x-modrinth-modpack+zip");
  expect((await exported.arrayBuffer()).byteLength).toBeGreaterThan(100);
});

test("publication reads accept schema-valid values that only a direct RPC could store", async () => {
  const name = "\u{1F680}".repeat(100);
  const astral = { ...publication, name };
  const list = setup({ responses: { my_pack_publications: { ...publicationList, publications: [astral] } } });
  const listed = await list.request("GET", undefined, "/groups/me/pack/publications");
  expect(listed.status).toBe(200);
  expect((await listed.json()).publications[0].name).toBe(name);
  const detail = setup({ responses: { my_pack_publication: { ...publicationDetail, publication: astral } } });
  const read = await detail.request("GET", undefined, `/groups/me/pack/publications/${publicationId}`);
  expect(read.status).toBe(200);
  expect((await read.json()).publication.name).toBe(name);
  // The shared export contract still measures UTF-16 units, so this stored value cannot be exported.
  const exported = await detail.request("GET", undefined, `/groups/me/pack/publications/${publicationId}/export`);
  expect(exported.status).toBe(400);
  expect(await exported.json()).toEqual({ error: "Invalid pack name." });
});

test("published exports reject any request body", async () => {
  const { api } = setup();
  const response = await api.request(`/groups/me/pack/publications/${publicationId}/export`, {
    method: "GET", headers: { Authorization: `bearer ${bearer}`, "Content-Type": "application/json" }, body: "{}" });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Unexpected export body." });
});

test("paged reads pass only a bounded limit and keyset cursor", async () => {
  const { request, operations } = setup();
  const response = await request("GET", undefined, "/groups/me/pack/publications?limit=2&before=5");
  expect(response.status).toBe(200);
  expect(operations).toEqual([{ name: "my_pack_publications", args: { p_limit: 2, p_before_sequence: 5 } }]);
  const defaults = setup();
  expect((await defaults.request("GET", undefined, "/groups/me/pack/publications")).status).toBe(200);
  expect(defaults.operations).toEqual([{ name: "my_pack_publications", args: { p_limit: 20, p_before_sequence: null } }]);
});

test("publication responses reject unexpected upstream data and drop unexposed fields", async () => {
  const { request } = setup({ responses: { my_pack_publications: { ...publicationList, secret: "not public" } } });
  const list = await request("GET", undefined, "/groups/me/pack/publications");
  expect(await list.json()).toEqual(publicationList);
  for (const invalid of [
    { ...publicationList, role: "admin" },
    { ...publicationList, publications: Array.from({ length: 51 }, () => publication) },
    { ...publicationList, publications: [{ ...publication, active: true }, { ...publication, id: otherPublicationId, active: true }] },
    { ...publicationList, activePublicationId: "not-a-uuid" },
    { ...publicationList, nextBeforeSequence: 0 },
  ]) {
    expect((await setup({ responses: { my_pack_publications: invalid } })
      .request("GET", undefined, "/groups/me/pack/publications")).status).toBe(502);
  }
  for (const invalid of [
    { ...publicationDetail, publication: { ...publication, sequence: 0 } },
    { ...publicationDetail, publication: { ...publication, active: "no" } },
    { ...publicationDetail, publication: { ...publication, versionIds: ["main-v", "main-v"] } },
    { ...publicationDetail, role: "admin" },
  ]) {
    expect((await setup({ responses: { my_pack_publication: invalid } })
      .request("GET", undefined, `/groups/me/pack/publications/${publicationId}`)).status).toBe(502);
  }
  expect((await setup({ responses: { activate_pack_publication: { groupId, activePublicationId: "x" } } })
    .request("PUT", { publicationId }, "/groups/me/pack/active-version")).status).toBe(502);
});

test("members read the active version and any published version of their group", async () => {
  const active = setup({ responses: { my_pack_publications: { ...publicationList, activePublicationId: publicationId } } });
  const list = await active.request("GET", undefined, "/groups/me/pack/publications");
  expect(list.status).toBe(200);
  expect(await list.json()).toEqual({ ...publicationList, activePublicationId: publicationId });

  const detail = setup();
  const response = await detail.request("GET", undefined, `/groups/me/pack/publications/${publicationId}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(publicationDetail);
  expect(detail.operations).toEqual([{ name: "my_pack_publication", args: { p_publication_id: publicationId } }]);
});

test("published exports use frozen metadata and accept no caller input", async () => {
  const { request, operations, lookups } = setup();
  const response = await request("GET", undefined, `/groups/me/pack/publications/${publicationId}/export`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/x-modrinth-modpack+zip");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
  expect(operations).toEqual([{ name: "my_pack_publication", args: { p_publication_id: publicationId } }]);
  expect(lookups.length).toBeGreaterThan(0);

  const override = await request("GET", undefined, `/groups/me/pack/publications/${publicationId}/export?name=Other`);
  expect(override.status).toBe(400);
  expect(await override.json()).toEqual({ error: "Unexpected export parameters." });

  const empty = setup({ responses: { my_pack_publication: { ...publicationDetail,
    publication: { ...publication, versionIds: [] } } } });
  const blank = await empty.request("GET", undefined, `/groups/me/pack/publications/${publicationId}/export`);
  expect(blank.status).toBe(400);
  expect(await blank.json()).toEqual({ error: "Select at least one mod." });
});

test("publication RPC errors map to documented statuses without leaking internals", async () => {
  for (const [message, status] of [["Publication not found.", 404], ["Group required.", 404],
    ["Publication limit reached.", 409], ["Only the group owner may manage published versions.", 403]] as const) {
    const { request } = setup({ failures: { my_pack_publication: { status: 400, body: { code: "P0001", message } } } });
    const response = await request("GET", undefined, `/groups/me/pack/publications/${publicationId}`);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
  }
  const { request } = setup({ failures: { publish_pack_draft: { status: 400, body: { code: "XX000", message: "internal detail" } } } });
  const response = await request("POST", presentation, "/groups/me/pack/publications");
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Publication service unavailable." });
});

test("a caller outside the group receives no publication data and no export performs an upstream call", async () => {
  // The RPCs resolve membership from the signed subject, so a caller without a group,
  // a caller in another group and a member whose membership ended all reach Hono as the
  // same documented refusal. Only the database can distinguish the causes; the HTTP
  // boundary must not, and must not expose group or publication data either way.
  for (const path of ["/groups/me/pack/publications", `/groups/me/pack/publications/${publicationId}`,
    "/groups/me/pack/publications?limit=2&before=5"]) {
    const { request, operations, lookups } = setup({
      failures: { my_pack_publications: { status: 400, body: { code: "P0001", message: "Group required." } },
        my_pack_publication: { status: 400, body: { code: "P0001", message: "Group required." } } },
    });
    const response = await request("GET", undefined, path);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Group required." });
    expect(operations.length).toBe(1);
    expect(lookups).toEqual([]);
  }
  const absent = setup({ failures: { my_pack_publication: { status: 400,
    body: { code: "P0001", message: "Publication not found." } } } });
  for (const path of [`/groups/me/pack/publications/${publicationId}`,
    `/groups/me/pack/publications/${otherPublicationId}/export`]) {
    const response = await absent.request("GET", undefined, path);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Publication not found." });
  }
  expect(absent.lookups).toEqual([]);
  expect(absent.operations.map((operation) => operation.name)).toEqual(["my_pack_publication", "my_pack_publication"]);
});

test("a denied export returns no archive and never reaches Modrinth", async () => {
  const { request, operations, lookups } = setup({ failures: { my_pack_publication: { status: 400,
    body: { code: "P0001", message: "Group required." } } } });
  const response = await request("GET", undefined, `/groups/me/pack/publications/${publicationId}/export`);
  expect(response.status).toBe(404);
  expect(response.headers.get("content-disposition")).toBeNull();
  expect(response.headers.get("content-type")).not.toContain("zip");
  expect(await response.json()).toEqual({ error: "Group required." });
  expect(operations).toEqual([{ name: "my_pack_publication", args: { p_publication_id: publicationId } }]);
  expect(lookups).toEqual([]);
});

test("an unavailable pinned version fails the export predictably and the publication stays readable", async () => {
  const cases = [
    ["a version Modrinth no longer serves", { "/version/dep-v": { status: 404 } },
      409, "A selected mod or dependency is unavailable."],
    ["a project Modrinth no longer serves", { "/project/main": { status: 404 } },
      409, "A selected mod or dependency is unavailable."],
    ["a version that dropped the frozen loader", { "/version/main-v": { status: 200,
      body: { ...metadata("main-v", "main"), game_versions: ["1.20.1"] } } },
    409, "A mod version does not support the selected Minecraft version and loader."],
    ["malformed version metadata", { "/version/main-v": { status: 200, body: { id: "main-v" } } },
      502, "Modrinth returned invalid version metadata."],
    ["an upstream server error", { "/version/dep-v": { status: 503, body: {} } },
      502, "Modrinth could not complete the request. Please try again later."],
    ["an upstream timeout", { "/version/main-v": { fault: new DOMException("late", "TimeoutError") } },
      504, "Modrinth timed out. Please try again."],
    ["a transport fault", { "/version/main-v": { fault: new Error("SECRET reset") } },
      502, "Could not contact Modrinth."],
  ] as const;
  for (const [label, modules, status, message] of cases) {
    const { request, operations, lookups } = setup({ modules });
    const response = await request("GET", undefined, `/groups/me/pack/publications/${publicationId}/export`);
    expect([label, response.status, await response.json()]).toEqual([label, status, { error: message }]);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("content-type")).not.toContain("zip");
    expect(lookups.length).toBeGreaterThan(0);
    // The frozen publication is still readable: only its archive is unavailable.
    expect(operations.map((operation) => operation.name)).toEqual(["my_pack_publication"]);
    const detail = await request("GET", undefined, `/groups/me/pack/publications/${publicationId}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).publication.id).toBe(publicationId);
  }
});

test("publication transport faults and missing configuration map to documented statuses", async () => {
  for (const [fault, status, message] of [
    [new DOMException("late", "TimeoutError"), 504, "Publication service timed out."],
    [new DOMException("cancelled", "AbortError"), 504, "Publication service timed out."],
    [new Error("SECRET network"), 502, "Publication service unavailable."],
  ] as const) {
    const { request, operations, lookups } = setup({ faults: { data: fault } });
    const response = await request("GET", undefined, "/groups/me/pack/publications");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(operations).toEqual([]);
    expect(lookups).toEqual([]);
  }
  const unconfigured = createApp(async () => { throw new Error("Publication requests must not call Modrinth"); },
    clerk, async () => Response.json(publicationList), { url: database.url });
  for (const [method, path, body] of [["GET", "/groups/me/pack/publications", undefined],
    ["POST", "/groups/me/pack/publications", presentation],
    ["PUT", "/groups/me/pack/active-version", { publicationId }]] as const) {
    const response = await unconfigured.request(path, { method,
      headers: { Authorization: `bearer ${bearer}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Publication service is not configured." });
  }
});
