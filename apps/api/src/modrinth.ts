import { indexArchive } from "./zip";

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export class PackError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 502 | 504) { super(message); }
}
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = /^[A-Za-z0-9_-]{1,100}$/;
const loaders = { fabric: "fabric-loader", forge: "forge", neoforge: "neoforge", quilt: "quilt-loader" } as const;
type Loader = keyof typeof loaders;
type Settings = { gameVersion: string; loader: Loader; versionIds: string[] };
type Version = { id: string; project_id: string; name: string; version_number: string; game_versions: string[]; loaders: string[]; dependencies: Dependency[]; files: FileMetadata[]; date_published: string };
type Dependency = { dependency_type: string; project_id?: string | null; version_id?: string | null };
type FileMetadata = { filename: string; url: string; hashes: { sha1: string; sha512: string }; size: number; primary: boolean };
type Project = { id: string; title: string; project_type: string; client_side: string; server_side: string };
const fail = (message: string): never => { throw new PackError(message, 409); };
export function text(value: unknown, label: string, limit = 100): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw new PackError(`Invalid ${label}.`, 400);
  return value.trim();
}
function id(value: unknown): string {
  if (typeof value !== "string" || !identifier.test(value)) throw new PackError("Invalid Modrinth identifier.", 400);
  return value;
}
export function settings(value: unknown): Settings {
  if (!object(value)) throw new PackError("Expected a JSON object.", 400);
  const gameVersion = text(value.gameVersion, "Minecraft version", 50);
  if (!/^[A-Za-z0-9_.+-]+$/.test(gameVersion)) throw new PackError("Invalid Minecraft version.", 400);
  if (typeof value.loader !== "string" || !Object.hasOwn(loaders, value.loader)) throw new PackError("Unsupported mod loader.", 400);
  if (!Array.isArray(value.versionIds) || value.versionIds.length > 50) throw new PackError("Select at most 50 mod versions.", 400);
  return { gameVersion, loader: value.loader as Loader, versionIds: [...new Set(value.versionIds.map(id))] };
}

/** All caching and budgets are scoped to one incoming request; no pack is persisted. */
class Catalog {
  private cache = new Map<string, Promise<unknown>>();
  private deadline = Date.now() + 20_000;
  constructor(private fetcher: Fetcher) {}
  async get(path: string, missingIsConflict = true): Promise<unknown> {
    if (Date.now() >= this.deadline) throw new PackError("Modrinth timed out. Please try again.", 504);
    const cached = this.cache.get(path);
    if (cached) return cached;
    if (this.cache.size >= 100) fail("This pack exceeds the dependency lookup limit.");
    const request = (async () => {
      let response: Response;
      try {
        response = await this.fetcher(`https://api.modrinth.com/v2${path}`, {
          headers: { "User-Agent": "modpack-creator/0.1 (https://github.com/msti1899/modpack-creator-version-final)", Accept: "application/json" },
          signal: AbortSignal.timeout(Math.max(1, Math.min(8000, this.deadline - Date.now()))), redirect: "error",
        });
      } catch (error) {
        const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
        throw new PackError(timeout ? "Modrinth timed out. Please try again." : "Could not contact Modrinth.", timeout ? 504 : 502);
      }
      if (response.status === 404 && missingIsConflict) fail("A selected mod or dependency is unavailable.");
      if (!response.ok) throw new PackError("Modrinth could not complete the request. Please try again later.", 502);
      try { return await response.json(); } catch { throw new PackError("Modrinth returned invalid JSON.", 502); }
    })();
    this.cache.set(path, request);
    return request;
  }
  async project(projectId: string): Promise<Project> {
    const value = await this.get(`/project/${id(projectId)}`);
    if (!object(value) || typeof value.id !== "string" || typeof value.project_type !== "string") throw new PackError("Modrinth returned an invalid project.", 502);
    if (value.id !== projectId) throw new PackError("Modrinth returned a different project.", 502);
    if (value.project_type !== "mod") fail("Only mods can be included in this pack.");
    return value as Project;
  }
  check(value: unknown, config: Settings): Version {
    if (!object(value) || typeof value.id !== "string" || typeof value.project_id !== "string" || typeof value.name !== "string" || typeof value.version_number !== "string" || !Array.isArray(value.game_versions) || !Array.isArray(value.loaders) || !Array.isArray(value.dependencies) || !Array.isArray(value.files)) throw new PackError("Modrinth returned invalid version metadata.", 502);
    if (!identifier.test(value.id) || !identifier.test(value.project_id)) throw new PackError("Modrinth returned an invalid identifier.", 502);
    if (!value.game_versions.includes(config.gameVersion) || !value.loaders.includes(config.loader)) fail("A mod version does not support the selected Minecraft version and loader.");
    return value as Version;
  }
  async version(versionId: string, config: Settings): Promise<Version> {
    const version = this.check(await this.get(`/version/${id(versionId)}`), config);
    if (version.id !== versionId) throw new PackError("Modrinth returned a different version.", 502);
    return version;
  }
  async latest(projectId: string, config: Settings): Promise<Version> {
    await this.project(projectId);
    const params = new URLSearchParams({ loaders: JSON.stringify([config.loader]), game_versions: JSON.stringify([config.gameVersion]) });
    const values = await this.get(`/project/${id(projectId)}/version?${params}`);
    if (!Array.isArray(values)) throw new PackError("Modrinth returned invalid project versions.", 502);
    const candidates = values.filter((value) => object(value) && Array.isArray(value.game_versions) && value.game_versions.includes(config.gameVersion) && Array.isArray(value.loaders) && value.loaders.includes(config.loader));
    candidates.sort((a, b) => String(b.date_published).localeCompare(String(a.date_published)) || String(a.id).localeCompare(String(b.id)));
    if (!candidates.length) fail("No compatible version is available for a mod or dependency.");
    const version = this.check(candidates[0], config);
    if (version.project_id !== projectId) throw new PackError("Modrinth returned a version from another project.", 502);
    return version;
  }
}

