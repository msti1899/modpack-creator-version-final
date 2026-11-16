import { PackError, type Fetcher } from "./modrinth";

export type MinecraftVersion = { version: string; releasedAt: string };

const tagsUrl = "https://api.modrinth.com/v2/tag/game_version";
const userAgent = "modpack-creator/0.1 (https://github.com/msti1899/modpack-creator-version-final)";
/** Modrinth publishes roughly 170 releases; the cap keeps one response bounded. */
const maxVersions = 200;
const defaultTtlMs = 60 * 60 * 1000;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function label(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > limit || /[\x00-\x1f\x7f]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * A malformed entry fails the whole list: a partially filtered list would silently hide
 * versions a person can legitimately choose. Snapshots are dropped, never guessed at.
 */
function parse(value: unknown): MinecraftVersion[] {
  if (!Array.isArray(value)) throw new PackError("Modrinth returned invalid version data.", 502);
  const versions: MinecraftVersion[] = [];
  for (const entry of value) {
    if (!object(entry) || typeof entry.version_type !== "string") throw new PackError("Modrinth returned invalid version data.", 502);
    const version = label(entry.version, 50);
    if (version === null) throw new PackError("Modrinth returned invalid version data.", 502);
    if (entry.version_type !== "release") continue;
    const releasedAt = label(entry.date, 40);
    if (releasedAt === null) throw new PackError("Modrinth returned invalid version data.", 502);
    versions.push({ version, releasedAt });
  }
  versions.sort((a, b) =>
    a.releasedAt === b.releasedAt
      ? (a.version < b.version ? 1 : a.version > b.version ? -1 : 0)
      : a.releasedAt < b.releasedAt ? 1 : -1,
  );
  return versions.slice(0, maxVersions);
}

async function fetchVersions(fetcher: Fetcher): Promise<MinecraftVersion[]> {
  let response: Response;
  try {
    response = await fetcher(tagsUrl, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new PackError(timeout ? "Modrinth timed out. Please try again." : "Could not contact Modrinth.", timeout ? 504 : 502);
  }
  if (!response.ok) throw new PackError("Modrinth could not complete the request. Please try again later.", 502);
  let value: unknown;
  try { value = await response.json(); } catch { throw new PackError("Modrinth returned invalid JSON.", 502); }
  return parse(value);
}

/**
 * One Minecraft release list per process. The list changes a few times a year, so a shared
 * hour of cache removes the repeated upstream call; a failed refresh keeps serving the last
 * good list instead of emptying every screen, and concurrent callers share one request.
 */
export function createMinecraftVersions(
  fetcher: Fetcher,
  options: { ttlMs?: number; now?: () => number } = {},
): () => Promise<MinecraftVersion[]> {
  const ttlMs = options.ttlMs ?? defaultTtlMs;
  const now = options.now ?? Date.now;
  let last: { versions: MinecraftVersion[]; at: number } | undefined;
  let inflight: Promise<MinecraftVersion[]> | undefined;

  return function versions(): Promise<MinecraftVersion[]> {
    if (last && now() - last.at < ttlMs) return Promise.resolve(last.versions);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const fetched = await fetchVersions(fetcher);
        last = { versions: fetched, at: now() };
        return fetched;
      } catch (error) {
        if (last) return last.versions;
        throw error;
      } finally {
        inflight = undefined;
      }
    })();
    return inflight;
  };
}
