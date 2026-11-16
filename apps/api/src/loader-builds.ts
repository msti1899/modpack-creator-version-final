import { PackError, type Fetcher } from "./modrinth";

export type LoaderBuild = { build: string; stable: boolean };
export type LoaderBuilds = { recommended: string | null; builds: LoaderBuild[] };

export const LOADER_NAMES = ["fabric", "forge", "neoforge", "quilt"] as const;
export type LoaderName = (typeof LOADER_NAMES)[number];

const userAgent = "modpack-creator/0.1 (https://github.com/msti1899/modpack-creator-version-final)";
/** The newest hundred builds are the useful half; NeoForge alone publishes 1859 artifacts. */
const maxBuilds = 100;
/** Fabric answers about 600 KiB and Quilt about 900 KiB for one game version; both stay bounded. */
const maxBodyBytes = 2 * 1024 * 1024;
const defaultTtlMs = 60 * 60 * 1000;
const maxCacheEntries = 200;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const invalid = () => new PackError("The mod loader service returned invalid data.", 502);

function label(value: unknown, limit = 50): string {
  if (typeof value !== "string") throw invalid();
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > limit || /[\x00-\x1f\x7f]/.test(trimmed)) throw invalid();
  return trimmed;
}

/** Quilt and NeoForge publish no stability flag, so their own version suffix is the signal. */
const stableByConvention = (build: string) => !/-(alpha|beta|pre|rc|snapshot)/i.test(build);

function compareBuilds(a: string, b: string): number {
  const left = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const right = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return b.localeCompare(a);
}

/** Newest first by the loader's own numbering; `recommended` is the newest build marked stable. */
function assemble(builds: LoaderBuild[]): LoaderBuilds {
  const unique = [...new Map(builds.map((entry) => [entry.build, entry])).values()]
    .sort((a, b) => compareBuilds(a.build, b.build))
    .slice(0, maxBuilds);
  return { recommended: unique.find((entry) => entry.stable)?.build ?? null, builds: unique };
}

async function read(fetcher: Fetcher, url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json, application/xml, text/xml" },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new PackError(timeout ? "The mod loader service timed out. Please try again." : "Could not contact the mod loader service.", timeout ? 504 : 502);
  }
  if (!response.ok) throw new PackError("The mod loader service could not complete the request. Please try again later.", 502);
  const body = await response.text();
  if (body.length > maxBodyBytes) throw new PackError("The mod loader service returned an oversized response.", 502);
  return body;
}

function json(body: string): unknown {
  try { return JSON.parse(body); } catch { throw invalid(); }
}

function fabricBuilds(body: string): LoaderBuild[] {
  const value = json(body);
  if (!Array.isArray(value)) throw invalid();
  return value.map((entry) => {
    if (!object(entry) || !object(entry.loader) || typeof entry.loader.stable !== "boolean") throw invalid();
    return { build: label(entry.loader.version), stable: entry.loader.stable };
  });
}

function quiltBuilds(body: string): LoaderBuild[] {
  const value = json(body);
  if (!Array.isArray(value)) throw invalid();
  return value.map((entry) => {
    if (!object(entry) || !object(entry.loader)) throw invalid();
    const build = label(entry.loader.version);
    return { build, stable: stableByConvention(build) };
  });
}

/** Forge promotes one build per game version as `recommended`; that promotion is its stable signal. */
function forgeBuilds(body: string, gameVersion: string): LoaderBuild[] {
  const value = json(body);
  if (!object(value) || !object(value.promos)) throw invalid();
  const promos = value.promos;
  const recommended = typeof promos[`${gameVersion}-recommended`] === "string" ? label(promos[`${gameVersion}-recommended`]) : null;
  const latest = typeof promos[`${gameVersion}-latest`] === "string" ? label(promos[`${gameVersion}-latest`]) : null;
  if (promos[`${gameVersion}-recommended`] !== undefined && recommended === null) throw invalid();
  if (promos[`${gameVersion}-latest`] !== undefined && latest === null) throw invalid();
  const stable = recommended ?? latest;
  return (stable === null ? [] : [stable]).concat(latest !== null && latest !== stable ? [latest] : [])
    .map((build) => ({ build, stable: build === stable }));
}