class Selection {
  readonly versions = new Map<string, Version>();
  readonly projects = new Map<string, Project>();
  constructor(private catalog: Catalog, private config: Settings, private allowDependencies: boolean) {}
  async add(version: Version): Promise<void> {
    const existing = this.versions.get(version.project_id);
    if (existing && existing.id !== version.id) fail("Required dependencies conflict with an already selected version.");
    if (existing) return;
    if (this.versions.size >= 50) fail("A pack can contain at most 50 mods including dependencies.");
    const project = await this.catalog.project(version.project_id);
    this.versions.set(version.project_id, version);
    this.projects.set(version.project_id, project);
  }
  async loadPins(): Promise<void> {
    for (const versionId of this.config.versionIds) await this.add(await this.catalog.version(versionId, this.config));
  }
  async complete(): Promise<void> {
    // Map iteration includes newly inserted required dependencies; cyclic graphs terminate by ID.
    for (const version of this.versions.values()) {
      for (const dependency of version.dependencies) {
        if (!object(dependency) || typeof dependency.dependency_type !== "string") throw new PackError("Modrinth returned an invalid dependency.", 502);
        if (dependency.dependency_type !== "required") continue;
        const target = dependency.project_id ? this.versions.get(dependency.project_id) : undefined;
        if (target && (!dependency.version_id || target.id === dependency.version_id)) continue;
        const exact = dependency.version_id ? [...this.versions.values()].find((item) => item.id === dependency.version_id) : undefined;
        if (exact) {
          if (dependency.project_id && exact.project_id !== dependency.project_id) fail("A pinned dependency points to a different project.");
          continue;
        }
        if (!this.allowDependencies) fail("A required dependency is missing or conflicts with the approved selection. Resolve and approve dependencies first.");
        const resolved = dependency.version_id
          ? await this.catalog.version(dependency.version_id, this.config)
          : dependency.project_id
            ? await this.catalog.latest(dependency.project_id, this.config)
            : fail("A required dependency cannot be resolved.");
        if (dependency.project_id && resolved.project_id !== dependency.project_id) fail("A pinned dependency points to a different project.");
        await this.add(resolved);
      }
    }
    for (const version of this.versions.values()) {
      for (const dependency of version.dependencies) {
        if (dependency.dependency_type !== "incompatible") continue;
        const conflict = [...this.versions.values()].some((item) => dependency.version_id ? item.id === dependency.version_id : item.project_id === dependency.project_id);
        if (conflict) fail("The selected mods declare an incompatible dependency.");
      }
    }
  }
}

