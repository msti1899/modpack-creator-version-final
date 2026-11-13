import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const hash = { sha1: "a".repeat(40), sha512: "b".repeat(128) };
const project = (id: string, extra = {}) => ({ id, title: id, project_type: "mod", client_side: "required", server_side: "optional", ...extra });
const version = (id: string, projectId: string, dependencies: unknown[] = [], extra = {}) => ({
  id, project_id: projectId, name: id, version_number: "1.0", date_published: "2026-01-01", game_versions: ["1.21.1"], loaders: ["fabric"], dependencies,
  files: [{ filename: `${projectId}.jar`, primary: true, hashes: hash, url: `https://cdn.modrinth.com/data/${projectId}/versions/${id}/mod.jar`, size: 100 }], ...extra,
});
const required = (project_id: string, version_id: string | null = null) => ({ dependency_type: "required", project_id, version_id });
const fixtures: Record<string, unknown> = {
  "/project/main": project("main"), "/project/dep": project("dep"),
  "/project/main/version": [version("main-v", "main", [required("dep")])],
  "/project/dep/version": [version("dep-v", "dep")],
  "/version/main-v": version("main-v", "main", [required("dep")]),
  "/version/dep-v": version("dep-v", "dep"),
};
function app(overrides: Record<string, unknown> = {}) {
  const calls: URL[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); calls.push(url);
    expect(url.origin).toBe("https://api.modrinth.com");
    expect(new Headers(init?.headers).get("User-Agent")).toContain("modpack-creator");
    const value = { ...fixtures, ...overrides }[url.pathname.replace("/v2", "")];
    return value === undefined ? new Response("missing", { status: 404 }) : Response.json(value);
  };
  return { api: createApp(fetcher), calls };
}
const config = { gameVersion: "1.21.1", loader: "fabric", versionIds: [] as string[] };
const exportBody = { ...config, name: "Friends pack", version: "1.0.0", loaderVersion: "0.16.0", versionIds: ["main-v", "dep-v"] };
const post = (api: ReturnType<typeof createApp>, path: string, body: unknown) => api.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("search filters mods by exact Minecraft version and loader", async () => {
  const { api, calls } = app({ "/search": { hits: [{ project_id: "main", title: "Main", description: "A mod", slug: "main", project_type: "mod" }], total_hits: 1, offset: 0 } });
  const response = await api.request("/mods?query=test&gameVersion=1.21.1&loader=fabric&offset=0");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ hits: [{ projectId: "main", slug: "main", title: "Main", description: "A mod", iconUrl: null, downloads: null, follows: null, author: null, categories: [], clientSide: null, serverSide: null, latestVersion: null }], total: 1, offset: 0 });
  expect(JSON.parse(calls[0]!.searchParams.get("facets")!)).toEqual([["project_type:mod"], ["categories:fabric"], ["versions:1.21.1"]]);
});

test("resolve recursively returns candidate closure without persistence", async () => {
  const { api } = app();
  const response = await post(api, "/packs/resolve", { ...config, projectId: "main" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ versions: [{ id: "main-v", projectId: "main", projectTitle: "main", name: "main-v", versionNumber: "1.0" }, { id: "dep-v", projectId: "dep", projectTitle: "dep", name: "dep-v", versionNumber: "1.0" }], addedDependencies: ["dep-v"] });
});

test("all four loaders produce correct manifest dependency keys in a valid ZIP", async () => {
  const scratch = Bun.spawnSync(["mktemp", "-d"]).stdout.toString().trim();
  console.log(`ZIP scratch: ${scratch}`);
  for (const [loader, key] of Object.entries({ fabric: "fabric-loader", forge: "forge", neoforge: "neoforge", quilt: "quilt-loader" })) {
    const { api } = app({ "/version/dep-v": version("dep-v", "dep", [], { loaders: [loader] }) });
    const response = await post(api, "/packs/export", { ...exportBody, loader, versionIds: ["dep-v"] });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-modrinth-modpack+zip");
    expect(response.headers.get("content-disposition")).toContain(".mrpack");
    const path = `${scratch}/${loader}.mrpack`;
    await Bun.write(path, await response.arrayBuffer());
    const checked = Bun.spawnSync(["python3", "-c", `import json,zipfile,sys\nz=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None\nm=json.loads(z.read('modrinth.index.json')); assert m['formatVersion']==1 and m['game']=='minecraft'\nassert m['dependencies']=={'minecraft':'1.21.1',sys.argv[2]:'0.16.0'}\nassert m['files'][0]['env']=={'client':'required','server':'optional'}\nassert m['files'][0]['hashes']['sha512']=='b'*128`, path, key]);
    expect(checked.exitCode).toBe(0);
  }
});

test("export rejects unapproved missing dependencies rather than adding them", async () => {
  const { api } = app();
  expect((await post(api, "/packs/export", { ...exportBody, versionIds: ["main-v"] })).status).toBe(409);
});

test("pins, cycles, optional and embedded dependencies are deterministic", async () => {
  const deps = [required("main", "main-v"), { dependency_type: "optional", project_id: "absent" }, { dependency_type: "embedded", project_id: "absent" }];
  const { api } = app({ "/version/dep-v": version("dep-v", "dep", deps) });
  const response = await post(api, "/packs/resolve", { ...config, projectId: "main", versionIds: ["dep-v"] });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.versions.map((v: { id: string }) => v.id)).toEqual(["dep-v", "main-v"]);
  expect(body.addedDependencies).toEqual([]);
});

