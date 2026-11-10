import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createApp } from "../src/index";

const hashes = { sha1: "a".repeat(40), sha512: "b".repeat(128) };
const project = (id: string) => ({ id, title: id, project_type: "mod", client_side: "required", server_side: "optional" });
const version = (id: string, projectId: string, dependencies: unknown[] = []) => ({
  id, project_id: projectId, name: id, version_number: "1", date_published: "2026-01-01",
  game_versions: ["1.21.1"], loaders: ["fabric"], dependencies,
  files: [{ filename: `${projectId}.jar`, primary: true, hashes,
    url: `https://cdn.modrinth.com/data/${projectId}/${id}.jar`, size: 100 }],
});
const dependencies = [{ dependency_type: "required", project_id: "dep", version_id: "dep-v" }];
const fixtures: Record<string, unknown> = {
  "/search": { hits: [{ project_id: "main", title: "Main", description: "Probe", slug: "main", project_type: "mod" }], total_hits: 1, offset: 0 },
  "/project/main": project("main"), "/project/dep": project("dep"),
  "/project/main/version": [version("main-v", "main", dependencies)], "/project/dep/version": [version("dep-v", "dep")],
  "/version/main-v": version("main-v", "main", dependencies), "/version/dep-v": version("dep-v", "dep"),
};
const digest = () => createHash("sha256").update(JSON.stringify(fixtures)).digest("hex");
const fetcher = async (input: string | URL | Request) => {
  const path = new URL(String(input)).pathname.replace("/v2", "");
  return path in fixtures ? Response.json(fixtures[path]) : new Response("not found", { status: 404 });
};
// Frozen status/header/body hashes independently captured from the previous public contract.
// Tests intentionally do not access Git history or a baseline checkout at runtime.
const golden = [
  "763946cf6f0b13d80f8e15a2da5f3bcca3a91ac6ca5a0ad1c26872ce49026dea",
  "d0eb7dd7e00951876e134db145f44c68febf68ab057093664b5d6ff756a037af",
  "b4a09415ea6de7a020890d1c135a24764cf3b5d8a2892d540dcab16d669f96b2",
  "9ec087809df9b91cb05a1fb6494aba8459b82fcbc04e1079e4ea8c5ee194f561",
  "9ec087809df9b91cb05a1fb6494aba8459b82fcbc04e1079e4ea8c5ee194f561",
  "c55a85490e1c67cd338a6f9c384a29815c2c316e77ba2d7f459cacb299c5955c",
  "26d0674633d006a18338fce960956977a87f7965fd7781b279632a8fe8207b98",
  "01be7a2e6e059579092a72cb95968ad1e9a1ed59f1e54b9080202c28d4491bf2",
  "2f33c14b8195c42b8b23c256d02b4b8950e8b4ecfbf27a54b5bc3b45460dadf1",
  "0e390e2d9902e1fee7b79cabb93e63bf82c70eec58bb6b9fde401743d306c24a",
];
const pack = { name: "Independent pack", version: "1.0", gameVersion: "1.21.1", loader: "fabric", loaderVersion: "0.16", versionIds: ["main-v", "dep-v"] };
const requests: [string, RequestInit | undefined, number][] = [
  ["/health", undefined, 200], ["/unknown", undefined, 404],
  ["/mods?gameVersion=1.21.1&loader=fabric", undefined, 200],
  ["/mods?gameVersion=1.21.1&loader=fabric&offset=10001", undefined, 400],
  ["/mods?gameVersion=1.21.1&loader=fabric&offset=", undefined, 400],
  ["/packs/resolve", { method: "POST", body: JSON.stringify({ projectId: "main", gameVersion: "1.21.1", loader: "fabric", versionIds: [] }) }, 200],
  ["/packs/resolve", { method: "POST", body: "{" }, 400],
  ["/packs/export", { method: "POST", body: JSON.stringify(pack) }, 200],
  ["/packs/export", { method: "POST", body: JSON.stringify({ ...pack, versionIds: ["main-v"] }) }, 409],
  ["/packs/export", { method: "POST", body: "[]" }, 400],
];

test("public responses and ZIP bytes preserve the prior contract without fixture writes", async () => {
  const app = createApp(fetcher, {});
  for (const [index, [path, init, status]] of requests.entries()) {
    for (const auth of [undefined, "Bearer irrelevant-explicit-credential"]) {
      const before = digest();
      const headers = new Headers({ "content-type": "application/json" });
      if (auth) headers.set("authorization", auth);
      const response = await app.request(path, { ...init, headers });
      const bytes = Buffer.from(await response.arrayBuffer());
      const observed = { status: response.status, headers: [...response.headers].sort(), bytes: bytes.toString("base64") };
      expect(createHash("sha256").update(JSON.stringify(observed)).digest("hex")).toBe(golden[index]);
      expect(response.status).toBe(status);
      expect(digest()).toBe(before);
      if (path === "/packs/export" && status === 200) expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
    }
  }
});
