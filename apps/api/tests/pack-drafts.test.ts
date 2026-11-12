import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const bearer = clerkToken();
const database = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const groupId = "11111111-1111-4111-8111-111111111111";
const selection = { gameVersion: "1.21.1", loader: "fabric", versionIds: ["main-v", "dep-v"] };
const draft = { ...selection, revision: 1, updatedAt: "2026-11-12T00:00:00Z" };
const context = { groupId, role: "owner", draft: null };
const metadata = (id: string, project: string, dependencies: unknown[] = []) => ({
  id, project_id: project, name: id, version_number: "1.0", date_published: "2026-01-01",
  game_versions: ["1.21.1", "1.21.2"], loaders: ["fabric", "quilt"], dependencies,
  files: [{ filename: project + ".jar", primary: true, hashes: { sha1: "a".repeat(40), sha512: "b".repeat(128) },
    url: `https://cdn.modrinth.com/data/${project}/versions/${id}/mod.jar`, size: 100 }],
});
const catalog: Record<string, unknown> = {
  "/version/main-v": metadata("main-v", "main", [{ dependency_type: "required", project_id: "dep", version_id: "dep-v" }]),
  "/version/dep-v": metadata("dep-v", "dep"),
  "/project/main": { id: "main", project_type: "mod", client_side: "required", server_side: "optional" },
  "/project/dep": { id: "dep", project_type: "mod", client_side: "required", server_side: "optional" },
};
function setup(result: unknown = context, saveStatus = 200, overrides: Record<string, unknown> = {}, faults: { data?: Error } = {}) {
  const operations: { name: string; args: unknown }[] = [];
  const lookups: string[] = [];
  const api = createApp(async (input) => {
    const path = new URL(String(input)).pathname.replace("/v2", "");
    lookups.push(path);
    const value = { ...catalog, ...overrides }[path];
    return value ? Response.json(value) : new Response(null, { status: 404 });
  }, clerk, async (url, init) => {
    if (faults.data) throw faults.data;
    const name = new URL(url).pathname.split("/").at(-1)!;
    operations.push({ name, args: JSON.parse(String(init.body)) });
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${bearer}`);
    expect(new Headers(init.headers).get("apikey")).toBe(database.publishableKey);
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return name === "save_pack_draft"
      ? Response.json(saveStatus === 200 ? { ...context, draft } : { code: "P0001", message: "Draft revision conflict." }, { status: saveStatus })
      : Response.json(result);
  }, database);
  const request = (method: string, body?: unknown, path = "/groups/me/pack", token = bearer) => api.request(path, {
    method, headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { api, request, operations, lookups };
}

test("draft routes require verified Clerk database identity before any upstream call", async () => {
  const { request, operations, lookups } = setup();
  for (const [method, path] of [["GET", "/groups/me/pack"], ["PUT", "/groups/me/pack"], ["POST", "/groups/me/pack/export"]]) {
    for (const token of ["bad", clerkToken({ role: undefined })]) {
      const response = await request(method!, undefined, path, token);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Authentication required." });
    }
  }
  expect(operations).toEqual([]);
  expect(lookups).toEqual([]);
});

test("first save validates only approved exact IDs then sends one atomic revision-scoped RPC", async () => {
  const { request, operations, lookups } = setup();
  const response = await request("PUT", { ...selection, expectedRevision: 0 });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ...context, draft });
  expect(operations).toEqual([
    { name: "my_pack_draft", args: {} },
    { name: "save_pack_draft", args: { p_group_id: groupId, p_game_version: "1.21.1", p_loader: "fabric", p_version_ids: selection.versionIds, p_expected_revision: 0 } },
  ]);
  expect(lookups.sort()).toEqual(Object.keys(catalog).sort());
});

test("members read the current group draft but cannot edit it", async () => {
  const result = { groupId, role: "member", draft, secret: "not public" };
  const { request, operations, lookups } = setup(result);
  const read = await request("GET");
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({ groupId, role: "member", draft });
  const write = await request("PUT", { ...selection, expectedRevision: 1 });
  expect(write.status).toBe(403);
  expect(await write.json()).toEqual({ error: "Only the group owner may edit the draft." });
  expect(operations.every((call) => call.name === "my_pack_draft")).toBe(true);
  expect(lookups).toEqual([]);
});

test("declined or missing dependencies do not trigger resolution or any draft write", async () => {
  const { request, operations, lookups } = setup({ ...context, draft });
  const response = await request("PUT", { ...selection, versionIds: ["main-v"], expectedRevision: 1 });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "A required dependency is missing or conflicts with the approved selection. Resolve and approve dependencies first." });
  expect(operations).toEqual([{ name: "my_pack_draft", args: {} }]);
  expect(lookups).not.toContain("/project/dep/version");
  expect(lookups).not.toContain("/version/dep-v");
});

test("compatible Minecraft and loader changes retain the exact approved selection", async () => {
  for (const change of [{ gameVersion: "1.21.2" }, { loader: "quilt" }]) {
    const { request, operations } = setup({ ...context, draft });
    const response = await request("PUT", { ...selection, ...change, expectedRevision: 1 });
    expect(response.status).toBe(200);
    expect(operations.at(-1)?.args).toMatchObject({ p_game_version: change.gameVersion ?? selection.gameVersion,
      p_loader: change.loader ?? selection.loader, p_version_ids: selection.versionIds, p_expected_revision: 1 });
  }
});

test("incompatible Minecraft or loader changes preserve the draft and never save", async () => {
  for (const change of [{ gameVersion: "1.20.1" }, { loader: "forge" }]) {
    const { request, operations } = setup({ ...context, draft });
    const response = await request("PUT", { ...selection, ...change, expectedRevision: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "A mod version does not support the selected Minecraft version and loader." });
    expect(operations).toEqual([{ name: "my_pack_draft", args: {} }]);
  }
});

test("compatibility changes revalidate dependencies, not only the requested mod", async () => {
  for (const change of [{ gameVersion: "1.21.2" }, { loader: "quilt" }]) {
    const { request, operations } = setup({ ...context, draft }, 200, {
      "/version/dep-v": { ...metadata("dep-v", "dep"), game_versions: ["1.21.1"], loaders: ["fabric"] },
    });
    const response = await request("PUT", { ...selection, ...change, expectedRevision: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "A mod version does not support the selected Minecraft version and loader." });
    expect(operations).toEqual([{ name: "my_pack_draft", args: {} }]);
  }
});

test("wrong pinned or incompatible dependencies are rejected without saving", async () => {
  for (const [type, version, message] of [
    ["required", "dep-other", "A required dependency is missing or conflicts with the approved selection. Resolve and approve dependencies first."],
    ["incompatible", "dep-v", "The selected mods declare an incompatible dependency."],
  ]) {
    const { request, operations } = setup({ ...context, draft }, 200, {
      "/version/main-v": metadata("main-v", "main", [{ dependency_type: type, project_id: "dep", version_id: version }]),
    });
    const response = await request("PUT", { ...selection, expectedRevision: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: message });
    expect(operations).toEqual([{ name: "my_pack_draft", args: {} }]);
  }
});

test("stale writes return a conflict without automatic retries", async () => {
  const { request, operations } = setup({ ...context, draft }, 400);
  const response = await request("PUT", { ...selection, expectedRevision: 1 });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Draft revision conflict." });
  expect(operations.filter((op) => op.name === "save_pack_draft")).toHaveLength(1);
});

test("draft export uses stored versions and cannot accept a caller selection override", async () => {
  const { request, operations } = setup({ ...context, role: "member", draft });
  const presentation = { name: "Friends", version: "preview", loaderVersion: "0.16.0" };
  const response = await request("POST", presentation, "/groups/me/pack/export");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/x-modrinth-modpack+zip");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
  const override = await request("POST", { ...presentation, versionIds: ["other"] }, "/groups/me/pack/export");
  expect(override.status).toBe(400);
  expect(operations.every((op) => op.name === "my_pack_draft")).toBe(true);
});

test("draft input, missing draft and invalid upstream data fail closed", async () => {
  const { request, operations } = setup();
  for (const body of [[], null, { ...selection }, { ...selection, expectedRevision: -1 },
    { ...selection, expectedRevision: 0, ownerId: "user_other" }, { ...selection, expectedRevision: 0, loader: ["fabric"] }]) {
    expect((await request("PUT", body)).status).toBe(400);
  }
  expect(operations).toEqual([]);
  expect((await request("POST", { name: "Friends", version: "preview", loaderVersion: "0.16.0" }, "/groups/me/pack/export")).status).toBe(404);
  for (const invalid of [{}, { ...context, role: "admin" }, { ...context, draft: { ...draft, revision: -1 } }]) {
    expect((await setup(invalid).request("GET")).status).toBe(502);
  }
});

test("draft transport faults map to documented 502/504 and a missing database configuration to 503", async () => {
  for (const [fault, status, message] of [
    [new DOMException("late", "TimeoutError"), 504, "Draft service timed out."],
    [new DOMException("cancelled", "AbortError"), 504, "Draft service timed out."],
    [new Error("SECRET network"), 502, "Draft service unavailable."],
  ] as const) {
    const { request, operations, lookups } = setup(context, 200, {}, { data: fault });
    const response = await request("GET");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(operations).toEqual([]);
    expect(lookups).toEqual([]);
  }
  const unconfigured = createApp(async () => { throw new Error("Draft requests must not call Modrinth"); },
    clerk, async () => Response.json(context), { url: database.url });
  for (const [method, path, body] of [["GET", "/groups/me/pack", undefined],
    ["PUT", "/groups/me/pack", { ...selection, expectedRevision: 0 }],
    ["POST", "/groups/me/pack/export", { name: "F", version: "1", loaderVersion: "0.16.0" }]] as const) {
    const response = await unconfigured.request(path, { method,
      headers: { Authorization: `bearer ${bearer}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Draft service is not configured." });
  }
});

test("exporting a stored empty draft returns the documented 400 instead of an archive", async () => {
  const { request, operations } = setup({ ...context, role: "member", draft: { ...selection, versionIds: [], revision: 2, updatedAt: draft.updatedAt } });
  const response = await request("POST", { name: "Friends", version: "preview", loaderVersion: "0.16.0" }, "/groups/me/pack/export");
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Select at least one mod." });
  expect(operations.map((op) => op.name)).toEqual(["my_pack_draft"]);
});

test("stale revisions are rejected before any catalog validation or save attempt", async () => {
  for (const [stored, expected] of [[3, 1], [1, 0], [null, 2]] as const) {
    const result = stored === null ? { ...context, draft: null } : { ...context, draft: { ...draft, revision: stored } };
    const { request, operations, lookups } = setup(result);
    const response = await request("PUT", { ...selection, expectedRevision: expected });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Draft revision conflict." });
    expect(lookups).toEqual([]);
    expect(operations.map((op) => op.name)).toEqual(["my_pack_draft"]);
  }
});
