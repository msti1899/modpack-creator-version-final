import { Hono } from "hono";
import { databaseConfiguration, type DatabaseOptions } from "./database";
import { requireIdentity, type IdentityEnv, type IdentityOptions } from "./identity";
import type { ProfileFetcher } from "./profiles";

type Status = 400 | 401 | 403 | 404 | 409 | 502 | 503 | 504;
class GroupFailure extends Error {
  constructor(readonly status: Status, message: string) { super(message); }
}
const errors: Record<string, Status> = {
  "Authentication required.": 401, "Profile required.": 409,
  "Invalid group name.": 400, "Invalid group visibility.": 400,
  "Already in a group.": 409, "Group not found.": 404, "Group is not public.": 403,
  "Only the owner can perform this action.": 403, "Invitations require a private group.": 409,
  "Invitation is invalid.": 404, "Request not found.": 404,
  "Target user is already in a group.": 409, "Target user is not a member.": 409,
  "Membership required.": 409,
  "Transfers are required before leaving a group with other members.": 409,
  "Invalid page cursor.": 400,
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const subject = (value: unknown): value is string => typeof value === "string" && /^user_[A-Za-z0-9]+$/.test(value);
const token = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const pageCursor = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value === "string" && /^\d{1,16}\.user_[A-Za-z0-9]+$/.test(value)) return value;
  throw new Error();
};
// Keep this normalization identical to the SQL constraint and create_group:
// Unicode whitespace is trimmed, U+FEFF and controls are rejected.
function groupName(value: unknown): string | null {
  if (typeof value !== "string" || value.includes("\uFEFF")) return null;
  const trimmed = value.replace(/^\s+|\s+$/g, "");
  const length = Array.from(trimmed).length;
  if (length < 1 || length > 60 || /[\x00-\x1f\x7f-\x9f]/.test(trimmed)) return null;
  return trimmed;
}

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

function invitation(value: unknown) {
  if (!object(value) || !token(value.token) || !timestamp(value.createdAt)) throw new Error();
  return { token: value.token, createdAt: value.createdAt };
}
function member(value: unknown, ownerId?: string) {
  if (!object(value) || !subject(value.userId) || typeof value.username !== "string" ||
    !/^[A-Za-z0-9_]{3,20}$/.test(value.username) || !timestamp(value.joinedAt) ||
    !["owner", "member"].includes(String(value.role)) ||
    (ownerId !== undefined && value.role !== (value.userId === ownerId ? "owner" : "member"))) throw new Error();
  return { userId: value.userId, username: value.username, role: value.role, joinedAt: value.joinedAt };
}
function requestItem(value: unknown) {
  if (!object(value) || !subject(value.userId) || typeof value.username !== "string" ||
    !/^[A-Za-z0-9_]{3,20}$/.test(value.username) || !timestamp(value.createdAt)) throw new Error();
  return { userId: value.userId, username: value.username, createdAt: value.createdAt };
}
function group(value: unknown, caller: string): Record<string, unknown> | null {
  if (value === null) return null;
  if (!object(value)) throw new Error();
  const storedName = groupName(value.name);
  const ownerId = value.ownerId;
  if (!uuid(value.id) || storedName !== value.name || !subject(ownerId) ||
    !["public", "private"].includes(String(value.visibility)) || !timestamp(value.createdAt) ||
    !Number.isSafeInteger(value.memberCount) || (value.memberCount as number) < 1 ||
    !Array.isArray(value.members) || value.members.length > 50 ||
    value.role !== (ownerId === caller ? "owner" : "member")) throw new Error();
  const members = value.members.map((item: unknown) => member(item, ownerId));
  if (!members.some((item) => item.userId === caller) || !members.some((item) => item.userId === ownerId)) throw new Error();
  let requests: Record<string, unknown>[] | null = null;
  let requestsNextCursor: string | null = null;
  if (value.role === "owner") {
    if (!Array.isArray(value.requests) || value.requests.length > 50) throw new Error();
    requests = value.requests.map(requestItem);
    requestsNextCursor = pageCursor(value.requestsNextCursor);
  }
  return { id: value.id, name: storedName, visibility: value.visibility, ownerId,
    role: value.role, createdAt: value.createdAt, memberCount: value.memberCount,
    members, membersNextCursor: pageCursor(value.membersNextCursor),
    requests, requestsNextCursor,
    invitation: value.role === "owner" && value.visibility === "private" && value.invitation !== null ? invitation(value.invitation) : null };
}
/** The link-only join screen gets identity and counts, never a member list. */
function summary(value: unknown) {
  if (value === null) return null;
  if (!object(value)) throw new Error();
  const storedName = groupName(value.name);
  const ownerUsername = value.ownerUsername;
  const membership = value.membership;
  if (!uuid(value.id) || storedName === null || storedName !== value.name ||
    !["public", "private"].includes(String(value.visibility)) ||
    typeof ownerUsername !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(ownerUsername) ||
    !Number.isSafeInteger(value.memberCount) || (value.memberCount as number) < 1 ||
    (membership !== null && membership !== "member" && membership !== "requested")) throw new Error();
  return { id: value.id, name: storedName, visibility: value.visibility,
    ownerUsername, memberCount: value.memberCount, membership };
}
function membersPage(value: unknown) {
  if (!object(value) || !Array.isArray(value.members) || value.members.length > 100) throw new Error();
  return { members: value.members.map((item: unknown) => member(item)), nextCursor: pageCursor(value.nextCursor) };
}
function requestsPage(value: unknown) {
  if (!object(value) || !Array.isArray(value.requests) || value.requests.length > 100) throw new Error();
  return { requests: value.requests.map(requestItem), nextCursor: pageCursor(value.nextCursor) };
}

