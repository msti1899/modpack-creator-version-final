import { expect, test } from "bun:test";
import { createApp } from "../src/index";

const version = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  project_id: "P1",
  name: `${id} display`,
  version_number: id,
  version_type: "release",
  game_versions: ["1.21.1"],
  loaders: ["fabric"],
  date_published: "2026-01-01T00:00:00Z",
  files: [],
  dependencies: [],
  ...extra,
});

const project = (extra: Record<string, unknown> = {}) => ({
  id: "P1", slug: "sodium", title: "Sodium", project_type: "mod", client_side: "required", server_side: "unsupported", ...extra,
});

function app(responder: (url: URL) => Response | Promise<Response>) {
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

/** Serves one project and one version list, so a route can be exercised without upstream calls. */
const catalog = (versions: unknown[], projectBody: unknown = project()) => (url: URL) => {
  if (url.pathname === "/v2/project/sodium" || url.pathname === "/v2/project/P1") return Response.json(projectBody);
  if (url.pathname === "/v2/project/P1/version") return Response.json(versions);
  return new Response("unexpected", { status: 500 });
};

test("lists the compatible versions newest first with the fields the picker needs", async () => {
  const { api, calls } = app(
    catalog([
      version("v1", { date_published: "2026-01-01T00:00:00Z" }),
      version("v2", { date_published: "2026-03-01T00:00:00Z", version_type: "beta" }),
      version("v3", { date_published: "2026-02-01T00:00:00Z", loaders: ["forge"] }),
      version("v4", { date_published: "2026-02-15T00:00:00Z", game_versions: ["1.20.1"] }),
    ]),
  );
  const response = await api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    versions: [
      { id: "v2", projectId: "P1", name: "v2 display", versionNumber: "v2", releaseType: "beta", publishedAt: "2026-03-01T00:00:00Z" },
      { id: "v1", projectId: "P1", name: "v1 display", versionNumber: "v1", releaseType: "release", publishedAt: "2026-01-01T00:00:00Z" },
    ],
  });
  const list = calls.find((url) => url.pathname === "/v2/project/P1/version")!;
  expect(JSON.parse(list.searchParams.get("loaders")!)).toEqual(["fabric"]);
  expect(JSON.parse(list.searchParams.get("game_versions")!)).toEqual(["1.21.1"]);
});

test("resolves a slug and lists that project's versions by its id", async () => {
  const { api, calls } = app(catalog([version("v1")]));
  expect((await api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric")).status).toBe(200);
  expect(calls.map((url) => url.pathname)).toEqual(["/v2/project/sodium", "/v2/project/P1/version"]);
});

test("nothing compatible is an empty list, not a failure", async () => {
  const { api } = app(catalog([version("v3", { loaders: ["forge"] })]));
  const response = await api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ versions: [] });
});

test("an unknown or non-mod project is a 404 before any version lookup", async () => {
  const unknown = app(() => new Response("not found", { status: 404 }));
  expect((await unknown.api.request("/mods/missing/versions?gameVersion=1.21.1&loader=fabric")).status).toBe(404);
  expect(unknown.calls.map((url) => url.pathname)).toEqual(["/v2/project/missing"]);

  const resourcepack = app(catalog([version("v1")], project({ project_type: "resourcepack" })));
  expect((await resourcepack.api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric")).status).toBe(404);
  expect(resourcepack.calls.map((url) => url.pathname)).toEqual(["/v2/project/sodium"]);
});

test("missing, unknown, repeated or invalid parameters are a 400 before any upstream call", async () => {
  const { api, calls } = app(catalog([version("v1")]));
  for (const path of [
    "/mods/sodium/versions",
    "/mods/sodium/versions?loader=fabric",
    "/mods/sodium/versions?gameVersion=1.21.1",
    "/mods/sodium/versions?gameVersion=1.21.1&loader=invalid",
    "/mods/sodium/versions?gameVersion=1.21%201&loader=fabric",
    "/mods/sodium/versions?gameVersion=1.21.1&loader=fabric&sort=newest",
    "/mods/sodium/versions?gameVersion=1.21.1&gameVersion=1.21.2&loader=fabric",
  ]) {
    expect([path, (await api.request(path)).status]).toEqual([path, 400]);
  }
  expect(calls).toHaveLength(0);
});

test("a malformed version entry fails the whole list", async () => {
  const { api } = app(catalog([version("v1"), { ...version("v2"), date_published: undefined }]));
  const response = await api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric");
  expect(response.status).toBe(502);
  expect(typeof (await response.json()).error).toBe("string");
});

test("the list is capped at the newest hundred versions", async () => {
  const many = Array.from({ length: 120 }, (_, index) =>
    version(`v${index}`, { date_published: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z` }),
  );
  const { api } = app(catalog(many));
  const body = await (await api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric")).json();
  expect(body.versions).toHaveLength(100);
});

test("an upstream failure is a 502 and a timeout is a 504", async () => {
  const failing = app((url) =>
    url.pathname === "/v2/project/P1/version" ? new Response("down", { status: 503 }) : Response.json(project()),
  );
  expect((await failing.api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric")).status).toBe(502);

  const timingOut = app((url) => {
    if (url.pathname !== "/v2/project/P1/version") return Response.json(project());
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });
  expect((await timingOut.api.request("/mods/sodium/versions?gameVersion=1.21.1&loader=fabric")).status).toBe(504);
});
