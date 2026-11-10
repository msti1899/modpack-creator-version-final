import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { exportPack, PackError, resolve, search, type Fetcher } from "./modrinth";
import { profileRoutes, type ProfileFetcher } from "./profiles";
import type { DatabaseOptions } from "./database";
import { requireIdentity, type IdentityEnv, type IdentityOptions } from "./identity";

export function createApp(fetcher: Fetcher = fetch, identity: IdentityOptions = {
  jwtKey: process.env.CLERK_JWT_KEY,
  issuer: process.env.CLERK_ISSUER,
  authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(",").map((value) => value.trim()),
}, profileFetcher: ProfileFetcher = fetch, database: DatabaseOptions = {
  url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
}) {
  const app = new Hono<IdentityEnv>();
  app.get("/health", (c) => c.json({ status: "ok", service: "modpack-api" }));
  app.get("/me", requireIdentity(identity), (c) => c.json({ user: c.get("identity") }));
  app.route("/profile", profileRoutes(identity, profileFetcher, database));
  app.use("/packs/*", bodyLimit({ maxSize: 16_384, onError: (c) => c.json({ error: "Request body is too large." }, 400) }));
  app.get("/mods", async (c) => c.json(await search(fetcher, new URL(c.req.url).searchParams)));
  async function body(request: Request): Promise<Record<string, unknown>> {
    let value: unknown;
    try { value = await request.json(); } catch { throw new PackError("Invalid JSON body.", 400); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PackError("Expected a JSON object.", 400);
    return value as Record<string, unknown>;
  }
  app.post("/packs/resolve", async (c) => c.json(await resolve(fetcher, await body(c.req.raw))));
  app.post("/packs/export", async (c) => {
    const archive = await exportPack(fetcher, await body(c.req.raw));
    return new Response(new Uint8Array(archive.bytes).buffer, { headers: { "content-type": "application/x-modrinth-modpack+zip", "content-disposition": `attachment; filename="${archive.filename}"`, "cache-control": "no-store" } });
  });
  app.onError((error, c) => {
    if (error instanceof PackError) return c.json({ error: error.message }, error.status);
    return c.json({ error: "Could not process the Modrinth request." }, 502);
  });
  return app;
}

export default createApp();
