/**
 * Shared contract for the Modrinth catalog browser.
 *
 * The API owns the projection (`apps/api/src/modrinth.ts`); the web redeclares
 * it with the same field names and nullability, and re-validates every payload
 * at the boundary so a malformed response can never reach the ledger.
 */

export const MOD_DEFAULT_GAME_VERSION = "1.21.1";
export const MOD_PAGE_SIZE = 20;
export const MOD_MAX_OFFSET = 10_000;
export const MOD_QUERY_LIMIT = 100;

export const MOD_LOADERS = ["fabric", "forge", "neoforge", "quilt"] as const;
export type ModLoader = (typeof MOD_LOADERS)[number];
export const MOD_DEFAULT_LOADER: ModLoader = "fabric";
export const MOD_LOADER_LABELS: Record<ModLoader, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

export const MOD_SORTS = ["relevance", "downloads", "follows", "newest", "updated"] as const;
export type ModSort = (typeof MOD_SORTS)[number];
export const MOD_DEFAULT_SORT: ModSort = "relevance";
export const MOD_SORT_LABELS: Record<ModSort, string> = {
  relevance: "Relevance",
  downloads: "Downloads",
  follows: "Follows",
  newest: "Newest",
  updated: "Updated",
};

export const MOD_ENVIRONMENTS = ["client", "server"] as const;
export type ModEnvironment = (typeof MOD_ENVIRONMENTS)[number];

/** Modrinth declares each side as required, optional or unsupported. */
export type ModSide = "required" | "optional" | "unsupported";

export type ModSummary = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number | null;
  follows: number | null;
  author: string | null;
  categories: string[];
  clientSide: ModSide | null;
  serverSide: ModSide | null;
  latestVersion: string | null;
};

export type ModPage = {
  hits: ModSummary[];
  total: number;
  offset: number;
};

/** The normalized search that is both validated from a URL and serialized back to one. */
export type ModSearch = {
  query: string;
  gameVersion: string;
  loader: ModLoader;
  offset: number;
  sort: ModSort;
  categories: string[];
  environment: ModEnvironment | null;
  author: string | null;
};

export type ModSearchResult = { ok: true; search: ModSearch } | { ok: false; error: string };

const SINGLE_VALUE_PARAMETERS = [
  "query",
  "gameVersion",
  "loader",
  "offset",
  "sort",
  "environment",
  "author",
] as const;
const ALLOWED_PARAMETERS = new Set<string>([...SINGLE_VALUE_PARAMETERS, "category"]);
const GAME_VERSION = /^[A-Za-z0-9_.+-]{1,50}$/;
const CATEGORY = /^[a-z0-9-]{1,64}$/;
const AUTHOR = /^[A-Za-z0-9_-]{1,64}$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what this pattern has to reject before any upstream call.
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

const failure = (error: string): ModSearchResult => ({ ok: false, error });

/**
 * Validate the eight allowed `GET /mods` parameters and apply the pack defaults.
 * Anything that is not one of the eight is rejected here, before a request is
 * made, so the upstream never sees an unexpected key.
 */
export function buildModSearch(input: URLSearchParams): ModSearchResult {
  for (const key of input.keys()) {
    if (!ALLOWED_PARAMETERS.has(key)) return failure(`Unknown search parameter "${key}".`);
  }
  for (const key of SINGLE_VALUE_PARAMETERS) {
    if (input.getAll(key).length > 1) return failure(`The "${key}" parameter may appear only once.`);
  }

  const query = input.get("query") ?? "";
  if (query.length > MOD_QUERY_LIMIT) {
    return failure(`The search query must be ${MOD_QUERY_LIMIT} characters or fewer.`);
  }
  if (CONTROL_CHARACTERS.test(query)) {
    return failure("The search query contains unsupported characters.");
  }

  const gameVersion = input.get("gameVersion") ?? MOD_DEFAULT_GAME_VERSION;
  if (!GAME_VERSION.test(gameVersion)) return failure("The game version is invalid.");

  const loader = input.get("loader") ?? MOD_DEFAULT_LOADER;
  if (!isLoader(loader)) {
    return failure(`The loader must be one of ${MOD_LOADERS.slice(0, -1).join(", ")} or ${MOD_LOADERS.at(-1)}.`);
  }

  const offsetText = input.get("offset") ?? "0";
  const offset = Number(offsetText);
  if (!/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset) || offset > MOD_MAX_OFFSET) {
    return failure(`The search offset must be a whole number from 0 to ${MOD_MAX_OFFSET}.`);
  }

  const sort = input.get("sort") ?? MOD_DEFAULT_SORT;
  if (!isSort(sort)) {
    return failure(`The sort must be one of ${MOD_SORTS.slice(0, -1).join(", ")} or ${MOD_SORTS.at(-1)}.`);
  }

  const categories: string[] = [];
  for (const value of input.getAll("category")) {
    for (const category of value.split(",")) {
      if (!CATEGORY.test(category)) return failure(`The category "${category}" is invalid.`);
      if (!categories.includes(category)) categories.push(category);
    }
  }

  const environment = input.get("environment");
  if (environment !== null && !isEnvironment(environment)) {
    return failure(`The environment must be ${MOD_ENVIRONMENTS.join(" or ")}.`);
  }

  const author = input.get("author");
  if (author !== null && !AUTHOR.test(author)) {
    return failure("The author may contain only letters, numbers, underscores and hyphens.");
  }

  return {
    ok: true,
    search: { query, gameVersion, loader, offset, sort, categories, environment, author },
  };
}

