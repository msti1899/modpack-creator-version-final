export type DatabaseOptions = { url?: string; publishableKey?: string };

export function databaseConfiguration(options: DatabaseOptions): { url: string; key: string } {
  const url = new URL(options.url ?? "");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
  const key = options.publishableKey ?? "";
  if (!key || key.length > 4096) throw new Error();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    // Configuration guard only: an API key never authenticates the caller.
    const parts = key.split(".");
    if (parts.length !== 3 || JSON.parse(Buffer.from(parts[1], "base64url").toString()).role !== "anon") throw new Error();
  }
  return { url: url.origin, key };
}
