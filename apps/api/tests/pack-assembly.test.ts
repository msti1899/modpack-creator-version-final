import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const bearer = clerkToken();
const database = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const groupId = "22222222-2222-4222-8222-222222222222";
const hashes = { sha1: "a".repeat(40), sha512: "b".repeat(128) };
const project = (id: string, title?: string) => ({
  id, slug: id, project_type: "mod", client_side: "required", server_side: "optional",
  ...(title === undefined ? {} : { title }),
});
const version = (id: string, projectId: string, dependencies: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  id, project_id: projectId, name: `${id} display`, version_number: "1.0", date_published: "2026-01-01",
  game_versions: ["1.21.1", "1.21.2"], loaders: ["fabric", "quilt"], dependencies,
  files: [{ filename: `${projectId}.jar`, primary: true, hashes,
    url: `https://cdn.modrinth.com/data/${projectId}/versions/${id}/mod.jar`, size: 100 }],
  ...extra,
});
const required = (projectId: string, versionId: string | null = null) => ({ dependency_type: "required", project_id: projectId, version_id: versionId });
const catalog: Record<string, unknown> = {
  "/project/main": project("main", "Sodium"),
  "/project/dep": project("dep", "Fabric API"),
  "/project/main/version": [version("main-v", "main", [required("dep", "dep-v")])],
  "/project/dep/version": [version("dep-v", "dep")],
  "/version/main-v": version("main-v", "main", [required("dep", "dep-v")]),
  "/version/dep-v": version("dep-v", "dep"),
};
const settings = { gameVersion: "1.21.1", loader: "fabric" };
type StoredDraft = { gameVersion: string; loader: string; versionIds: string[]; revision: number; updatedAt: string };

/** One journey harness: the public resolver reads the fake catalog, the group
 * routes read and write one in-memory draft row through compare-and-swap. */