export async function search(fetcher: Fetcher, input: URLSearchParams) {
  const config = settings({ gameVersion: input.get("gameVersion"), loader: input.get("loader"), versionIds: [] });
  const query = input.get("query") ?? "";
  if (query.length > 100 || /[\x00-\x1f\x7f]/.test(query)) throw new PackError("Invalid search query.", 400);
  const offsetText = input.get("offset") ?? "0";
  const offset = Number(offsetText);
  if (!/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset) || offset > 10000) throw new PackError("Invalid search offset.", 400);
  const params = new URLSearchParams({ query, offset: String(offset), limit: "20", facets: JSON.stringify([["project_type:mod"], [`categories:${config.loader}`], [`versions:${config.gameVersion}`]]) });
  const result = await new Catalog(fetcher).get(`/search?${params}`, false);
  if (!object(result) || !Array.isArray(result.hits) || !Number.isSafeInteger(result.total_hits) || Number(result.total_hits) < 0) throw new PackError("Modrinth returned invalid search results.", 502);
  const hits = result.hits.map((hit) => {
    if (!object(hit) || typeof hit.project_id !== "string" || typeof hit.title !== "string" || typeof hit.slug !== "string" || typeof hit.description !== "string" || hit.project_type !== "mod") throw new PackError("Modrinth returned an invalid mod result.", 502);
    return { projectId: hit.project_id, title: hit.title, description: hit.description, slug: hit.slug };
  });
  return { hits, total: result.total_hits, offset };
}
export async function resolve(fetcher: Fetcher, input: RecordValue) {
  const config = settings(input);
  const projectId = id(input.projectId);
  const catalog = new Catalog(fetcher);
  const selection = new Selection(catalog, config, true);
  await selection.loadPins();
  const requested = selection.versions.get(projectId) ?? await catalog.latest(projectId, config);
  await selection.add(requested);
  await selection.complete();
  const versions = [...selection.versions.values()];
  return {
    versions: versions.map((version) => ({ id: version.id, projectId: version.project_id, name: version.name, versionNumber: version.version_number })),
    addedDependencies: versions.filter((version) => version.id !== requested.id && !config.versionIds.includes(version.id)).map((version) => version.id),
  };
}
function environment(value: string): string {
  if (!["required", "optional", "unsupported"].includes(value)) fail("A mod has invalid client/server support metadata.");
  return value;
}
async function approvedSelection(fetcher: Fetcher, config: Settings): Promise<Selection> {
  const selection = new Selection(new Catalog(fetcher), config, false);
  await selection.loadPins();
  await selection.complete();
  return selection;
}

/** Validate an explicit draft selection without adding or updating dependencies. */
export async function validateDraftSelection(fetcher: Fetcher, input: RecordValue) {
  const config = settings(input);
  await approvedSelection(fetcher, config);
  return config;
}

export type VoteProposal = { versionId: string; projectId: string; projectTitle: string; versionNumber: string };

/**
 * Validate a concrete mod addition against the group's current draft. The pinned
 * addition must be complete on its own: required dependencies are supplied by the
 * caller, never resolved implicitly. Returns the display snapshot stored with the
 * vote so a later catalog change cannot rewrite what the group voted on.
 */
