import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const hit = (id: string, extra: Record<string, unknown> = {}) => ({
  project_id: id, title: id, description: `${id} description`, slug: id, project_type: "mod", ...extra,
});

function app(responder: (url: URL) => Response | Promise<Response> = () => Response.json({ hits: [], total_hits: 0, offset: 0 })) {
  const calls: URL[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(url.origin).toBe("https://api.modrinth.com");
    expect(new Headers(init?.headers).get("User-Agent")).toContain("modpack-creator");
    return responder(url);
  };
  return { api: createApp(fetcher), calls };
}

const searchPage = (hits: unknown[], total: number, offset = 0) => () => Response.json({ hits, total_hits: total, offset });

test("search pins loader, Minecraft version, page size and offset upstream", async () => {
  const { api, calls } = app(searchPage([hit("main")], 1));
  const response = await api.request("/mods?gameVersion=1.21.1&loader=fabric");
  expect(response.status).toBe(200);
  const target = calls[0]!;
  expect(target.pathname).toBe("/v2/search");
  expect(target.searchParams.get("limit")).toBe("20");
  expect(target.searchParams.get("offset")).toBe("0");
  expect(target.searchParams.get("query")).toBe("");
  expect(JSON.parse(target.searchParams.get("facets")!)).toEqual([["project_type:mod"], ["categories:fabric"], ["versions:1.21.1"]]);
});

test("search accepts only digit offsets within 0..10000", async () => {
  const { api } = app(searchPage([hit("main")], 1));
  for (const [offset, status] of [["0", 200], ["10000", 200], ["10001", 400], ["-1", 400], ["", 400], ["1.5", 400], ["1e3", 400], ["99999999999999999999", 400]] as const) {
    expect([offset, (await api.request(`/mods?gameVersion=1.21.1&loader=fabric&offset=${offset}`)).status]).toEqual([offset, status]);
  }
});

test("search rejects invalid settings and query bounds before contacting upstream", async () => {
  const { api, calls } = app();
  for (const path of [
    "/mods?loader=fabric",
    "/mods?gameVersion=1.21.1",
    "/mods?gameVersion=1.21.1&loader=invalid",
    "/mods?gameVersion=1.21%201&loader=fabric",
    "/mods?gameVersion=1.21.1&loader=fabric&query=%01",
    `/mods?gameVersion=1.21.1&loader=fabric&query=${"a".repeat(101)}`,
  ]) {
    const response = await api.request(path);
    expect([path, response.status]).toEqual([path, 400]);
    expect(typeof (await response.json()).error).toBe("string");
  }
  expect(calls).toHaveLength(0);
  expect((await api.request(`/mods?gameVersion=1.21.1&loader=fabric&query=${"a".repeat(100)}`)).status).toBe(200);
});

test("an empty result page keeps its shape", async () => {
  const { api } = app();
  const response = await api.request("/mods?gameVersion=1.21.1&loader=fabric&offset=40");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ hits: [], total: 0, offset: 40 });
});

test("upstream search failures are 502 and never look like empty results", async () => {
  for (const responder of [
    () => new Response("not found", { status: 404 }),
    () => new Response("rate limited", { status: 429 }),
    () => new Response("boom", { status: 500 }),
    () => Response.json({ malformed: true }),
  ]) {
    const { api } = app(responder);
    const response = await api.request("/mods?gameVersion=1.21.1&loader=fabric");
    expect(response.status).toBe(502);
    expect(typeof (await response.json()).error).toBe("string");
  }
  const timeout = createApp(async () => { throw new DOMException("timeout", "TimeoutError"); });
  expect((await timeout.request("/mods?gameVersion=1.21.1&loader=fabric")).status).toBe(504);
});

test("unknown query parameters are rejected instead of being ignored", async () => {
  const { api, calls } = app();
  for (const path of ["/mods?gameVersion=1.21.1&loader=fabric&catgory=tech", "/mods?gameVersion=1.21.1&loader=fabric&limit=100"]) {
    const response = await api.request(path);
    expect([path, response.status]).toEqual([path, 400]);
    expect(await response.json()).toEqual({ error: "Invalid query parameter." });
  }
  expect(calls).toHaveLength(0);
});

test("sort defaults to relevance and maps to the upstream index parameter", async () => {
  const { api, calls } = app(searchPage([hit("main")], 1));
  const defaulted = await api.request("/mods?gameVersion=1.21.1&loader=fabric");
  expect(defaulted.status).toBe(200);
  expect(calls.at(-1)!.searchParams.get("index")).toBe("relevance");
  for (const value of ["relevance", "downloads", "follows", "newest", "updated"]) {
    expect([value, (await api.request(`/mods?gameVersion=1.21.1&loader=fabric&sort=${value}`)).status]).toEqual([value, 200]);
    expect(calls.at(-1)!.searchParams.get("index")).toBe(value);
  }
  for (const value of ["", "popular", "Downloads", "follows%20desc"]) {
    expect([value, (await api.request(`/mods?gameVersion=1.21.1&loader=fabric&sort=${value}`)).status]).toEqual([value, 400]);
  }
});

