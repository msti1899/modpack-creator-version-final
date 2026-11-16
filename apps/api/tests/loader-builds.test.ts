import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { createLoaderBuilds } from "../src/loader-builds";

const fabric = (entries: unknown[]) => () => Response.json(entries);
const fabricEntry = (version: string, stable: boolean) => ({ loader: { version, stable }, intermediary: { version: "1.21.1" } });

function app(responder: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(new Headers(init?.headers).get("User-Agent")).toContain("modpack-creator");
    return responder(url);
  };
  return { api: createApp(fetcher), calls };
}

test("fabric builds are newest first and the newest stable one is recommended", async () => {
  const { api, calls } = app(fabric([fabricEntry("0.20.1", true), fabricEntry("0.20.0", false), fabricEntry("0.19.5", true)]));
  const response = await api.request("/loader-builds?loader=fabric&gameVersion=1.21.1");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    recommended: "0.20.1",
    builds: [
      { build: "0.20.1", stable: true },
      { build: "0.20.0", stable: false },
      { build: "0.19.5", stable: true },
    ],
  });
  expect(calls[0]!.href).toBe("https://meta.fabricmc.net/v2/versions/loader/1.21.1");
});

test("no stable build is a null recommendation, not a guess", async () => {
  const { api } = app(fabric([fabricEntry("0.20.0-beta.1", false)]));
  expect(await (await api.request("/loader-builds?loader=fabric&gameVersion=1.21.1")).json()).toEqual({
    recommended: null,
    builds: [{ build: "0.20.0-beta.1", stable: false }],
  });
});

test("quilt publishes no stability flag, so the version suffix decides it", async () => {
  const { api, calls } = app(() => Response.json([{ loader: { version: "0.20.0-beta.9" } }, { loader: { version: "0.19.4" } }]));
  const body = await (await api.request("/loader-builds?loader=quilt&gameVersion=1.21.1")).json();
  expect(body).toEqual({
    recommended: "0.19.4",
    builds: [
      { build: "0.20.0-beta.9", stable: false },
      { build: "0.19.4", stable: true },
    ],
  });
  expect(calls[0]!.href).toBe("https://meta.quiltmc.org/v3/versions/loader/1.21.1");
});

test("forge reports the recommended promotion as the stable build", async () => {
  const { api, calls } = app(() =>
    Response.json({ homepage: "x", promos: { "1.21.1-recommended": "52.0.1", "1.21.1-latest": "52.0.3", "1.20.1-latest": "47.2.0" } }),
  );
  const body = await (await api.request("/loader-builds?loader=forge&gameVersion=1.21.1")).json();
  expect(body).toEqual({
    recommended: "52.0.1",
    builds: [
      { build: "52.0.3", stable: false },
      { build: "52.0.1", stable: true },
    ],
  });
  expect(calls[0]!.href).toBe("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
});

test("neoforge maps the game version onto the artifact prefix and keeps releases over prereleases", async () => {
  const xml = `<metadata><versioning><versions>
    <version>21.1.266</version>
    <version>21.1.265</version>
    <version>21.1.267-beta.1</version>
    <version>20.6.100</version>
  </versions></versioning></metadata>`;
  const { api, calls } = app(() => new Response(xml));
  const body = await (await api.request("/loader-builds?loader=neoforge&gameVersion=1.21.1")).json();
  expect(body).toEqual({
    recommended: "21.1.266",
    builds: [
      { build: "21.1.267-beta.1", stable: false },
      { build: "21.1.266", stable: true },
      { build: "21.1.265", stable: true },
    ],
  });
  expect(calls[0]!.href).toBe("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml");
});

test("a pair the loader publishes nothing for is an empty list and no recommendation", async () => {
  const forge = app(() => Response.json({ promos: { "1.20.1-latest": "47.2.0" } }));
  expect(await (await forge.api.request("/loader-builds?loader=forge&gameVersion=1.21.1")).json()).toEqual({
    recommended: null,
    builds: [],
  });
  const neoforge = app(() => new Response("<metadata><versioning><versions><version>20.6.100</version></versions></versioning></metadata>"));
  expect(await (await neoforge.api.request("/loader-builds?loader=neoforge&gameVersion=1.21.1")).json()).toEqual({
    recommended: null,
    builds: [],
  });
});

test("missing, unknown, repeated or invalid parameters are a 400 before any request", async () => {
  const { api, calls } = app(fabric([fabricEntry("0.20.1", true)]));
  for (const path of [
    "/loader-builds",
    "/loader-builds?loader=fabric",
    "/loader-builds?gameVersion=1.21.1",
    "/loader-builds?loader=vanilla&gameVersion=1.21.1",
    "/loader-builds?loader=fabric&gameVersion=1.21%201",
    "/loader-builds?loader=fabric&gameVersion=1.21.1&extra=1",
    "/loader-builds?loader=fabric&loader=forge&gameVersion=1.21.1",
  ]) {
    expect([path, (await api.request(path)).status]).toEqual([path, 400]);
  }
  expect(calls).toHaveLength(0);
});

test("an upstream failure is a 502, a timeout is a 504 and malformed data is a 502", async () => {
  const failing = app(() => new Response("down", { status: 503 }));
  expect((await failing.api.request("/loader-builds?loader=fabric&gameVersion=1.21.1")).status).toBe(502);

  const timingOut = app(() => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });
  expect((await timingOut.api.request("/loader-builds?loader=fabric&gameVersion=1.21.1")).status).toBe(504);

  const malformed = app(() => Response.json([{ loader: { version: "0.20.1" } }]));
  expect((await malformed.api.request("/loader-builds?loader=fabric&gameVersion=1.21.1")).status).toBe(502);

  const brokenJson = app(() => new Response("<html>gateway</html>"));
  expect((await brokenJson.api.request("/loader-builds?loader=forge&gameVersion=1.21.1")).status).toBe(502);

  const oversized = app(() => new Response("x".repeat(2 * 1024 * 1024 + 1)));
  expect((await oversized.api.request("/loader-builds?loader=fabric&gameVersion=1.21.1")).status).toBe(502);
});

test("the list is capped at the newest hundred builds", async () => {
  const many = Array.from({ length: 130 }, (_, index) => fabricEntry(`0.${index}.0`, true));
  const { api } = app(fabric(many));
  const body = await (await api.request("/loader-builds?loader=fabric&gameVersion=1.21.1")).json();
  expect(body.builds).toHaveLength(100);
  expect(body.builds[0]!.build).toBe("0.129.0");
});

test("one pair is cached for an hour, refreshed after it, and a failed refresh keeps the last good answer", async () => {
  let clock = 0;
  let fail = false;
  let fetches = 0;
  const builds = createLoaderBuilds(
    async () => {
      fetches += 1;
      if (fail) return new Response("down", { status: 503 });
      return Response.json([fabricEntry("0.20.1", true)]);
    },
    { ttlMs: 1_000, now: () => clock },
  );

  expect((await builds("fabric", "1.21.1")).recommended).toBe("0.20.1");
  clock = 999;
  await builds("fabric", "1.21.1");
  await builds("fabric", "1.20.1");
  expect(fetches).toBe(2);
  clock = 1_000;
  await builds("fabric", "1.21.1");
  expect(fetches).toBe(3);

  fail = true;
  clock = 5_000;
  expect((await builds("fabric", "1.21.1")).recommended).toBe("0.20.1");
});
