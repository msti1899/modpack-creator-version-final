import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const project = {
  id: "AbCdEf12", slug: "sodium", title: "Sodium", description: "Rendering", project_type: "mod",
  icon_url: "https://cdn.modrinth.com/data/AbCdEf12/icon.png", downloads: 123, followers: 45,
  author: "jellysquid3", categories: ["optimization"], client_side: "required",
  server_side: "optional", latest_version: "0.5.11",
};
const hit = { ...project, project_id: project.id } as Record<string, unknown>;
delete hit.id;
const page = (hits: unknown[]) => Response.json({ hits, total_hits: hits.length, offset: 0 });
function app(responder: (url: URL) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetcher = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.href);
    return responder(url);
  };
  return { api: createApp(fetcher, {}), calls };
}

test("lookup and search share one summary and lookup rejects malformed enriched fields", async () => {
  const detail = app(() => Response.json(project));
  const search = app(() => page([hit]));
  const detailResponse = await detail.api.request("/mods/sodium");
  const searchResponse = await search.api.request("/mods?gameVersion=1.21.1&loader=fabric");
  expect(detailResponse.status).toBe(200);
  expect(searchResponse.status).toBe(200);
  const detailBody = await detailResponse.json();
  const searchBody = (await searchResponse.json()) as { hits: unknown[] };
  expect(detailBody).toEqual(searchBody.hits[0]);
  expect(detail.calls).toEqual(["https://api.modrinth.com/v2/project/sodium"]);
  for (const extra of [
    { downloads: 1.5 }, { categories: Array(51).fill("x") },
    { icon_url: "http://example.test/icon.png" }, { client_side: "sometimes" },
  ]) {
    const malformed = app(() => Response.json({ ...project, ...extra }));
    expect([JSON.stringify(extra), (await malformed.api.request("/mods/sodium")).status]).toEqual([JSON.stringify(extra), 502]);
  }
});

test("lookup keeps 404 distinct from 429, malformed JSON and timeout", async () => {
  expect((await app(() => new Response("missing", { status: 404 })).api.request("/mods/sodium")).status).toBe(404);
  expect((await app(() => new Response("rate", { status: 429 })).api.request("/mods/sodium")).status).toBe(502);
  expect((await app(() => new Response("{oops", { status: 200 })).api.request("/mods/sodium")).status).toBe(502);
  const timeout = createApp(async () => { throw new DOMException("timeout", "TimeoutError"); }, {});
  expect((await timeout.request("/mods/sodium")).status).toBe(504);
});

test("each active filter is its own ANDed facet group", async () => {
  const { api, calls } = app(() => page([]));
  const response = await api.request("/mods?gameVersion=1.21.1&loader=fabric&category=technology,magic&category=combat&environment=client&author=owner_1");
  expect(response.status).toBe(200);
  expect(JSON.parse(new URL(calls[0]!).searchParams.get("facets")!)).toEqual([
    ["project_type:mod"], ["categories:fabric"], ["versions:1.21.1"],
    ["categories:technology", "categories:magic", "categories:combat"],
    ["client_side:required", "client_side:optional"], ["author:owner_1"],
  ]);
});

test("search falls back to followers and degrades out-of-bounds enriched fields per hit", async () => {
  const fallback = app(() => page([{ project_id: "main", slug: "main", title: "Main", description: "D", project_type: "mod", followers: 9 }]));
  const body = (await (await fallback.api.request("/mods?gameVersion=1.21.1&loader=fabric")).json()) as { hits: { follows: number }[] };
  expect(body.hits[0]!.follows).toBe(9);
  const base = "https://cdn.modrinth.com/";
  for (const [extra, kept] of [
    [{ categories: Array.from({ length: 50 }, (_, i) => `c${i}`) }, true],
    [{ categories: Array.from({ length: 51 }, (_, i) => `c${i}`) }, false],
    [{ author: "a".repeat(64) }, true],
    [{ author: "a".repeat(65) }, false],
    [{ latest_version: "v".repeat(64) }, true],
    [{ latest_version: "v".repeat(65) }, false],
    [{ icon_url: base + "i".repeat(475) }, true],
    [{ icon_url: base + "i".repeat(476) }, false],
  ] as const) {
    const probe = app(() => page([{ project_id: "main", slug: "main", title: "Main", description: "D", project_type: "mod", ...(extra as object) }]));
    const response = await probe.api.request("/mods?gameVersion=1.21.1&loader=fabric");
    expect([JSON.stringify(extra).slice(0, 40), response.status]).toEqual([JSON.stringify(extra).slice(0, 40), 200]);
    const result = await response.json() as { hits: unknown[] };
    expect([JSON.stringify(extra).slice(0, 40), result.hits.length]).toEqual([JSON.stringify(extra).slice(0, 40), kept ? 1 : 0]);
  }
});

test("a full page at realistic maxima stays under 32 KiB", async () => {
  const base = "https://cdn.modrinth.com/";
  const hits = Array.from({ length: 20 }, (_, i) => ({
    project_id: String(i).padStart(8, "0"),
    slug: `mod-slug-${i}-` + "s".repeat(45),
    title: `Mod title ${i} ` + "t".repeat(50),
    description: "A realistic project summary. ".repeat(10).slice(0, 256),
    project_type: "mod",
    icon_url: base + "data/" + String(i).padStart(8, "a") + "/icons/" + "b".repeat(440) + ".png",
    downloads: 987654321,
    follows: 12345678,
    author: "author_" + "a".repeat(57),
    categories: ["technology", "magic", "optimization", "decoration", "worldgen", "equipment"],
    client_side: "required",
    server_side: "optional",
    latest_version: "v".repeat(64),
  }));
  const response = await app(() => Response.json({ hits, total_hits: 5000, offset: 0 })).api.request("/mods?gameVersion=1.21.1&loader=fabric");
  expect(response.status).toBe(200);
  expect(Buffer.byteLength(await response.text())).toBeLessThan(32768);
});
