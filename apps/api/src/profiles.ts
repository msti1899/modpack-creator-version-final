import { Hono } from "hono";
import { databaseConfiguration, type DatabaseOptions } from "./database";
import { requireIdentity, type IdentityEnv, type IdentityOptions } from "./identity";

export type ProfileFetcher = (url: string, init: RequestInit) => Promise<Response>;
class ProfileFailure extends Error {
  constructor(readonly status: 400 | 401 | 404 | 409 | 502 | 503 | 504, message: string) { super(message); }
}
const validUsername = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 3 && value.length <= 20 && !/[^A-Za-z0-9_]/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

async function jsonBody(body: ReadableStream<Uint8Array> | null, max: number): Promise<unknown> {
  const reader = body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error("Body exceeds limit"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function profileRoutes(options: IdentityOptions, fetcher: ProfileFetcher, database: DatabaseOptions) {
  const app = new Hono<IdentityEnv>();
  function failure(error: unknown, c: import("hono").Context<IdentityEnv>) {
    const fault = error instanceof ProfileFailure ? error
      : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
        ? new ProfileFailure(504, "Profile service timed out.") : new ProfileFailure(502, "Profile service unavailable.");
    if (fault.status === 401) c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: fault.message }, fault.status);
  }
  app.on(["GET", "POST", "PATCH"], "/", requireIdentity(options), async (c) => {
    try {
      if (c.get("databaseRole") !== "authenticated") throw new ProfileFailure(401, "Authentication required.");
      const method = c.req.method;
      let username: unknown;
      if (method !== "GET") {
        let input: unknown;
        try { input = await jsonBody(c.req.raw.body, 1024); }
        catch { throw new ProfileFailure(400, "Invalid or oversized JSON body."); }
        if (!input || typeof input !== "object" || Array.isArray(input) ||
          Object.keys(input).length !== 1 || !("username" in input) || !validUsername(input.username)) {
          throw new ProfileFailure(400, "Expected only a valid username (3-20 ASCII letters, digits, or underscores).");
        }
        username = input.username;
      }
      let config: ReturnType<typeof databaseConfiguration>;
      try { config = databaseConfiguration(database); }
      catch { throw new ProfileFailure(503, "Profile service is not configured."); }
      const authorization = c.req.header("Authorization")!.replace(/^Bearer +/i, "Bearer ");
      const ownerUrl = () => {
        const target = new URL("/rest/v1/profiles", config.url);
        target.searchParams.set("select", "username,username_changed_at");
        target.searchParams.set("user_id", "eq." + c.get("identity").id);
        return target;
      };
      // A creation conflict can mean this account already has a profile or that
      // another account owns the name. Reuse the owner-scoped read instead of
      // parsing provider constraint text so the client can pick its recovery path.
      const ownsProfile = async (): Promise<boolean | null> => {
        try {
          const lookup = await fetcher(ownerUrl().href, {
            method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
            headers: { apikey: config.key, Authorization: authorization, Accept: "application/json" },
          });
          const body = await jsonBody(lookup.body, 4096);
          if (lookup.status !== 200 || !Array.isArray(body) || body.length > 1) return null;
          if (!body.length) return false;
          const row = body[0] as { username?: unknown; username_changed_at?: unknown } | null;
          if (!row || !validUsername(row.username) || (row.username_changed_at !== null &&
            (typeof row.username_changed_at !== "string" || !Number.isFinite(Date.parse(row.username_changed_at))))) return null;
          return true;
        } catch { return null; }
      };
      const response = await fetcher(ownerUrl().href, {
        method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { apikey: config.key, Authorization: authorization,
          Accept: "application/json", "Content-Type": "application/json", Prefer: "return=representation" },
        body: method === "GET" ? undefined : JSON.stringify(method === "POST" ? { user_id: c.get("identity").id, username } : { username }),
      });
      if (response.status === 401) {
        await response.body?.cancel().catch(() => {});
        throw new ProfileFailure(401, "Authentication required.");
      }
      const value = await jsonBody(response.body, 4096);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const fault = value as { code?: unknown; message?: unknown };
        if (response.status === 409 && fault.code === "23505") {
          if (method === "PATCH") throw new ProfileFailure(409, "Username is already taken.");
          const owns = await ownsProfile();
          if (owns === true) throw new ProfileFailure(409, "Profile already exists.");
          if (owns === false) throw new ProfileFailure(409, "Username is already taken.");
          throw new ProfileFailure(409, "Profile or username already exists.");
        }
        if (response.status === 400 && fault.code === "P0001" && fault.message === "Username can only be changed every 30 days.") {
          throw new ProfileFailure(409, "Username can only be changed every 30 days.");
        }
      }
      if (response.status !== (method === "POST" ? 201 : 200) || !Array.isArray(value) || value.length > 1) throw new Error();
      if (!value.length) {
        if (method === "PATCH") throw new ProfileFailure(404, "Profile not found.");
        if (method !== "GET") throw new Error();
        return c.json({ profile: null });
      }
      const row = value[0];
      if (!row || !validUsername(row.username) || (row.username_changed_at !== null &&
        (typeof row.username_changed_at !== "string" || !Number.isFinite(Date.parse(row.username_changed_at))))) throw new Error();
      return c.json({ profile: { username: row.username, usernameChangedAt: row.username_changed_at } }, method === "POST" ? 201 : 200);
    } catch (error) { return failure(error, c); }
  });
  app.delete("/", requireIdentity(options), async (c) => {
    try {
      if (c.get("databaseRole") !== "authenticated") throw new ProfileFailure(401, "Authentication required.");
      if (c.req.raw.body !== null) {
        let input: unknown;
        try { input = await jsonBody(c.req.raw.body, 1024); }
        catch { throw new ProfileFailure(400, "Invalid or oversized JSON body."); }
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
          throw new ProfileFailure(400, "Invalid or oversized JSON body.");
        }
      }
      let config: ReturnType<typeof databaseConfiguration>;
      try { config = databaseConfiguration(database); }
      catch { throw new ProfileFailure(503, "Profile service is not configured."); }
      const response = await fetcher(new URL("/rest/v1/rpc/delete_my_account", config.url).href, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { apikey: config.key,
          Authorization: c.req.header("Authorization")!.replace(/^Bearer +/i, "Bearer "),
          Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.status === 401) {
        await response.body?.cancel().catch(() => {});
        throw new ProfileFailure(401, "Authentication required.");
      }
      const value = await jsonBody(response.body, 4096);
      if (response.status !== 200) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const fault = value as { code?: unknown; message?: unknown };
          // The remedy for this refusal is the existing ownership transfer.
          if (fault.code === "P0001" &&
            fault.message === "Transfers are required before leaving a group with other members.") {
            throw new ProfileFailure(409, "Transfers are required before leaving a group with other members.");
          }
        }
        throw new Error();
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      const stored = value as { deleted?: unknown; groupId?: unknown; groupDeleted?: unknown };
      const groupId = uuid(stored.groupId) ? stored.groupId : null;
      if (typeof stored.deleted !== "boolean" || typeof stored.groupDeleted !== "boolean" ||
        (stored.groupId !== null && groupId === null) || (groupId === null && stored.groupDeleted) ||
        (stored.deleted === false && groupId !== null)) throw new Error();
      return c.json({ account: { deleted: stored.deleted,
        group: groupId === null ? null : { id: groupId, deleted: stored.groupDeleted } } });
    } catch (error) { return failure(error, c); }
  });
  return app;
}
