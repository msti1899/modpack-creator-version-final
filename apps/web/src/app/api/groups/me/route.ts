import { auth } from "@clerk/nextjs/server";
import { hasClerkConfiguration } from "../../../../lib/auth-config";
import { GROUP_ERROR_SENTENCES, parseGroupRead } from "../../../../lib/groups";

export const dynamic = "force-dynamic";

const MAX_RESPONSE_BYTES = 256 * 1024;

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });

/**
 * Resolve the API base the way `/api/me` does: an absolute origin only, HTTPS
 * except on loopback, and no credentials, path, query or fragment in the base.
 */
function groupsUrl(base: string): string {
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
  return new URL("/groups/me", url).href;
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

export async function GET() {
  if (!hasClerkConfiguration()) {
    return json({ error: GROUP_ERROR_SENTENCES.unconfigured }, 503);
  }

  let url: string;
  try {
    url = groupsUrl(process.env.API_URL ?? "http://127.0.0.1:3001");
  } catch {
    return json({ error: "The API address is not configured." }, 502);
  }

  const session = await auth();
  const token = session.isAuthenticated ? await session.getToken() : null;
  if (!token) return json({ error: GROUP_ERROR_SENTENCES.signedOut }, 401);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });

    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      const status = [401, 503, 504].includes(response.status) ? response.status : 502;
      return json({ error: sentenceFor(status) }, status);
    }

    // The read embeds members and requests the shell never renders, so the
    // handler rejects anything that is not the documented shape and reduces it
    // before the frame can see a byte of it.
    const read = parseGroupRead(await readJson(response, MAX_RESPONSE_BYTES));
    if (!read) return json({ error: GROUP_ERROR_SENTENCES.unavailable }, 502);
    return json(read, 200);
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return json({ error: sentenceFor(timeout ? 504 : 502) }, timeout ? 504 : 502);
  }
}

function sentenceFor(status: number): string {
  if (status === 401) return GROUP_ERROR_SENTENCES.signedOut;
  if (status === 503) return GROUP_ERROR_SENTENCES.unconfigured;
  if (status === 504) return GROUP_ERROR_SENTENCES.timeout;
  return GROUP_ERROR_SENTENCES.unavailable;
}
