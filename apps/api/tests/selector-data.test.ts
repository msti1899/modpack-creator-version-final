import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { createMinecraftVersions } from "../src/selector";

const tags = (entries: unknown[]) => () => Response.json(entries);

function app(responder: (url: URL) => Response | Promise<Response> = tags([])) {
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

test("the list keeps releases only, newest first, with the release date", async () => {
  const { api, calls } = app(
    tags([
      { version: "1.21.2", version_type: "release", date: "2024-10-22T00:00:00Z", major: false },
      { version: "24w45a", version_type: "snapshot", date: "2024-11-06T00:00:00Z", major: false },
      { version: "1.21.4", version_type: "release", date: "2024-12-03T00:00:00Z", major: true },
      { version: "1.20.6", version_type: "release", date: "2024-04-29T00:00:00Z", major: false },
    ]),
  );
  const response = await api.request("/minecraft-versions");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    versions: [
      { version: "1.21.4", releasedAt: "2024-12-03T00:00:00Z" },
      { version: "1.21.2", releasedAt: "2024-10-22T00:00:00Z" },
      { version: "1.20.6", releasedAt: "2024-04-29T00:00:00Z" },
    ],
  });
  expect(calls[0]!.pathname).toBe("/v2/tag/game_version");
});

test("no releases is an empty list, not a failure", async () => {
  const { api } = app(tags([{ version: "24w45a", version_type: "snapshot", date: "2024-11-06T00:00:00Z" }]));
  const response = await api.request("/minecraft-versions");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ versions: [] });
});

test("an upstream failure is a 502 with the error envelope and no list", async () => {
  const { api } = app(() => new Response("down", { status: 500 }));
  const response = await api.request("/minecraft-versions");
  expect(response.status).toBe(502);
  expect(typeof (await response.json()).error).toBe("string");
});

test("a malformed payload is a 502, never a partial list", async () => {
  const { api } = app(tags([{ version: "1.21.4", version_type: "release" }]));
  const response = await api.request("/minecraft-versions");
  expect(response.status).toBe(502);
  expect(typeof (await response.json()).error).toBe("string");
});

test("a timed-out upstream is a 504", async () => {
  const { api } = app(() => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });
  expect((await api.request("/minecraft-versions")).status).toBe(504);
});

test("the list is fetched once inside the cache window and refreshed after it", async () => {
  let clock = 0;
  let fetches = 0;
  const versions = createMinecraftVersions(
    async () => {
      fetches += 1;
      return Response.json([{ version: "1.21.4", version_type: "release", date: "2024-12-03T00:00:00Z" }]);
    },
    { ttlMs: 1_000, now: () => clock },
  );

  expect((await versions())[0]).toEqual({ version: "1.21.4", releasedAt: "2024-12-03T00:00:00Z" });
  clock = 999;
  await versions();
  expect(fetches).toBe(1);
  clock = 1_000;
  await versions();
  expect(fetches).toBe(2);
});

test("concurrent callers share one refresh", async () => {
  let fetches = 0;
  let release: (response: Response) => void = () => {};
  const versions = createMinecraftVersions(async () => {
    fetches += 1;
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  });

  const first = versions();
  const second = versions();
  release(Response.json([{ version: "1.21.4", version_type: "release", date: "2024-12-03T00:00:00Z" }]));
  await Promise.all([first, second]);
  expect(fetches).toBe(1);
});

test("a failed refresh keeps serving the last good list", async () => {
  let clock = 0;
  let fail = false;
  const versions = createMinecraftVersions(
    async () => {
      if (fail) return new Response("down", { status: 503 });
      return Response.json([{ version: "1.21.4", version_type: "release", date: "2024-12-03T00:00:00Z" }]);
    },
    { ttlMs: 1_000, now: () => clock },
  );

  await versions();
  clock = 5_000;
  fail = true;
  expect(await versions()).toEqual([{ version: "1.21.4", releasedAt: "2024-12-03T00:00:00Z" }]);
});

test("a failure with nothing cached surfaces instead of an empty list", async () => {
  const versions = createMinecraftVersions(async () => new Response("down", { status: 503 }));
  await expect(versions()).rejects.toThrow("Modrinth could not complete the request. Please try again later.");
});