export function groupRoutes(options: IdentityOptions, fetcher: ProfileFetcher, database: DatabaseOptions) {
  const app = new Hono<IdentityEnv>();
  app.post("/", requireIdentity(options), async (c) => {
    try {
      if (c.get("databaseRole") !== "authenticated") throw new GroupFailure(401, "Authentication required.");
      let input: unknown;
      try { input = await json(c.req.raw.body, 1024); }
      catch { throw new GroupFailure(400, "Invalid or oversized JSON body."); }
      const normalized = object(input) ? groupName(input.name) : null;
      if (!object(input) || Object.keys(input).length !== 2 || normalized === null ||
        typeof input.visibility !== "string" || !["public", "private"].includes(input.visibility)) {
        throw new GroupFailure(400, "Expected only name (1-60 characters) and visibility (public or private).");
      }
      const result = await rpc("create_group", { p_name: normalized, p_visibility: input.visibility }, c.req.header("Authorization")!);
      const resultGroup = group(result, c.get("identity").id);
      if (resultGroup === null) throw new Error();
      return c.json({ group: resultGroup }, 201);
    } catch (error) { return failure(error, c); }
  });

  async function rpc(operation: string, args: Record<string, unknown>, authorization: string): Promise<unknown> {
    let config: ReturnType<typeof databaseConfiguration>;
    try { config = databaseConfiguration(database); }
    catch { throw new GroupFailure(503, "Group service is not configured."); }
    const response = await fetcher(new URL(`/rest/v1/rpc/${operation}`, config.url).href, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { apikey: config.key, Authorization: authorization.replace(/^Bearer +/i, "Bearer "),
        Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(args),
    });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      throw new GroupFailure(401, "Authentication required.");
    }
    const result = await json(response.body, 262144);
    if (response.status !== 200) {
      if (object(result) && result.code === "P0001" && typeof result.message === "string" && Object.hasOwn(errors, result.message)) {
        throw new GroupFailure(errors[result.message]!, result.message);
      }
      if (object(result) && result.code === "23505" && response.status === 409) throw new GroupFailure(409, "Group operation conflicts with current state.");
      throw new Error();
    }
    return result;
  }
  function failure(error: unknown, c: import("hono").Context<IdentityEnv>) {
    const fault = error instanceof GroupFailure ? error : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
      ? new GroupFailure(504, "Group service timed out.") : new GroupFailure(502, "Group service unavailable.");
    if (fault.status === 401) c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: fault.message }, fault.status);
  }

  function endpoint(method: "GET" | "POST" | "DELETE", path: string, operation: string,
    kind: "group" | "invitation" | "request" | "leave" | "revoke" | "resolve" | "reject" | "summary",
    parameter?: "groupId" | "token" | "userId", status: 200 | 201 = 200) {
    app.on(method, path, requireIdentity(options), async (c) => {
      try {
        if (c.get("databaseRole") !== "authenticated") throw new GroupFailure(401, "Authentication required.");
        const args: Record<string, unknown> = {};
        if (parameter) {
          const value = c.req.param(parameter);
          const valid = parameter === "groupId" ? uuid(value) : parameter === "token" ? token(value) : subject(value);
          if (!valid) throw new GroupFailure(400, "Invalid group request.");
          args[parameter === "groupId" ? "p_group_id" : parameter === "token" ? "p_token" : "p_user_id"] = value;
        }
        if (method !== "GET" && (c.req.raw.body !== null || operation === "transfer_ownership")) {
          let input: unknown;
          try { input = await json(c.req.raw.body, 1024); }
          catch { throw new GroupFailure(400, "Invalid or oversized JSON body."); }
          if (!object(input) || Object.keys(input).length !== (operation === "transfer_ownership" ? 1 : 0) ||
            (operation === "transfer_ownership" && !subject(input.userId))) throw new GroupFailure(400, "Invalid group request.");
          if (operation === "transfer_ownership") args.p_user_id = input.userId;
        }
        const value = await rpc(operation, args, c.req.header("Authorization")!);
        if (kind === "group") {
          const resultGroup = group(value, c.get("identity").id);
          if (value === null && operation !== "my_group") throw new Error();
          return c.json({ group: resultGroup }, status);
        }
        if (kind === "summary") {
          if (value === null) throw new GroupFailure(404, "Group not found.");
          return c.json({ group: summary(value) });
        }
        if (kind === "invitation") return c.json({ invitation: invitation(value) }, status);
        if (!object(value)) throw new Error();
        if (kind === "revoke") {
          if (value.invitation !== null) throw new Error();
          return c.json({ invitation: null });
        }
        if (kind === "leave") {
          if (!uuid(value.groupId) || typeof value.groupDeleted !== "boolean") throw new Error();
          return c.json({ groupId: value.groupId, groupDeleted: value.groupDeleted });
        }
        if (kind === "reject") {
          if (!subject(value.userId) || value.status !== "rejected" || value.userId !== args.p_user_id) throw new Error();
          return c.json({ request: { userId: value.userId, status: value.status } });
        }
        if (!uuid(value.groupId)) throw new Error();
        if (kind === "request") {
          if (value.status !== "pending" || !timestamp(value.createdAt)) throw new Error();
          return c.json({ request: { groupId: value.groupId, status: value.status, createdAt: value.createdAt } }, status);
        }
        const resolvedName = groupName(value.name);
        if (resolvedName === null || typeof value.ownerUsername !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(value.ownerUsername) ||
          typeof value.requested !== "boolean" || typeof value.member !== "boolean") throw new Error();
        return c.json({ invitation: { groupId: value.groupId, name: resolvedName, ownerUsername: value.ownerUsername,
          requested: value.requested, member: value.member } });
      } catch (error) { return failure(error, c); }
    });
  }
  endpoint("GET", "/me", "my_group", "group");
  endpoint("GET", "/:groupId/summary", "group_summary", "summary", "groupId");
  endpoint("POST", "/:groupId/join", "join_public_group", "group", "groupId");
  endpoint("POST", "/me/invitation", "create_invitation", "invitation", undefined, 201);
  endpoint("DELETE", "/me/invitation", "revoke_invitation", "revoke");
  endpoint("GET", "/invitations/:token", "resolve_invitation", "resolve", "token");
  endpoint("POST", "/invitations/:token/requests", "request_join", "request", "token", 201);
  endpoint("POST", "/me/requests/:userId/approve", "approve_join_request", "group", "userId");
  endpoint("POST", "/me/requests/:userId/reject", "reject_join_request", "reject", "userId");
  endpoint("POST", "/me/ownership", "transfer_ownership", "group");
  endpoint("DELETE", "/me/membership", "leave_group", "leave");

  function pageEndpoint(path: string, operation: string, kind: "members" | "requests") {
    app.get(path, requireIdentity(options), async (c) => {
      try {
        if (c.get("databaseRole") !== "authenticated") throw new GroupFailure(401, "Authentication required.");
        const query = c.req.query();
        for (const key of Object.keys(query)) {
          if (key !== "limit" && key !== "cursor") throw new GroupFailure(400, "Invalid page request.");
        }
        const rawLimit = query.limit;
        const limit = rawLimit === undefined ? 50 : (/^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : NaN);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new GroupFailure(400, "Invalid page request.");
        const cursor = query.cursor;
        if (cursor !== undefined && !/^\d{1,16}\.user_[A-Za-z0-9]+$/.test(cursor)) throw new GroupFailure(400, "Invalid page request.");
        const value = await rpc(operation, { p_limit: limit, p_cursor: cursor ?? null }, c.req.header("Authorization")!);
        return c.json(kind === "members" ? membersPage(value) : requestsPage(value));
      } catch (error) { return failure(error, c); }
    });
  }
  pageEndpoint("/me/members", "group_members_page", "members");
  pageEndpoint("/me/requests", "group_requests_page", "requests");
  return app;
}
