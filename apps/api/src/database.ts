export type DatabaseOptions = { url?: string; publishableKey?: string };

export function databaseUrl(options: DatabaseOptions): string {
  const url = new URL(options.url ?? "");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
  return url.origin;
}

export function databaseConfiguration(options: DatabaseOptions): { url: string; key: string } {
  const url = databaseUrl(options);
  const key = options.publishableKey ?? "";
  if (!key || key.length > 4096) throw new Error();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    // Configuration guard only: an API key never authenticates the caller.
    const parts = key.split(".");
    if (parts.length !== 3 || JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString()).role !== "anon") throw new Error();
  }
  return { url, key };
}

// The provider-reconciliation write runs without a user session, so it needs the secret
// key. It is never accepted by a session-authenticated route. A legacy service-role JWT is
// decoded only to reject a token that carries another role.
export function serviceConfiguration(options: DatabaseOptions, secretKey?: string): { url: string; key: string } {
  const url = databaseUrl(options);
  const key = secretKey ?? "";
  if (!key || key.length > 4096) throw new Error();
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
    const parts = key.split(".");
    if (parts.length !== 3) throw new Error();
    const payload: unknown = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString());
    if (!payload || typeof payload !== "object" || (payload as { role?: unknown }).role !== "service_role") throw new Error();
  }
  return { url, key };
}
