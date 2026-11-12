import { Hono, type Context } from "hono";
import { databaseConfiguration, type DatabaseOptions } from "./database";
import { requireIdentity, type IdentityEnv, type IdentityOptions } from "./identity";
import { exportPack, PackError, settings, validateDraftSelection, type Fetcher } from "./modrinth";
import type { ProfileFetcher } from "./profiles";

type Status = 400 | 401 | 403 | 404 | 409 | 502 | 503 | 504;
class DraftFailure extends Error {
  constructor(readonly status: Status, message: string) { super(message); }
}
const errors: Record<string, Status> = {
  "Authentication required.": 401, "Group required.": 404,
  "Only the group owner may edit the draft.": 403,
  "Invalid draft settings.": 400, "Invalid draft selection.": 400,
  "Invalid draft revision.": 400, "Draft revision conflict.": 409,
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const revision = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;

async function json(stream: ReadableStream<Uint8Array> | null): Promise<unknown> {
  if (!stream) throw new Error();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) throw new Error();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function snapshot(value: unknown) {
  if (!object(value) || typeof value.groupId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.groupId) ||
    (value.role !== "owner" && value.role !== "member")) throw new Error();
  let draft = null;
  if (value.draft !== null) {
    const raw = value.draft;
    if (!object(raw) || !revision(raw.revision) || raw.revision === 0 ||
      typeof raw.updatedAt !== "string" || !Number.isFinite(Date.parse(raw.updatedAt))) throw new Error();
    const config = settings(raw);
    if (config.versionIds.length !== (raw.versionIds as unknown[]).length) throw new Error();
    draft = { ...config, revision: raw.revision, updatedAt: raw.updatedAt };
  }
  return { groupId: value.groupId, role: value.role, draft };
}

export function packDraftRoutes(identity: IdentityOptions, fetcher: Fetcher, dataFetcher: ProfileFetcher, database: DatabaseOptions) {
  const app = new Hono<IdentityEnv>();
  app.use("*", requireIdentity(identity), async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.get("databaseRole") !== "authenticated") return c.json({ error: "Authentication required." }, 401);
    await next();
  });

  async function rpc(c: Context<IdentityEnv>, name: string, args: Record<string, unknown>) {
    let config: ReturnType<typeof databaseConfiguration>;
    try { config = databaseConfiguration(database); }
    catch { throw new DraftFailure(503, "Draft service is not configured."); }
    const response = await dataFetcher(new URL(`/rest/v1/rpc/${name}`, config.url).href, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { apikey: config.key, Authorization: c.req.header("Authorization")!.replace(/^Bearer +/i, "Bearer "),
        Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(args),
    });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      throw new DraftFailure(401, "Authentication required.");
    }
    const value = await json(response.body);
    if (response.status !== 200) {
      if (object(value) && value.code === "P0001" && typeof value.message === "string" && Object.hasOwn(errors, value.message)) {
        throw new DraftFailure(errors[value.message]!, value.message);
      }
      throw new Error();
    }
    // Never expose arbitrary Data API fields or treat malformed upstream data as input errors.
    try { return snapshot(value); } catch { throw new DraftFailure(502, "Draft service unavailable."); }
  }
  async function body(c: Context<IdentityEnv>, keys: string[]) {
    let value: unknown;
    try { value = await json(c.req.raw.body); }
    catch { throw new DraftFailure(400, "Invalid or oversized JSON body."); }
    if (!object(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
      throw new DraftFailure(400, `Expected only ${keys.join(", ")}.`);
    }
    return value;
  }
  app.get("/", async (c) => c.json(await rpc(c, "my_pack_draft", {})));
  app.put("/", async (c) => {
    const input = await body(c, ["gameVersion", "loader", "versionIds", "expectedRevision"]);
    const config = settings(input);
    if (!revision(input.expectedRevision)) throw new DraftFailure(400, "Invalid draft revision.");
    const current = await rpc(c, "my_pack_draft", {});
    if (current.role !== "owner") throw new DraftFailure(403, "Only the group owner may edit the draft.");
    // Reject a stale tab before paying catalog validation; the save RPC still arbitrates under its row lock.
    const storedRevision = current.draft === null ? 0 : current.draft.revision;
    if (storedRevision !== input.expectedRevision) throw new DraftFailure(409, "Draft revision conflict.");
    await validateDraftSelection(fetcher, config);
    return c.json(await rpc(c, "save_pack_draft", { p_group_id: current.groupId,
      p_game_version: config.gameVersion, p_loader: config.loader, p_version_ids: config.versionIds,
      p_expected_revision: input.expectedRevision }));
  });
  app.post("/export", async (c) => {
    const input = await body(c, ["name", "version", "loaderVersion"]);
    const current = await rpc(c, "my_pack_draft", {});
    if (!current.draft) throw new DraftFailure(404, "Draft not found.");
    const archive = await exportPack(fetcher, { ...input, ...current.draft });
    return new Response(new Uint8Array(archive.bytes).buffer, { headers: {
      "content-type": "application/x-modrinth-modpack+zip", "content-disposition": `attachment; filename="${archive.filename}"`,
      "cache-control": "no-store",
    } });
  });
  app.onError((error, c) => {
    const fault = error instanceof DraftFailure || error instanceof PackError ? error :
      ["TimeoutError", "AbortError"].includes(error.name) ? new DraftFailure(504, "Draft service timed out.") :
      new DraftFailure(502, "Draft service unavailable.");
    return c.json({ error: fault.message }, fault.status);
  });
  return app;
}