test("category unions within its own facet group and rejects invalid slugs", async () => {
  const { api, calls } = app(searchPage([hit("main")], 1));
  const base = "/mods?gameVersion=1.21.1&loader=fabric&category=";
  let response = await api.request(`${base}technology&category=magic`);
  expect(response.status).toBe(200);
  expect(JSON.parse(calls.at(-1)!.searchParams.get("facets")!)).toEqual([
    ["project_type:mod"], ["categories:fabric"], ["versions:1.21.1"], ["categories:technology", "categories:magic"],
  ]);
  response = await api.request(`${base}technology,magic`);
  expect(response.status).toBe(200);
  expect(JSON.parse(calls.at(-1)!.searchParams.get("facets")!)[3]).toEqual(["categories:technology", "categories:magic"]);
  response = await api.request(`${base}technology&category=technology`);
  expect(response.status).toBe(200);
  expect(JSON.parse(calls.at(-1)!.searchParams.get("facets")!)[3]).toEqual(["categories:technology"]);
  for (const value of ["", "Technology", "tech nology", "%2e%2e", "a".repeat(65), "technology,,magic"]) {
    expect([value, (await api.request(`${base}${value}`)).status]).toEqual([value, 400]);
  }
});

test("environment matches mods that run on the selected side", async () => {
  const { api, calls } = app(searchPage([hit("main")], 1));
  const base = "/mods?gameVersion=1.21.1&loader=fabric";
  expect((await api.request(`${base}&environment=client`)).status).toBe(200);
  expect(JSON.parse(calls.at(-1)!.searchParams.get("facets")!)[3]).toEqual(["client_side:required", "client_side:optional"]);
  expect((await api.request(`${base}&environment=server`)).status).toBe(200);
  expect(JSON.parse(calls.at(-1)!.searchParams.get("facets")!)[3]).toEqual(["server_side:required", "server_side:optional"]);
  expect((await api.request(base)).status).toBe(200);
  expect(JSON.parse(calls.at(-1)!.searchParams.get("facets")!)).toEqual([["project_type:mod"], ["categories:fabric"], ["versions:1.21.1"]]);
  for (const value of ["", "both", "Client", "server_side"]) {
    expect([value, (await api.request(`${base}&environment=${value}`)).status]).toEqual([value, 400]);
  }
});

test("author is forwarded as its own facet", async () => {
  const { api, calls } = app(searchPage([hit("main")], 1));
  const base = "/mods?gameVersion=1.21.1&loader=fabric&author=";
  expect((await api.request(`${base}Prospector_1`)).status).toBe(200);
  expect(JSON.parse(calls.at(-1)!.searchParams.get("facets")!)[3]).toEqual(["author:Prospector_1"]);
  for (const value of ["", "bad author", "a".repeat(65), "%2e%2e"]) {
    expect([value, (await api.request(`${base}${value}`)).status]).toEqual([value, 400]);
  }
});

test("exact project lookup returns one summary and distinguishes not-found from failure", async () => {
  const project = { id: "AbCdEf12", slug: "sodium", title: "Sodium", description: "Rendering", project_type: "mod" };
  const { api, calls } = app((url) => ["/v2/project/sodium", "/v2/project/AbCdEf12"].includes(url.pathname) ? Response.json(project) : new Response("missing", { status: 404 }));
  const found = await api.request("/mods/sodium");
  expect(found.status).toBe(200);
  expect(await found.json()).toEqual({
    projectId: "AbCdEf12", slug: "sodium", title: "Sodium", description: "Rendering",
    iconUrl: null, downloads: null, follows: null, author: null, categories: [],
    clientSide: null, serverSide: null, latestVersion: null,
  });
  const detailed = app(() => Response.json({
    ...project, icon_url: "https://cdn.modrinth.com/data/x/icon.png", followers: 7,
    client_side: "optional", server_side: "unsupported", categories: ["optimization"],
  }));
  expect(await (await detailed.api.request("/mods/sodium")).json()).toMatchObject({
    iconUrl: "https://cdn.modrinth.com/data/x/icon.png", follows: 7,
    clientSide: "optional", serverSide: "unsupported", categories: ["optimization"],
  });
  expect(calls.map((url) => url.pathname)).toEqual(["/v2/project/sodium"]);
  expect((await api.request("/mods/AbCdEf12")).status).toBe(200);
  const missing = await api.request("/mods/missing");
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: "Mod not found." });
  for (const path of ["/mods/bad%20slug", "/mods/sodium.js", `/mods/${"a".repeat(65)}`]) {
    expect([path, (await api.request(path)).status]).toEqual([path, 400]);
  }
  expect((await app(() => new Response("boom", { status: 500 })).api.request("/mods/sodium")).status).toBe(502);
  expect((await createApp(async () => { throw new DOMException("timeout", "TimeoutError"); }).request("/mods/sodium")).status).toBe(504);
  expect((await app(() => Response.json({ ...project, project_type: "resourcepack" })).api.request("/mods/sodium")).status).toBe(404);
  expect((await app(() => Response.json({ id: project.id, slug: project.slug, title: project.title, description: project.description })).api.request("/mods/sodium")).status).toBe(502);
});