/** NeoForge tags an artifact `21.1.266` for Minecraft 1.21.1, so the game version is the prefix. */
function neoforgeBuilds(body: string, gameVersion: string): LoaderBuild[] {
  const prefix = `${gameVersion.replace(/^1\./, "")}.`;
  const builds: LoaderBuild[] = [];
  for (const match of body.matchAll(/<version>([^<]+)<\/version>/g)) {
    const value = match[1]!.trim();
    if (!value.startsWith(prefix)) continue;
    // The artifact version is what a pack declares, not the suffix that identifies it.
    if (!/^[0-9A-Za-z.+_-]{1,50}$/.test(value)) throw invalid();
    builds.push({ build: value, stable: stableByConvention(value.slice(prefix.length)) });
  }
  return builds;
}

function sources(loader: LoaderName, gameVersion: string): { url: string; parse: (body: string) => LoaderBuild[] } {
  const encoded = encodeURIComponent(gameVersion);
  switch (loader) {
    case "fabric": return { url: `https://meta.fabricmc.net/v2/versions/loader/${encoded}`, parse: fabricBuilds };
    case "quilt": return { url: `https://meta.quiltmc.org/v3/versions/loader/${encoded}`, parse: quiltBuilds };
    case "forge": return { url: "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json", parse: (body) => forgeBuilds(body, gameVersion) };
    case "neoforge": return { url: "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml", parse: (body) => neoforgeBuilds(body, gameVersion) };
  }
}

async function fetchBuilds(fetcher: Fetcher, loader: LoaderName, gameVersion: string): Promise<LoaderBuilds> {
  const source = sources(loader, gameVersion);
  return assemble(source.parse(await read(fetcher, source.url)));
}

/**
 * One entry per loader and game version, shared by every caller for an hour. A failed refresh
 * keeps the last good answer for that pair; the source never invents a build, and an empty
 * pair stays empty so a caller can only offer manual entry.
 */
export function createLoaderBuilds(
  fetcher: Fetcher,
  options: { ttlMs?: number; now?: () => number } = {},
): (loader: LoaderName, gameVersion: string) => Promise<LoaderBuilds> {
  const ttlMs = options.ttlMs ?? defaultTtlMs;
  const now = options.now ?? Date.now;
  const last = new Map<string, { value: LoaderBuilds; at: number }>();
  const inflight = new Map<string, Promise<LoaderBuilds>>();

  return function builds(loader: LoaderName, gameVersion: string): Promise<LoaderBuilds> {
    const key = `${loader}:${gameVersion}`;
    const cached = last.get(key);
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value);
    const pending = inflight.get(key);
    if (pending) return pending;
    const request = (async () => {
      try {
        const value = await fetchBuilds(fetcher, loader, gameVersion);
        if (last.size >= maxCacheEntries && !last.has(key)) last.delete(last.keys().next().value!);
        last.set(key, { value, at: now() });
        return value;
      } catch (error) {
        if (cached) return cached.value;
        throw error;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, request);
    return request;
  };
}

/** Both parameters are required and each may appear once; anything else is a 400. */
export function loaderBuildQuery(params: URLSearchParams): { loader: LoaderName; gameVersion: string } {
  for (const key of params.keys()) if (key !== "loader" && key !== "gameVersion") throw new PackError("Invalid query parameter.", 400);
  if (params.getAll("loader").length !== 1 || params.getAll("gameVersion").length !== 1) throw new PackError("Invalid query parameter.", 400);
  const loader = params.get("loader")!;
  if (!(LOADER_NAMES as readonly string[]).includes(loader)) throw new PackError("Unsupported mod loader.", 400);
  const gameVersion = params.get("gameVersion")!;
  if (!/^[A-Za-z0-9_.+-]{1,50}$/.test(gameVersion)) throw new PackError("Invalid Minecraft version.", 400);
  return { loader: loader as LoaderName, gameVersion };
}
