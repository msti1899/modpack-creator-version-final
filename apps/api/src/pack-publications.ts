import { Hono, type Context } from "hono";
import { databaseConfiguration, type DatabaseOptions } from "./database";
import type { IdentityEnv } from "./identity";
import { exportPack, PackError, settings, validateDraftSelection, type Fetcher } from "./modrinth";
import { draftSnapshot } from "./pack-drafts";
import type { ProfileFetcher } from "./profiles";

// Mounted under the group pack boundary, which already enforces the verified
// Clerk identity and an authenticated database role for every subpath. Each
// handler rechecks the role so a future remount cannot silently drop it.
type Status = 400 | 401 | 403 | 404 | 409 | 502 | 503 | 504;
class PublicationFailure extends Error {
  constructor(readonly status: Status, message: string) { super(message); }
}
const errors: Record<string, Status> = {
  "Authentication required.": 401, "Group required.": 404,
  "Only the group owner may manage published versions.": 403,
  "Invalid page request.": 400, "Invalid publication identifier.": 400,
  "Publication not found.": 404, "Draft not found.": 404,
  "Cannot publish an empty draft.": 400, "Draft revision conflict.": 409,
  "Publication limit reached.": 409,
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

// Mirrors the group-name contract: Unicode whitespace is trimmed and C0/C1
// controls and U+FEFF are rejected.
function trimmedLabel(value: unknown, name: string): string {
  if (typeof value !== "string" || value.includes("\uFEFF")) throw new PackError(`Invalid ${name}.`, 400);
  const trimmed = value.replace(/^\s+|\s+$/g, "");
  if (!trimmed || /[\x00-\x1f\x7f-\x9f]/.test(trimmed)) throw new PackError(`Invalid ${name}.`, 400);
  return trimmed;
}

// Reads accept every value the SQL constraints allow, where char_length counts
// code points. A row written by a direct RPC call must still be readable.
function label(value: unknown, name: string, limit: number): string {
  const trimmed = trimmedLabel(value, name);
  if (Array.from(trimmed).length > limit) throw new PackError(`Invalid ${name}.`, 400);
  return trimmed;
}

// Publish input also stays inside the existing .mrpack export contract, whose
// length limit counts UTF-16 units, so accepted metadata can always be exported.
function publishLabel(value: unknown, name: string, limit: number): string {
  const trimmed = trimmedLabel(value, name);
  if (trimmed.length > limit) throw new PackError(`Invalid ${name}.`, 400);
  return trimmed;
}

async function json(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<unknown> {
  const reader = stream?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Body exceeds limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publication(value: unknown) {
  if (!object(value) || !uuid(value.id) || !integer(value.sequence, 1, 2147483647) ||
    typeof value.active !== "boolean" || !timestamp(value.publishedAt)) throw new Error();
  const config = settings(value);
  if (!Array.isArray(value.versionIds) || config.versionIds.length !== value.versionIds.length) throw new Error();
  return {
    id: value.id, sequence: value.sequence,
    name: label(value.name, "publication name", 100),
    version: label(value.version, "pack version", 50),
    loaderVersion: label(value.loaderVersion, "loader version", 50),
    ...config, active: value.active, publishedAt: value.publishedAt,
  };
}

function page(value: unknown) {
  if (!object(value) || !uuid(value.groupId) || (value.role !== "owner" && value.role !== "member") ||
    !Array.isArray(value.publications) || value.publications.length > 50 ||
    !(value.activePublicationId === null || uuid(value.activePublicationId)) ||
    !(value.nextBeforeSequence === null || integer(value.nextBeforeSequence, 1, 2147483647))) throw new Error();
  const publications = value.publications.map(publication);
  if (publications.filter((item) => item.active).length > 1) throw new Error();
  return { groupId: value.groupId, role: value.role, activePublicationId: value.activePublicationId,
    publications, nextBeforeSequence: value.nextBeforeSequence };
}

function detail(value: unknown) {
  if (!object(value) || !uuid(value.groupId) || (value.role !== "owner" && value.role !== "member")) throw new Error();
  return { groupId: value.groupId, role: value.role, publication: publication(value.publication) };
}

function active(value: unknown) {
  if (!object(value) || !uuid(value.groupId) || !uuid(value.activePublicationId)) throw new Error();
  return { groupId: value.groupId, activePublicationId: value.activePublicationId };
}

export function packPublicationRoutes(fetcher: Fetcher, dataFetcher: ProfileFetcher, database: DatabaseOptions) {
  const app = new Hono<IdentityEnv>();

  async function rpc(c: Context<IdentityEnv>, name: string, args: Record<string, unknown>) {
    let config: ReturnType<typeof databaseConfiguration>;
    try { config = databaseConfiguration(database); }
    catch { throw new PublicationFailure(503, "Publication service is not configured."); }
    const response = await dataFetcher(new URL(`/rest/v1/rpc/${name}`, config.url).href, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { apikey: config.key, Authorization: c.req.header("Authorization")!.replace(/^Bearer +/i, "Bearer "),
        Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(args),
    });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      throw new PublicationFailure(401, "Authentication required.");
    }
    const value = await json(response.body, 262144);
    if (response.status !== 200) {
      if (object(value) && value.code === "P0001" && typeof value.message === "string" && Object.hasOwn(errors, value.message)) {
        throw new PublicationFailure(errors[value.message]!, value.message);
      }
      throw new Error();
    }
    return value;
  }
  function authenticated(c: Context<IdentityEnv>) {
    if (c.get("databaseRole") !== "authenticated") throw new PublicationFailure(401, "Authentication required.");
    c.header("Cache-Control", "no-store");
  }
  async function body(c: Context<IdentityEnv>, keys: string[]) {
    let value: unknown;
    try { value = await json(c.req.raw.body, 16384); }
    catch { throw new PublicationFailure(400, "Invalid or oversized JSON body."); }
    if (!object(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
      throw new PublicationFailure(400, `Expected only ${keys.join(", ")}.`);
    }
    return value;
  }
  function identifier(c: Context<IdentityEnv>) {
    const value = c.req.param("publicationId");
    if (!uuid(value)) throw new PublicationFailure(400, "Invalid publication identifier.");
    return value;
  }
  function read<T>(value: unknown, snapshot: (input: unknown) => T): T {
    try { return snapshot(value); } catch { throw new PublicationFailure(502, "Publication service unavailable."); }
  }

  app.get("/publications", async (c) => {
    authenticated(c);
    const query = c.req.query();
    for (const key of Object.keys(query)) {
      if (key !== "limit" && key !== "before") throw new PublicationFailure(400, "Invalid page request.");
    }
    const rawLimit = query.limit;
    const limit = rawLimit === undefined ? 20 : (/^\d{1,2}$/.test(rawLimit) ? Number(rawLimit) : NaN);
    const before = query.before;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 ||
      (before !== undefined && !/^\d{1,10}$/.test(before))) throw new PublicationFailure(400, "Invalid page request.");
    const sequence = before === undefined ? null : Number(before);
    if (sequence !== null && !integer(sequence, 1, 2147483647)) throw new PublicationFailure(400, "Invalid page request.");
    const value = await rpc(c, "my_pack_publications", { p_limit: limit, p_before_sequence: sequence });
    return c.json(read(value, page));
  });

  app.get("/publications/:publicationId", async (c) => {
    authenticated(c);
    const id = identifier(c);
    const value = await rpc(c, "my_pack_publication", { p_publication_id: id });
    return c.json(read(value, detail));
  });

  app.get("/publications/:publicationId/export", async (c) => {
    authenticated(c);
    const id = identifier(c);
    if (Object.keys(c.req.query()).length !== 0) throw new PublicationFailure(400, "Unexpected export parameters.");
    if (c.req.raw.body !== null) throw new PublicationFailure(400, "Unexpected export body.");
    const current = read(await rpc(c, "my_pack_publication", { p_publication_id: id }), detail);
    const archive = await exportPack(fetcher, current.publication);
    return new Response(new Uint8Array(archive.bytes).buffer, { headers: {
      "content-type": "application/x-modrinth-modpack+zip", "content-disposition": `attachment; filename="${archive.filename}"`,
      "cache-control": "no-store",
    } });
  });

  app.post("/publications", async (c) => {
    authenticated(c);
    const input = await body(c, ["name", "version", "loaderVersion", "expectedRevision"]);
    const name = publishLabel(input.name, "publication name", 100);
    const version = publishLabel(input.version, "pack version", 50);
    const loaderVersion = publishLabel(input.loaderVersion, "loader version", 50);
    if (!/^[A-Za-z0-9_.+\-]+$/.test(loaderVersion)) throw new PublicationFailure(400, "Invalid loader version.");
    if (!integer(input.expectedRevision, 1, 2147483647)) throw new PublicationFailure(400, "Invalid draft revision.");
    const current = read(await rpc(c, "my_pack_draft", {}), draftSnapshot);
    if (current.role !== "owner") throw new PublicationFailure(403, "Only the group owner may manage published versions.");
    if (current.draft === null) throw new PublicationFailure(404, "Draft not found.");
    // Reject a stale tab before paying catalog validation; the publish RPC still
    // arbitrates the same revision under its group lock.
    if (current.draft.revision !== input.expectedRevision) throw new PublicationFailure(409, "Draft revision conflict.");
    if (current.draft.versionIds.length === 0) throw new PublicationFailure(400, "Cannot publish an empty draft.");
    await validateDraftSelection(fetcher, current.draft);
    const value = await rpc(c, "publish_pack_draft", { p_name: name, p_pack_version: version,
      p_loader_version: loaderVersion, p_expected_revision: input.expectedRevision });
    return c.json(read(value, detail), 201);
  });

  app.put("/active-version", async (c) => {
    authenticated(c);
    const input = await body(c, ["publicationId"]);
    if (!uuid(input.publicationId)) throw new PublicationFailure(400, "Invalid publication identifier.");
    const value = await rpc(c, "activate_pack_publication", { p_publication_id: input.publicationId });
    return c.json(read(value, active));
  });

  app.onError((error, c) => {
    const fault = error instanceof PublicationFailure || error instanceof PackError ? error :
      ["TimeoutError", "AbortError"].includes(error.name) ? new PublicationFailure(504, "Publication service timed out.") :
      new PublicationFailure(502, "Publication service unavailable.");
    if (fault.status === 401) c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: fault.message }, fault.status);
  });
  return app;
}
