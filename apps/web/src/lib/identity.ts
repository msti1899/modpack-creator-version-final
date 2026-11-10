type IdentityProxyOptions = {
  enabled: boolean;
  apiUrl: string;
  getToken: () => Promise<string | null>;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
};

function endpoint(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
  return new URL("/me", url).href;
}

async function identity(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); throw new Error(); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const { user } = JSON.parse(new TextDecoder().decode(bytes));
  if (!user || typeof user.id !== "string" || !/^user_[A-Za-z0-9]+$/.test(user.id) ||
    (user.email !== null && typeof user.email !== "string")) throw new Error();
  return { user: { id: user.id as string, email: user.email as string | null } };
}

export function createIdentityProxy(options: IdentityProxyOptions) {
  const json = (body: unknown, status: number) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store", Vary: "Cookie" },
  });
  return async () => {
    let url: string;
    try {
      if (!options.enabled) throw new Error();
      url = endpoint(options.apiUrl);
    } catch {
      return json({ error: "Authentication is not configured." }, 503);
    }
    try {
      const token = await options.getToken();
      if (!token) return json({ error: "Authentication required." }, 401);
      const response = await (options.fetcher ?? fetch)(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        const status = [401, 503, 504].includes(response.status) ? response.status : 502;
        return json({ error: status === 401 ? "Authentication required." : "Could not verify API identity." }, status);
      }
      return json(await identity(response), 200);
    } catch (error) {
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      return json({ error: "Could not verify API identity." }, timeout ? 504 : 502);
    }
  };
}