/** Serialize a normalized search into the exact parameter set the API accepts. */
export function serializeModSearch(search: ModSearch): URLSearchParams {
  const params = new URLSearchParams();
  params.set("query", search.query);
  params.set("gameVersion", search.gameVersion);
  params.set("loader", search.loader);
  params.set("offset", String(search.offset));
  params.set("sort", search.sort);
  for (const category of search.categories) params.append("category", category);
  if (search.environment !== null) params.set("environment", search.environment);
  if (search.author !== null) params.set("author", search.author);
  return params;
}

export type ModContext = { gameVersion: string; loader: ModLoader };

/**
 * Read the locked browse context from the route's own search parameters.
 * There is no web-side pack state yet, so a missing or malformed value falls
 * back to the documented default instead of failing the screen.
 */
export function parseModContext(values: Record<string, string | string[] | undefined>): ModContext {
  const gameVersion = values.gameVersion;
  const loader = values.loader;
  return {
    gameVersion:
      typeof gameVersion === "string" && GAME_VERSION.test(gameVersion)
        ? gameVersion
        : MOD_DEFAULT_GAME_VERSION,
    loader: typeof loader === "string" && isLoader(loader) ? loader : MOD_DEFAULT_LOADER,
  };
}

/** Compact count for the downloads column. Null is missing data, never zero. */
export function formatCount(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) < 1_000) return String(value);
  const thousands = roundToTenth(value / 1_000);
  if (Math.abs(thousands) < 1_000) return `${tenths(thousands)}K`;
  return `${tenths(roundToTenth(value / 1_000_000))}M`;
}

/** Plain grouped integer for result counters ("1,284"). */
export function formatTotal(value: number): string {
  return value.toLocaleString("en-US");
}

/** One short badge for the sides a mod declares it runs on. */
export function environmentLabel(
  clientSide: ModSide | null,
  serverSide: ModSide | null,
): string {
  const client = clientSide === "required" || clientSide === "optional";
  const server = serverSide === "required" || serverSide === "optional";
  if (client && server) return "Both sides";
  if (client) return "Client only";
  if (server) return "Server only";
  return "Unknown side";
}

/** The offset of the next page, or null when the API offset ceiling is reached. */
export function nextOffset(offset: number): number | null {
  const next = offset + MOD_PAGE_SIZE;
  return next <= MOD_MAX_OFFSET ? next : null;
}

/**
 * Whether another page exists. `offset` is the offset of the last page that was
 * requested and `loaded` the number of hits accumulated so far.
 */
export function hasMore(offset: number, loaded: number, total: number): boolean {
  return nextOffset(offset) !== null && loaded > 0 && offset + loaded < total;
}

function isLoader(value: string): value is ModLoader {
  return (MOD_LOADERS as readonly string[]).includes(value);
}

function isSort(value: string): value is ModSort {
  return (MOD_SORTS as readonly string[]).includes(value);
}

function isEnvironment(value: string): value is ModEnvironment {
  return (MOD_ENVIRONMENTS as readonly string[]).includes(value);
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function tenths(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableCount(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function isNullableSide(value: unknown): value is ModSide | null {
  return value === null || value === "required" || value === "optional" || value === "unsupported";
}

/** A hit as the API projects it. Present but malformed fields are rejected. */
export function isModSummary(value: unknown): value is ModSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  return (
    typeof summary.projectId === "string" &&
    typeof summary.slug === "string" &&
    typeof summary.title === "string" &&
    typeof summary.description === "string" &&
    isNullableText(summary.iconUrl) &&
    isNullableCount(summary.downloads) &&
    isNullableCount(summary.follows) &&
    isNullableText(summary.author) &&
    Array.isArray(summary.categories) &&
    summary.categories.every((category) => typeof category === "string") &&
    isNullableSide(summary.clientSide) &&
    isNullableSide(summary.serverSide) &&
    isNullableText(summary.latestVersion)
  );
}

/** Validate the `{ hits, total, offset }` envelope before the UI reads it. */
export function parseModPage(value: unknown): ModPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.hits) || !page.hits.every(isModSummary)) return null;
  if (typeof page.total !== "number" || !Number.isSafeInteger(page.total) || page.total < 0) {
    return null;
  }
  if (typeof page.offset !== "number" || !Number.isSafeInteger(page.offset) || page.offset < 0) {
    return null;
  }
  return { hits: page.hits, total: page.total, offset: page.offset };
}
