import type { MiddlewareHandler } from "hono";

export type UserIdentity = { id: string; email: string | null };
export type IdentityEnv = { Variables: { identity: UserIdentity } };
export type IdentityOptions = {
  url?: string;
  publishableKey?: string;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
};
type FailureStatus = 401 | 502 | 503 | 504;
class IdentityFailure extends Error {
  constructor(readonly status: FailureStatus, message: string) { super(message); }
}
const unauthorized = () => new IdentityFailure(401, "Authentication required.");

function configuration(options: IdentityOptions): { url: string; key: string } {
  try {
    const url = new URL(options.url ?? "");
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    const key = options.publishableKey ?? "";
    if (key.length > 4096 || !key) throw new Error();
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      // Configuration guard only: decoding an API key never authenticates a user.
      const parts = key.split(".");
      if (parts.length !== 3 || JSON.parse(Buffer.from(parts[1], "base64url").toString()).role !== "anon") throw new Error();
    }
    return { url: new URL("/auth/v1/user", url).href, key };
  } catch {
    throw new IdentityFailure(503, "Authentication is not configured.");
  }
}

async function userRecord(response: Response): Promise<UserIdentity> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing Auth response body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65_536) {
      await reader.cancel();
      throw new Error("Auth response exceeds limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Auth response");
  const { id, email } = value as Record<string, unknown>;
  if (typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
    (email !== undefined && email !== null && typeof email !== "string")) throw new Error("Invalid Auth identity");
  return { id, email: typeof email === "string" ? email : null };
}

export function requireIdentity(options: IdentityOptions): MiddlewareHandler<IdentityEnv> {
  return async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Vary", "Authorization");
    let identity: UserIdentity;
    try {
      const authorization = c.req.header("Authorization") ?? "";
      const token = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(authorization)?.[1];
      if (!token || token.length > 8192) throw unauthorized();
      const config = configuration(options);
      const response = await (options.fetcher ?? fetch)(config.url, {
        headers: { apikey: config.key, Authorization: `Bearer ${token}`, Accept: "application/json" },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        if ([400, 401, 403].includes(response.status)) throw unauthorized();
        throw new IdentityFailure(502, "Authentication service unavailable.");
      }
      identity = await userRecord(response);
    } catch (error) {
      const failure = error instanceof IdentityFailure ? error
        : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
          ? new IdentityFailure(504, "Authentication service timed out.")
          : new IdentityFailure(502, "Authentication service unavailable.");
      if (failure.status === 401) c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: failure.message }, failure.status);
    }
    c.set("identity", identity);
    await next();
  };
}
