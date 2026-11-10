import { Hono } from "hono";
import { databaseConfiguration, type DatabaseOptions } from "./database";
import { requireIdentity, type IdentityEnv, type IdentityOptions } from "./identity";

export type ProfileFetcher = (url: string, init: RequestInit) => Promise<Response>;
class ProfileFailure extends Error {
  constructor(readonly status: 400 | 401 | 404 | 409 | 502 | 503 | 504, message: string) { super(message); }
}
const validUsername = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 3 && value.length <= 20 && !/[^A-Za-z0-9_]/.test(value);

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
      const url = new URL("/rest/v1/profiles", config.url);
      url.searchParams.set("select", "username,username_changed_at");
      url.searchParams.set("user_id", "eq." + c.get("identity").id);
      const response = await fetcher(url.href, {
        method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { apikey: config.key, Authorization: c.req.header("Authorization")!.replace(/^Bearer +/i, "Bearer "),
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
        if (response.status === 409 && fault.code === "23505") throw new ProfileFailure(409, "Profile or username already exists.");
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
    } catch (error) {
      const failure = error instanceof ProfileFailure ? error
        : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
          ? new ProfileFailure(504, "Profile service timed out.") : new ProfileFailure(502, "Profile service unavailable.");
      if (failure.status === 401) c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: failure.message }, failure.status);
    }
  });
  return app;
}