function setup(options: { draft?: StoredDraft; overrides?: Record<string, unknown> } = {}) {
  let stored: StoredDraft | null = options.draft ?? null;
  const operations: { name: string; args: Record<string, string | string[]> }[] = [];
  const lookups: string[] = [];
  const fixtures = { ...catalog, ...options.overrides };
  const api = createApp(async (input) => {
    const path = new URL(String(input)).pathname.replace("/v2", "");
    lookups.push(path);
    const value = fixtures[path];
    if (value instanceof Response) return value;
    return value === undefined ? new Response(null, { status: 404 }) : Response.json(value);
  }, clerk, async (url, init) => {
    const name = new URL(String(url)).pathname.split("/").at(-1)!;
    const args = JSON.parse(String(init.body));
    operations.push({ name, args });
    if (name === "save_pack_draft") {
      const current = stored === null ? 0 : stored.revision;
      if (args.p_expected_revision !== current) return Response.json({ code: "P0001", message: "Draft revision conflict." }, { status: 400 });
      stored = { gameVersion: args.p_game_version, loader: args.p_loader, versionIds: args.p_version_ids,
        revision: current + 1, updatedAt: "2026-11-13T00:00:00.000Z" };
    }
    return Response.json({ groupId, role: "owner", draft: stored });
  }, database);
  const request = (path: string, method = "POST", body?: unknown) => api.request(path, {
    method, headers: { Authorization: `bearer ${bearer}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { request, operations, lookups, stored: () => stored };
}

test("a resolver proposal names every mod and dependency by project title", async () => {
  const { request } = setup();
  const response = await request("/packs/resolve", "POST", { ...settings, versionIds: [], projectId: "main" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    versions: [
      { id: "main-v", projectId: "main", projectTitle: "Sodium", name: "main-v display", versionNumber: "1.0" },
      { id: "dep-v", projectId: "dep", projectTitle: "Fabric API", name: "dep-v display", versionNumber: "1.0" },
    ],
    addedDependencies: ["dep-v"],
  });
});

test("a proposal keeps readable titles and fails closed on an unusable one", async () => {
  const padded = setup({ overrides: { "/project/dep": project("dep", "  Fabric API  ") } });
  const proposal = await (await padded.request("/packs/resolve", "POST", { ...settings, versionIds: [], projectId: "main" })).json();
  expect(proposal.versions.at(-1).projectTitle).toBe("Fabric API");
  for (const title of [undefined, "", "   ", "bad\u0000title", "t".repeat(301)]) {
    const { request } = setup({ overrides: { "/project/dep": project("dep", title) } });
    const response = await request("/packs/resolve", "POST", { ...settings, versionIds: [], projectId: "main" });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Modrinth returned an invalid project title." });
  }
});

test("propose, cancel, accept, remove and change settings keep every rejection atomic", async () => {
  const { request, operations, lookups, stored } = setup();

  // Propose: a stateless candidate closure the caller may present for approval.
  const proposal = await (await request("/packs/resolve", "POST", { ...settings, versionIds: [], projectId: "main" })).json();
  const versionIds = proposal.versions.map((entry: { id: string }) => entry.id);

  // Cancel: nothing is stored and no write is attempted.
  expect(await (await request("/groups/me/pack", "GET")).json()).toEqual({ groupId, role: "owner", draft: null });
  expect(operations.filter((operation) => operation.name === "save_pack_draft")).toHaveLength(0);

  // Accept: one atomic write stores exactly the approved closure.
  const accepted = await request("/groups/me/pack", "PUT", { ...settings, versionIds, expectedRevision: 0 });
  expect(accepted.status).toBe(200);
  expect(stored()).toMatchObject({ ...settings, versionIds: ["main-v", "dep-v"], revision: 1 });

  // Remove a mod: the remaining selection keeps its exact versions.
  expect((await request("/groups/me/pack", "PUT", { ...settings, versionIds: ["dep-v"], expectedRevision: 1 })).status).toBe(200);
  expect(stored()).toMatchObject({ ...settings, versionIds: ["dep-v"], revision: 2 });

  // Remove a dependency that a remaining mod requires: rejected, row untouched.
  const broken = await request("/groups/me/pack", "PUT", { ...settings, versionIds: ["main-v"], expectedRevision: 2 });
  expect(broken.status).toBe(409);
  expect(await broken.json()).toEqual({ error: "A required dependency is missing or conflicts with the approved selection. Resolve and approve dependencies first." });
  expect(stored()).toMatchObject({ ...settings, versionIds: ["dep-v"], revision: 2 });

  // Compatible settings change with a removal in the same write.
  const changed = await request("/groups/me/pack", "PUT", { gameVersion: "1.21.2", loader: "quilt", versionIds: ["dep-v"], expectedRevision: 2 });
  expect(changed.status).toBe(200);
  expect(stored()).toMatchObject({ gameVersion: "1.21.2", loader: "quilt", versionIds: ["dep-v"], revision: 3 });

  // Incompatible settings change: rejected, row untouched.
  const incompatible = await request("/groups/me/pack", "PUT", { gameVersion: "1.20.1", loader: "quilt", versionIds: ["dep-v"], expectedRevision: 3 });
  expect(incompatible.status).toBe(409);
  expect(await incompatible.json()).toEqual({ error: "A mod version does not support the selected Minecraft version and loader." });
  expect(stored()).toMatchObject({ gameVersion: "1.21.2", loader: "quilt", versionIds: ["dep-v"], revision: 3 });

  // Stale revision: rejected before any catalog request.
  const before = lookups.length;
  const stale = await request("/groups/me/pack", "PUT", { ...settings, versionIds: ["dep-v"], expectedRevision: 1 });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({ error: "Draft revision conflict." });
  expect(lookups.length).toBe(before);

  // Only the three accepted writes reached the save RPC.
  expect(operations.filter((operation) => operation.name === "save_pack_draft")).toHaveLength(3);
});

test("an upstream failure during validation writes nothing", async () => {
  const { request, operations, stored } = setup({ overrides: { "/project/dep": new Response("boom", { status: 500 }) } });
  const response = await request("/groups/me/pack", "PUT", { ...settings, versionIds: ["main-v", "dep-v"], expectedRevision: 0 });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Modrinth could not complete the request. Please try again later." });
  expect(stored()).toBeNull();
  expect(operations.filter((operation) => operation.name === "save_pack_draft")).toHaveLength(0);
});