test("reject conflicting exact pins and incompatible declarations", async () => {
  const { api } = app({ "/version/dep-v": version("dep-v", "dep", [required("main", "other-v")]), "/version/other-v": version("other-v", "main") });
  expect((await post(api, "/packs/export", exportBody)).status).toBe(409);
  const incompatible = app({ "/version/dep-v": version("dep-v", "dep", [{ dependency_type: "incompatible", project_id: "main", version_id: null }]) });
  expect((await post(incompatible.api, "/packs/export", exportBody)).status).toBe(409);
});

test("reject non-mod, wrong game or loader, and unresolved requirements", async () => {
  for (const override of [
    { "/project/dep": project("dep", { project_type: "resourcepack" }) },
    { "/version/dep-v": version("dep-v", "dep", [], { game_versions: ["old"] }) },
    { "/version/dep-v": version("dep-v", "dep", [], { loaders: ["forge"] }) },
    { "/project/main/version": [version("main-v", "main", [required("missing")])] },
  ]) {
    const { api } = app(override);
    const response = override["/project/main/version"] ? await post(api, "/packs/resolve", { ...config, projectId: "main" }) : await post(api, "/packs/export", exportBody);
    expect(response.status).toBe(409);
  }
});

test("export rejects unsafe file metadata and duplicate filenames", async () => {
  const base = version("dep-v", "dep");
  for (const file of [
    { ...base.files[0], filename: "../bad.jar" }, { ...base.files[0], filename: "CON.jar" }, { ...base.files[0], filename: "bad?.jar" }, { ...base.files[0], url: "https://evil.example/mod.jar" },
    { ...base.files[0], url: "https://user@cdn.modrinth.com/mod.jar" }, { ...base.files[0], hashes: { ...hash, sha1: "x" } },
    { ...base.files[0], size: -1 },
  ]) {
    const { api } = app({ "/version/dep-v": { ...base, files: [file] } });
    expect((await post(api, "/packs/export", exportBody)).status).toBe(409);
  }
  const { api } = app({ "/version/dep-v": { ...base, files: [{ ...base.files[0], filename: "MAIN.jar" }] } });
  expect((await post(api, "/packs/export", exportBody)).status).toBe(409);
});

test("invalid input, JSON and oversized selections fail before contacting upstream", async () => {
  const { api, calls } = app();
  for (const body of [{ ...exportBody, versionIds: Array(51).fill("dep-v") }, { ...exportBody, loaderVersion: "" }, { ...exportBody, loader: "invalid" }, { ...exportBody, versionIds: ["../invalid"] }]) {
    expect((await post(api, "/packs/export", body)).status).toBe(400);
  }
  expect((await api.request("/packs/resolve", { method: "POST", body: "{" })).status).toBe(400);
  expect((await api.request("/mods?gameVersion=1.21.1&loader=fabric&offset=-1")).status).toBe(400);
  expect(calls).toHaveLength(0);
});

test("upstream errors have stable JSON errors", async () => {
  for (const [fetcher, status] of [
    [async () => new Response("rate limited", { status: 429 }), 502],
    [async () => { throw new DOMException("timeout", "TimeoutError"); }, 504],
    [async () => Response.json({ malformed: true }), 502],
  ] as const) {
    const response = await createApp(fetcher).request("/mods?gameVersion=1.21.1&loader=fabric");
    expect(response.status).toBe(status);
    expect(typeof (await response.json()).error).toBe("string");
  }
});

test("recursive dependencies deduplicate diamond paths and preserve existing versions", async () => {
  const overrides = {
    "/project/leaf": project("leaf"),
    "/version/dep-v": version("dep-v", "dep", [required("leaf")]),
    "/project/leaf/version": [version("leaf-v", "leaf")],
    "/project/main/version": [version("main-v", "main", [required("dep"), required("leaf")])],
  };
  const { api, calls } = app(overrides);
  const response = await post(api, "/packs/resolve", { ...config, projectId: "main", versionIds: ["dep-v"] });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.versions.map((item: { id: string }) => item.id)).toEqual(["dep-v", "main-v", "leaf-v"]);
  expect(result.addedDependencies).toEqual(["leaf-v"]);
  expect(new Set(calls.map(String)).size).toBe(calls.length);
});

test("a dependency closure beyond 50 mods is rejected with bounded upstream work", async () => {
  const dependencies = Array.from({ length: 51 }, (_, index) => required(`dep${index}`));
  const overrides: Record<string, unknown> = { "/project/main/version": [version("main-v", "main", dependencies)] };
  for (let index = 0; index < 51; index++) {
    overrides[`/project/dep${index}`] = project(`dep${index}`);
    overrides[`/project/dep${index}/version`] = [version(`v${index}`, `dep${index}`)];
  }
  const { api, calls } = app(overrides);
  const response = await post(api, "/packs/resolve", { ...config, projectId: "main" });
  expect(response.status).toBe(409);
  expect(calls.length).toBeLessThanOrEqual(100);
});

test("body limit rejects oversized payloads before upstream requests", async () => {
  const { api, calls } = app();
  const response = await post(api, "/packs/resolve", { ...config, projectId: "main", unused: "x".repeat(17000) });
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});
