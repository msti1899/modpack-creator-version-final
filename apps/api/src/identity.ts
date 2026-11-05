import { verifyToken } from "@clerk/backend";
import { TokenVerificationError } from "@clerk/backend/errors";
import { createPublicKey } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export type UserIdentity = { id: string; email: string | null };
export type IdentityEnv = { Variables: { identity: UserIdentity } };
export type IdentityOptions = {
  jwtKey?: string;
  issuer?: string;
  authorizedParties?: string[];
};

class IdentityFailure extends Error {
  constructor(readonly status: 401 | 502 | 503, message: string) { super(message); }
}
const unauthorized = () => new IdentityFailure(401, "Authentication required.");

function origin(value: string, allowLocal: boolean): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:")) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
  return url.origin;
}

function configuration(options: IdentityOptions) {
  try {
    const jwtKey = (options.jwtKey ?? "").replace(/\\n/g, "\n");
    if (!jwtKey.startsWith("-----BEGIN PUBLIC KEY-----") || createPublicKey(jwtKey).asymmetricKeyType !== "rsa") throw new Error();
    const issuer = origin(options.issuer ?? "", false);
    if (!options.authorizedParties?.length) throw new Error();
    const authorizedParties = options.authorizedParties.map((value) => origin(value, true));
    return { jwtKey, issuer, authorizedParties };
  } catch {
    throw new IdentityFailure(503, "Authentication is not configured.");
  }
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
      // A pinned public key avoids network lookups and never grants Backend API access.
      const data = await verifyToken(token, {
        jwtKey: config.jwtKey, authorizedParties: config.authorizedParties, clockSkewInMs: 0,
      });
      if (data.iss !== config.issuer ||
        typeof data.sub !== "string" || !/^user_[A-Za-z0-9]+$/.test(data.sub) ||
        typeof data.sid !== "string" || !/^sess_[A-Za-z0-9]+$/.test(data.sid) || data.sts === "pending") throw unauthorized();
      identity = { id: data.sub, email: typeof data.email === "string" ? data.email : null };
    } catch (error) {
      const failure = error instanceof IdentityFailure ? error : error instanceof TokenVerificationError ? unauthorized()
        : new IdentityFailure(502, "Authentication service unavailable.");
      if (failure.status === 401) c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: failure.message }, failure.status);
    }
    c.set("identity", identity);
    await next();
  };
}