export async function validateVoteAddition(
  fetcher: Fetcher,
  draft: { gameVersion: string; loader: "fabric" | "forge" | "neoforge" | "quilt"; versionIds: string[] } | null,
  input: RecordValue,
): Promise<{ settings: { gameVersion: string; loader: "fabric" | "forge" | "neoforge" | "quilt"; versionIds: string[] }; proposal: VoteProposal[] }> {
  const config = settings(input);
  if (!config.versionIds.length) throw new PackError("Select at least one mod version.", 400);
  if (draft) {
    if (draft.gameVersion !== config.gameVersion || draft.loader !== config.loader) fail("Vote does not match the draft settings.");
    const pinned = new Set(draft.versionIds);
    if (config.versionIds.some((versionId) => pinned.has(versionId))) fail("A proposed version is already in the draft.");
  }
  const union = [...new Set([...(draft?.versionIds ?? []), ...config.versionIds])];
  const selection = await approvedSelection(fetcher, { ...config, versionIds: union });
  const pinned = new Map([...selection.versions.values()].map((version) => [version.id, version]));
  const proposal = config.versionIds.map((versionId) => {
    const version = pinned.get(versionId);
    const project = version ? selection.projects.get(version.project_id) : undefined;
    if (!version || !project) throw new PackError("Modrinth returned an unexpected version.", 502);
    if (typeof project.title !== "string" || !project.title.trim() || project.title.length > 300 || /[\x00-\x1f\x7f]/.test(project.title)) throw new PackError("Modrinth returned an invalid project title.", 502);
    if (typeof version.version_number !== "string" || !version.version_number.trim() || version.version_number.length > 100 || /[\x00-\x1f\x7f]/.test(version.version_number)) throw new PackError("Modrinth returned an invalid version name.", 502);
    return {
      versionId,
      projectId: version.project_id,
      projectTitle: project.title.trim(),
      versionNumber: version.version_number.trim(),
    };
  });
  return { settings: config, proposal };
}

export async function exportPack(fetcher: Fetcher, input: RecordValue) {
  const config = settings(input);
  const name = text(input.name, "pack name");
  const version = text(input.version, "pack version", 50);
  const loaderVersion = text(input.loaderVersion, "loader version", 50);
  if (!/^[A-Za-z0-9_.+\-]+$/.test(loaderVersion)) throw new PackError("Invalid loader version.", 400);
  if (!config.versionIds.length) throw new PackError("Select at least one mod.", 400);
  const selection = await approvedSelection(fetcher, config);
  const filenames = new Set<string>();
  const files = [...selection.versions.values()].map((selected) => {
    const file = selected.files.find((candidate) => candidate.primary) ?? selected.files[0];
    if (!object(file) || typeof file.filename !== "string" || file.filename.length > 200 || !file.filename.toLowerCase().endsWith(".jar") || /[\\/\x00-\x1f\x7f:<>"|?*]/.test(file.filename) || file.filename.includes("..") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(file.filename) || file.filename !== file.filename.trim()) fail("A mod has an unsafe file name.");
    const normalizedName = file.filename.normalize("NFC").toLowerCase();
    if (filenames.has(normalizedName)) fail("Two mods would overwrite the same file.");
    filenames.add(normalizedName);
    let url: URL;
    try { url = new URL(file.url); } catch { return fail("A mod has an invalid download URL."); }
    if (url.protocol !== "https:" || url.hostname !== "cdn.modrinth.com" || url.port || url.username || url.password || url.hash) fail("A mod has an unsupported download URL.");
    if (!object(file.hashes) || !/^[a-f0-9]{40}$/i.test(file.hashes.sha1) || !/^[a-f0-9]{128}$/i.test(file.hashes.sha512) || !Number.isSafeInteger(file.size) || file.size < 0) fail("A mod has invalid file integrity metadata.");
    const project = selection.projects.get(selected.project_id)!;
    return { path: `mods/${file.filename}`, hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 }, env: { client: environment(project.client_side), server: environment(project.server_side) }, downloads: [url.href], fileSize: file.size };
  });
  const index = { formatVersion: 1, game: "minecraft", versionId: version, name, files, dependencies: { minecraft: config.gameVersion, [loaders[config.loader]]: loaderVersion } };
  const filename = name.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "modpack";
  return { bytes: indexArchive(index), filename: `${filename}.mrpack` };
}
