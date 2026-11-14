import { Hono } from "hono";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { serviceConfiguration, type DatabaseOptions } from "./database";

export type WebhookOptions = { signingSecret?: string; secretKey?: string };
export type WebhookFetcher = (url: string, init: RequestInit) => Promise<Response>;

class WebhookFailure extends Error {
  constructor(readonly status: 400 | 401 | 413 | 502 | 503 | 504, message: string) { super(message); }
}
const subject = /^user_[A-Za-z0-9]+$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const maxBody = 65_536;

async function json(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<unknown> {
  const reader = stream?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Body exceeds limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Clerk delivers identity events here. Only `user.deleted` writes anything, the signature is
// the only authority, and every missing input fails closed instead of partially applying.
export function webhookRoutes(options: WebhookOptions, fetcher: WebhookFetcher, database: DatabaseOptions) {
  const app = new Hono();
  app.post("/clerk", async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      const declared = c.req.header("content-length");
      if (declared !== undefined && (!/^\d{1,7}$/.test(declared) || Number(declared) > maxBody)) {
        throw new WebhookFailure(413, "Webhook body is too large.");
      }
      if (!options.signingSecret) throw new WebhookFailure(503, "Webhook verification is not configured.");
      let event: { type?: unknown; data?: { id?: unknown } };
      try {
        event = await verifyWebhook(c.req.raw, { signingSecret: options.signingSecret }) as typeof event;
      } catch {
        // Missing headers and a wrong secret are the same refusal: the caller is not Clerk.
        throw new WebhookFailure(401, "Invalid webhook signature.");
      }
      if (event.type !== "user.deleted") return c.json({ ignored: true });
      const id = event.data?.id;
      if (typeof id !== "string" || !subject.test(id)) throw new WebhookFailure(400, "Invalid webhook payload.");
      let config: ReturnType<typeof serviceConfiguration>;
      try { config = serviceConfiguration(database, options.secretKey); }
      catch { throw new WebhookFailure(503, "Account service is not configured."); }
      const response = await fetcher(new URL("/rest/v1/rpc/delete_account_for", config.url).href, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}`,
          Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ p_sub: id }),
      });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => {});
        throw new WebhookFailure(503, "Account service is not configured.");
      }
      const value = await json(response.body, 4096);
      if (response.status !== 200 || !value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      const stored = value as { deleted?: unknown; groupId?: unknown; groupDeleted?: unknown; transferredTo?: unknown };
      const groupId = typeof stored.groupId === "string" && uuid.test(stored.groupId) ? stored.groupId : null;
      if (typeof stored.deleted !== "boolean" || typeof stored.groupDeleted !== "boolean" ||
        (stored.groupId !== null && groupId === null) || (groupId === null && stored.groupDeleted) ||
        (stored.deleted === false && groupId !== null) ||
        (stored.transferredTo !== null &&
          (typeof stored.transferredTo !== "string" || !subject.test(stored.transferredTo)))) throw new Error();
      return c.json({ received: true });
    } catch (error) {
      const fault = error instanceof WebhookFailure ? error
        : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
          ? new WebhookFailure(504, "Account service timed out.")
          : new WebhookFailure(502, "Account service unavailable.");
      return c.json({ error: fault.message }, fault.status);
    }
  });
  return app;
}
