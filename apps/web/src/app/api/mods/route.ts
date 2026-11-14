import {
  buildModSearch,
  parseModPage,
  serializeModSearch,
  type ModSearch,
} from "../../../lib/mods";

export const dynamic = "force-dynamic";

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_ERROR_BYTES = 4 * 1024;

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Resolve the API base the way `/api/me` does: an absolute origin only, HTTPS
 * except on loopback, and no credentials, path, query or fragment in the base.
 */
function catalogUrl(base: string, search: ModSearch): string {
  const url = new URL(base);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error();
  }
  return new URL(`/mods?${serializeModSearch(search)}`, url).href;
}

/** Read a response body with a hard byte cap so a hostile payload cannot stream forever. */
async function readJson(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function errorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { error } = value as Record<string, unknown>;
  return typeof error === "string" && error.length <= 300 ? error : null;
}

export async function GET(request: Request) {
  const parsed = buildModSearch(new URL(request.url).searchParams);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  let url: string;
  try {
    url = catalogUrl(process.env.API_URL ?? "http://127.0.0.1:3001", parsed.search);
  } catch {
    return json({ error: "The API address is not configured." }, 502);
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });

    // A rejected search is the caller's problem: pass the reason through untouched.
    if (response.status === 400) {
      let message = "The catalog rejected the search.";
      try {
        message = errorMessage(await readJson(response, MAX_ERROR_BYTES)) ?? message;
      } catch {
        // The upstream body was unreadable; the typed validation already passed.
      }
      return json({ error: message }, 400);
    }

    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      return json({ error: "Could not search the mod catalog." }, response.status === 504 ? 504 : 502);
    }

    const page = parseModPage(await readJson(response, MAX_RESPONSE_BYTES));
    if (!page) return json({ error: "The catalog returned an invalid search response." }, 502);
    return json(page, 200);
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return json({ error: "Could not search the mod catalog." }, timeout ? 504 : 502);
  }
}
