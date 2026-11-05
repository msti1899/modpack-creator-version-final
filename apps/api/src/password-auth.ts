import { Hono } from "hono";
import { authenticationConfiguration, type IdentityOptions, type UserIdentity } from "./identity";

class PasswordFailure extends Error {
  constructor(readonly status: 400 | 401 | 429 | 502 | 503 | 504, message: string) { super(message); }
}

async function jsonBody(body: ReadableStream<Uint8Array> | null, limit: number): Promise<unknown> {
  const reader = body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error(); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function userRecord(value: unknown): UserIdentity {
  if (!record(value) || typeof value.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.id) ||
    (value.email !== null && typeof value.email !== "string")) throw new Error();
  return { id: value.id, email: value.email };
}
const token = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 8192 && !/\s/.test(value);

export function passwordRoutes(options: IdentityOptions) {
  const app = new Hono();
  app.on("POST", ["/register", "/login"], async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      const register = c.req.path.endsWith("/register");
      let config: ReturnType<typeof authenticationConfiguration>;
      try { config = authenticationConfiguration(options); }
      catch { throw new PasswordFailure(503, "Authentication is not configured."); }
      let input: unknown;
      try { input = await jsonBody(c.req.raw.body, 2048); }
      catch { throw new PasswordFailure(400, "Invalid or oversized JSON body."); }
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 2 ||
        !("email" in input) || typeof input.email !== "string" || input.email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(input.email) ||
        !("password" in input) || typeof input.password !== "string" || !input.password.length || input.password.length > 1024) {
        throw new PasswordFailure(400, "Expected only a valid email and password.");
      }
      const url = new URL(register ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password", config.url);
      const response = await (options.fetcher ?? fetch)(url.href, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { apikey: config.key, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: input.email, password: input.password }),
      });
      if (response.status === 429) {
        await response.body?.cancel().catch(() => {});
        throw new PasswordFailure(429, "Too many authentication requests.");
      }
      const value = await jsonBody(response.body, 65_536);
      if (!record(value)) throw new Error();
      if ([400, 422].includes(response.status)) {
        if (register && ["user_already_exists", "email_exists"].includes(String(value.error_code ?? value.code))) return c.json({ user: null, session: null }, 202);
        throw new PasswordFailure(register ? 400 : 401, register ? "Unable to register with these credentials." : "Invalid email or password.");
      }
      if (response.status !== 200) throw new Error();
      const user = userRecord(value.user ?? value);
      // Confirmation-enabled signup returns a user, not an active session.
      if (register && !("access_token" in value) && !("refresh_token" in value)) return c.json({ user: null, session: null }, 202);
      if (!token(value.access_token) || !token(value.refresh_token) || value.token_type !== "bearer" ||
        typeof value.expires_in !== "number" || !Number.isInteger(value.expires_in) || value.expires_in <= 0) throw new Error();
      return c.json({ user, session: {
        accessToken: value.access_token, refreshToken: value.refresh_token,
        expiresIn: value.expires_in, tokenType: "bearer",
      } }, register ? 201 : 200);
    } catch (error) {
      const failure = error instanceof PasswordFailure ? error
        : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
          ? new PasswordFailure(504, "Authentication service timed out.") : new PasswordFailure(502, "Authentication service unavailable.");
      return c.json({ error: failure.message }, failure.status);
    }
  });
  return app;
}