test("hits carry the enriched summary and normalize absent fields", async () => {
  const enriched = hit("main", {
    icon_url: "https://cdn.modrinth.com/data/main/icon.png", downloads: 12, follows: 3, author: "owner",
    categories: ["technology"], client_side: "required", server_side: "unsupported", latest_version: "2.0",
  });
  const { api } = app(searchPage([enriched], 1));
  expect(await (await api.request("/mods?gameVersion=1.21.1&loader=fabric")).json()).toEqual({
    hits: [{
      projectId: "main", slug: "main", title: "main", description: "main description",
      iconUrl: "https://cdn.modrinth.com/data/main/icon.png", downloads: 12, follows: 3, author: "owner",
      categories: ["technology"], clientSide: "required", serverSide: "unsupported", latestVersion: "2.0",
    }], total: 1, offset: 0,
  });
  const bare = app(searchPage([hit("main")], 1));
  const normalized = (await (await bare.api.request("/mods?gameVersion=1.21.1&loader=fabric")).json()) as { hits: Record<string, unknown>[] };
  expect(normalized.hits[0]).toMatchObject({
    iconUrl: null, downloads: null, follows: null, author: null, categories: [],
    clientSide: null, serverSide: null, latestVersion: null,
  });
});

test("malformed summary fields are rejected instead of forwarded", async () => {
  for (const extra of [
    { downloads: -1 }, { downloads: 1.5 }, { follows: "many" }, { author: 5 }, { author: "a".repeat(65) },
    { icon_url: "http://example.test/icon.png" }, { icon_url: 5 }, { categories: ["ok", 5] },
    { categories: Array(51).fill("ok") }, { client_side: "sometimes" }, { latest_version: "x".repeat(65) },
  ]) {
    const { api } = app(searchPage([hit("main", extra)], 1));
    expect([JSON.stringify(extra), (await api.request("/mods?gameVersion=1.21.1&loader=fabric")).status]).toEqual([JSON.stringify(extra), 502]);
  }
});

test("a full page of enriched hits stays under 32 KiB", async () => {
  const hits = Array.from({ length: 20 }, (_, index) => hit(`project${index}`, {
    slug: `mod-slug-${index}-${"s".repeat(30)}`,
    title: `Mod title ${index} ${"t".repeat(60)}`,
    description: "d".repeat(300),
    icon_url: `https://cdn.modrinth.com/data/${index}/icon.png`,
    downloads: 123456789,
    follows: 1234567,
    author: "author_name",
    categories: ["technology", "decoration", "optimization"],
    client_side: "required",
    server_side: "optional",
    latest_version: "1.0.0",
  }));
  const { api } = app(searchPage(hits, 400));
  const response = await api.request("/mods?gameVersion=1.21.1&loader=fabric");
  const bytes = Buffer.byteLength(await response.text());
  console.log(`Enriched 20-hit page: ${bytes} bytes`);
  expect(bytes).toBeLessThan(32768);
});

test("repeated single-value parameters are rejected instead of narrowed", async () => {
  const { api, calls } = app();
  for (const query of ["sort=downloads&sort=newest", "environment=client&environment=server", "author=a&author=b", "loader=fabric&loader=forge", "offset=0&offset=20"]) {
    const response = await api.request(`/mods?gameVersion=1.21.1&${query}`);
    expect([query, response.status]).toEqual([query, 400]);
  }
  expect(calls).toHaveLength(0);
});

test("malformed hits are rejected instead of being forwarded", async () => {
  for (const malformed of [
    hit("main", { project_type: "resourcepack" }),
    hit("main", { slug: undefined }),
    hit("main", { title: 1 }),
    { project_id: "main", title: "Main", description: "No slug", project_type: "mod" },
  ]) {
    const { api } = app(searchPage([malformed], 1));
    expect((await api.request("/mods?gameVersion=1.21.1&loader=fabric")).status).toBe(502);
  }
});
