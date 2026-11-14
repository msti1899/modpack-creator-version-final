import { Hono, type Context } from "hono";
import { databaseConfiguration, type DatabaseOptions } from "./database";
import { requireIdentity, type IdentityEnv, type IdentityOptions } from "./identity";
import { PackError, settings, validateVoteAddition, type Fetcher, type VoteProposal } from "./modrinth";
import type { ProfileFetcher } from "./profiles";

type Status = 400 | 401 | 403 | 404 | 409 | 502 | 503 | 504;
class VoteFailure extends Error {
  constructor(readonly status: Status, message: string) { super(message); }
}
const errors: Record<string, Status> = {
  "Authentication required.": 401, "Group required.": 404, "Vote not found.": 404,
  "Only the group owner may start votes.": 403, "Only the group owner may cancel votes.": 403,
  "Only the group owner may incorporate votes.": 403, "Only the fixed electorate may vote.": 403,
  "Invalid vote settings.": 400, "Invalid vote selection.": 400, "Invalid vote proposal.": 400,
  "Invalid vote duration.": 400, "Invalid vote revision.": 400, "Invalid vote value.": 400,
  "Invalid vote cursor.": 400,
  "Draft revision conflict.": 409, "Vote does not match the draft settings.": 409,
  "A proposed version is already in the draft.": 409, "This vote is already closed.": 409,
  "Vote is not approved.": 409, "Vote is already incorporated.": 409,
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const identifier = /^[A-Za-z0-9_-]{1,100}$/;
const statuses = ["open", "approved", "rejected", "cancelled"];
const ballots = ["approve", "reject"];
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

async function json(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<unknown> {
  if (!stream) throw new Error();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const text = (value: unknown, min: number, max: number) => {
  if (typeof value !== "string" || value.length < min || value.length > max) throw new Error();
  return value;
};

function proposal(value: unknown): VoteProposal[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error();
  return value.map((item) => {
    if (!object(item) || typeof item.versionId !== "string" || !identifier.test(item.versionId) ||
      typeof item.projectId !== "string" || !identifier.test(item.projectId)) throw new Error();
    return { versionId: item.versionId, projectId: item.projectId,
      projectTitle: text(item.projectTitle, 1, 300), versionNumber: text(item.versionNumber, 1, 100) };
  });
}

function vote(value: unknown) {
  if (!object(value) || typeof value.id !== "string" || !uuid.test(value.id) ||
    typeof value.groupId !== "string" || !uuid.test(value.groupId)) throw new Error();
  const items = proposal(value.proposal);
  const config = settings({ gameVersion: value.gameVersion, loader: value.loader,
    versionIds: items.map((item) => item.versionId) });
  if (config.versionIds.length !== items.length) throw new Error();
  if (typeof value.status !== "string" || !statuses.includes(value.status)) throw new Error();
  if (!integer(value.durationHours, 1, 720) || !integer(value.electorateSize, 1, 100000) ||
    !integer(value.approveCount, 0, 100000) || !integer(value.rejectCount, 0, 100000)) throw new Error();
  if (value.myBallot !== null && (typeof value.myBallot !== "string" || !ballots.includes(value.myBallot))) throw new Error();
  const date = (raw: unknown) => {
    if (typeof raw !== "string" || !Number.isFinite(Date.parse(raw))) throw new Error();
    return raw;
  };
  return { id: value.id, groupId: value.groupId, gameVersion: config.gameVersion, loader: config.loader,
    proposal: items, durationHours: value.durationHours, electorateSize: value.electorateSize,
    status: value.status, createdAt: date(value.createdAt), closesAt: date(value.closesAt),
    resolvedAt: value.resolvedAt === null ? null : date(value.resolvedAt),
    incorporatedAt: value.incorporatedAt === null ? null : date(value.incorporatedAt),
    approveCount: value.approveCount, rejectCount: value.rejectCount, myBallot: value.myBallot as string | null };
}

function draftSnapshot(value: unknown) {
  if (!object(value) || !integer(value.revision, 1, 2147483647)) throw new Error();
  const config = settings(value);
  if (config.versionIds.length !== (value.versionIds as unknown[]).length) throw new Error();
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error();
  return { ...config, revision: value.revision, updatedAt: value.updatedAt };
}

function context(value: unknown) {
  if (!object(value) || typeof value.groupId !== "string" || !uuid.test(value.groupId) ||
    (value.role !== "owner" && value.role !== "member")) throw new Error();
  return { groupId: value.groupId, role: value.role as "owner" | "member",
    draft: value.draft === null ? null : draftSnapshot(value.draft) };
}

function votesPage(value: unknown) {
  if (!object(value) || !Array.isArray(value.votes)) throw new Error();
  if (value.nextCursor !== null && typeof value.nextCursor !== "string") throw new Error();
  return { votes: value.votes.map(vote), nextCursor: value.nextCursor as string | null };
}

function ballotsPage(value: unknown) {
  if (!object(value) || !Array.isArray(value.ballots)) throw new Error();
  if (value.nextCursor !== null && typeof value.nextCursor !== "string") throw new Error();
  const rows = value.ballots.map((item) => {
    if (!object(item) || typeof item.userId !== "string" || !/^user_[A-Za-z0-9]+$/.test(item.userId)) throw new Error();
    if (item.ballot !== null && (typeof item.ballot !== "string" || !ballots.includes(item.ballot))) throw new Error();
    const timestamp = (raw: unknown) => {
      if (raw === null) return null;
      if (typeof raw !== "string" || !Number.isFinite(Date.parse(raw))) throw new Error();
      return raw;
    };
    return { userId: item.userId, username: item.username === null ? null : text(item.username, 3, 20),
      ballot: item.ballot as string | null, castAt: timestamp(item.castAt), updatedAt: timestamp(item.updatedAt) };
  });
  return { ballots: rows, nextCursor: value.nextCursor as string | null };
}

function incorporation(value: unknown) {
  if (!object(value) || value.draft === undefined) throw new Error();
  return { vote: vote(value.vote), draft: value.draft === null ? null : draftSnapshot(value.draft) };
}

export function voteRoutes(identity: IdentityOptions, fetcher: Fetcher, dataFetcher: ProfileFetcher, database: DatabaseOptions) {
  const app = new Hono<IdentityEnv>();
  app.use("*", requireIdentity(identity), async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.get("databaseRole") !== "authenticated") return c.json({ error: "Authentication required." }, 401);
    await next();
  });

  async function rpc(c: Context<IdentityEnv>, name: string, args: Record<string, unknown>): Promise<unknown> {
    let config: ReturnType<typeof databaseConfiguration>;
    try { config = databaseConfiguration(database); }
    catch { throw new VoteFailure(503, "Vote service is not configured."); }
    const response = await dataFetcher(new URL(`/rest/v1/rpc/${name}`, config.url).href, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { apikey: config.key, Authorization: c.req.header("Authorization")!.replace(/^Bearer +/i, "Bearer "),
        Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(args),
    });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      throw new VoteFailure(401, "Authentication required.");
    }
    const value = await json(response.body, 262144);
    if (response.status !== 200) {
      if (object(value) && value.code === "P0001" && typeof value.message === "string" && Object.hasOwn(errors, value.message)) {
        throw new VoteFailure(errors[value.message]!, value.message);
      }
      throw new Error();
    }
    // Never expose arbitrary Data API fields or treat malformed upstream data as input errors.
    return value;
  }
  async function parsed<T>(operation: Promise<unknown>, read: (value: unknown) => T): Promise<T> {
    const value = await operation;
    try { return read(value); } catch { throw new VoteFailure(502, "Vote service unavailable."); }
  }
  async function body(c: Context<IdentityEnv>, keys: string[]) {
    let value: unknown;
    try { value = await json(c.req.raw.body, 16384); }
    catch { throw new VoteFailure(400, "Invalid or oversized JSON body."); }
    if (!object(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
      throw new VoteFailure(400, `Expected only ${keys.join(", ")}.`);
    }
    return value;
  }
  function voteId(c: Context<IdentityEnv>) {
    const value = c.req.param("voteId") ?? "";
    if (!uuid.test(value)) throw new VoteFailure(400, "Invalid vote id.");
    return value;
  }
  function page(c: Context<IdentityEnv>) {
    const query = new URL(c.req.url).searchParams;
    const cursor = query.get("cursor");
    if (cursor !== null && (cursor.length > 64)) throw new VoteFailure(400, "Invalid vote cursor.");
    const limit = query.get("limit");
    if (limit === null) return { cursor, size: null };
    if (!/^\d{1,3}$/.test(limit)) throw new VoteFailure(400, "Vote page size is invalid.");
    const size = Number(limit);
    if (size < 1 || size > 100) throw new VoteFailure(400, "Vote page size is invalid.");
    return { cursor, size };
  }

  app.get("/", async (c) => {
    const { cursor, size } = page(c);
    return c.json(await parsed(rpc(c, "my_group_votes", { p_cursor: cursor, p_limit: size }), votesPage));
  });
  app.post("/", async (c) => {
    const input = await body(c, ["gameVersion", "loader", "addVersionIds", "durationHours", "expectedDraftRevision"]);
    const config = settings({ gameVersion: input.gameVersion, loader: input.loader, versionIds: input.addVersionIds });
    if (!integer(input.durationHours, 1, 720)) throw new VoteFailure(400, "Invalid vote duration.");
    if (!integer(input.expectedDraftRevision, 0, 2147483646)) throw new VoteFailure(400, "Invalid vote revision.");
    const current = await parsed(rpc(c, "my_pack_draft", {}), context);
    if (current.role !== "owner") throw new VoteFailure(403, "Only the group owner may start votes.");
    // Reject a stale tab before paying catalog validation; the RPC arbitrates again under its lock.
    if ((current.draft === null ? 0 : current.draft.revision) !== input.expectedDraftRevision) {
      throw new VoteFailure(409, "Draft revision conflict.");
    }
    const addition = await validateVoteAddition(fetcher, current.draft, config);
    return c.json(await parsed(rpc(c, "open_group_vote", { p_group_id: current.groupId,
      p_game_version: addition.settings.gameVersion, p_loader: addition.settings.loader,
      p_addition: addition.settings.versionIds, p_proposal: addition.proposal,
      p_duration_hours: input.durationHours, p_expected_draft_revision: input.expectedDraftRevision }), vote));
  });
  app.get("/:voteId/ballots", async (c) => {
    const id = voteId(c);
    const { cursor, size } = page(c);
    return c.json(await parsed(rpc(c, "group_vote_ballots", { p_vote_id: id, p_cursor: cursor, p_limit: size }), ballotsPage));
  });
  app.post("/:voteId/ballots", async (c) => {
    const id = voteId(c);
    const input = await body(c, ["value"]);
    if (input.value !== "approve" && input.value !== "reject") throw new VoteFailure(400, "Invalid vote value.");
    return c.json(await parsed(rpc(c, "cast_group_vote", { p_vote_id: id, p_value: input.value }), vote));
  });
  app.post("/:voteId/cancel", async (c) => {
    const id = voteId(c);
    return c.json(await parsed(rpc(c, "cancel_group_vote", { p_vote_id: id }), vote));
  });
  app.post("/:voteId/incorporate", async (c) => {
    const id = voteId(c);
    const input = await body(c, ["expectedRevision"]);
    if (!integer(input.expectedRevision, 0, 2147483646)) throw new VoteFailure(400, "Invalid vote revision.");
    return c.json(await parsed(rpc(c, "incorporate_group_vote",
      { p_vote_id: id, p_expected_draft_revision: input.expectedRevision }), incorporation));
  });
  app.onError((error, c) => {
    const fault = error instanceof VoteFailure || error instanceof PackError ? error :
      ["TimeoutError", "AbortError"].includes(error.name) ? new VoteFailure(504, "Vote service timed out.") :
      new VoteFailure(502, "Vote service unavailable.");
    return c.json({ error: fault.message }, fault.status);
  });
  return app;
}
