import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const bearer = clerkToken();
const database = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const groupId = "11111111-1111-4111-8111-111111111111";
const voteId = "22222222-2222-4222-8222-222222222222";
const path = `/groups/me/votes`;
const selection = { gameVersion: "1.21.1", loader: "fabric", versionIds: ["main-v", "dep-v"] };
const draft = { ...selection, revision: 3, updatedAt: "2026-11-12T00:00:00Z" };
const context = { groupId, role: "owner", draft };
const metadata = (id: string, project: string, dependencies: unknown[] = []) => ({
  id, project_id: project, name: id, version_number: "1.0", date_published: "2026-01-01",
  game_versions: ["1.21.1"], loaders: ["fabric"], dependencies,
  files: [{ filename: project + ".jar", primary: true, hashes: { sha1: "a".repeat(40), sha512: "b".repeat(128) },
    url: `https://cdn.modrinth.com/data/${project}/versions/${id}/mod.jar`, size: 100 }],
});
const catalog: Record<string, unknown> = {
  "/version/main-v": metadata("main-v", "main"),
  "/version/dep-v": metadata("dep-v", "dep"),
  "/version/add-v": metadata("add-v", "add", [{ dependency_type: "required", project_id: "dep", version_id: "dep-v" }]),
  "/version/need-v": metadata("need-v", "need", [{ dependency_type: "required", project_id: "absent", version_id: "absent-v" }]),
  "/version/absent-v": metadata("absent-v", "absent"),
  "/project/main": { id: "main", title: "Main", project_type: "mod", client_side: "required", server_side: "optional" },
  "/project/dep": { id: "dep", title: "Dep", project_type: "mod", client_side: "required", server_side: "optional" },
  "/project/add": { id: "add", title: "Add", project_type: "mod", client_side: "required", server_side: "optional" },
  "/project/need": { id: "need", title: "Need", project_type: "mod", client_side: "required", server_side: "optional" },
};
const proposal = [{ versionId: "add-v", projectId: "add", projectTitle: "Add", versionNumber: "1.0" }];
const voteFixture = {
  id: voteId, groupId, gameVersion: "1.21.1", loader: "fabric", proposal,
  durationHours: 24, electorateSize: 3, status: "open", createdAt: "2026-11-12T00:00:00Z",
  closesAt: "2026-11-13T00:00:00Z", resolvedAt: null, incorporatedAt: null,
  approveCount: 1, rejectCount: 0, myBallot: "approve",
};
const addition = ["add-v"];
const openBody = { gameVersion: "1.21.1", loader: "fabric", addVersionIds: addition, durationHours: 24, expectedDraftRevision: 3 };

function setup(config: {
  results?: Record<string, unknown>;
  errors?: Record<string, string>;
  draft?: unknown;
  fault?: Error;
} = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const lookups: string[] = [];
  const results = config.results ?? {};
  const errors = config.errors ?? {};
  const draftContext = config.draft ?? context;
  const api = createApp(async (input) => {
    const found = new URL(String(input)).pathname.replace("/v2", "");
    lookups.push(found);
    const value = catalog[found];
    return value ? Response.json(value) : new Response(null, { status: 404 });
  }, clerk, async (url, init) => {
    if (config.fault) throw config.fault;
    const name = new URL(url).pathname.split("/").at(-1)!;
    calls.push({ name, args: JSON.parse(String(init.body)) });
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${bearer}`);
    expect(new Headers(init.headers).get("apikey")).toBe(database.publishableKey);
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    if (Object.hasOwn(errors, name)) return Response.json({ code: "P0001", message: errors[name] }, { status: 400 });
    if (name === "my_pack_draft") return Response.json(draftContext);
    return Response.json(Object.hasOwn(results, name) ? results[name] : voteFixture);
  }, database);
  const request = (method: string, url: string, body?: unknown, token = bearer) => api.request(url, {
    method, headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { api, request, calls, lookups };
}

test("vote routes require verified Clerk database identity before any upstream call", async () => {
  const { request, calls, lookups } = setup();
  const routes: [string, string][] = [
    ["GET", path], ["POST", path], ["GET", `${path}/${voteId}/ballots`],
    ["POST", `${path}/${voteId}/ballots`], ["POST", `${path}/${voteId}/cancel`],
    ["POST", `${path}/${voteId}/incorporate`],
  ];
  for (const [method, route] of routes) {
    for (const token of ["bad", clerkToken({ role: undefined })]) {
      const response = await request(method, route, method === "GET" ? undefined : {}, token);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Authentication required." });
    }
  }
  expect(calls).toEqual([]);
  expect(lookups).toEqual([]);
});

test("members list the group votes through one paged RPC with a sanitized snapshot", async () => {
  const { request, calls } = setup({ draft: { ...context, role: "member", secret: "not public" },
    results: { my_group_votes: { votes: [{ ...voteFixture, internal: "hidden" }], nextCursor: "1700000000000000." + voteId } } });
  const response = await request("GET", `${path}?limit=5`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ votes: [voteFixture], nextCursor: `1700000000000000.${voteId}` });
  expect(calls).toEqual([{ name: "my_group_votes", args: { p_cursor: null, p_limit: 5 } }]);
});

test("opening a vote rejects a non-owner before any catalog lookup", async () => {
  const { request, calls, lookups } = setup({ draft: { ...context, role: "member" } });
  const response = await request("POST", path, openBody);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Only the group owner may start votes." });
  expect(calls.map((call) => call.name)).toEqual(["my_pack_draft"]);
  expect(lookups).toEqual([]);
});

test("opening a vote rejects a stale draft revision before catalog validation", async () => {
  const { request, calls, lookups } = setup();
  const response = await request("POST", path, { ...openBody, expectedDraftRevision: 2 });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Draft revision conflict." });
  expect(calls.map((call) => call.name)).toEqual(["my_pack_draft"]);
  expect(lookups).toEqual([]);
});

test("invalid duration is rejected before any upstream call", async () => {
  for (const durationHours of [0, 721, 1.5, "24"]) {
    const { request, calls, lookups } = setup();
    const response = await request("POST", path, { ...openBody, durationHours });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid vote duration." });
    expect(calls).toEqual([]);
    expect(lookups).toEqual([]);
  }
});

test("opening a vote validates the concrete addition then sends one revision-scoped RPC", async () => {
  const { request, calls, lookups } = setup();
  const response = await request("POST", path, openBody);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(voteFixture);
  expect(calls).toEqual([
    { name: "my_pack_draft", args: {} },
    { name: "open_group_vote", args: { p_group_id: groupId, p_game_version: "1.21.1", p_loader: "fabric",
      p_addition: addition, p_proposal: proposal, p_duration_hours: 24, p_expected_draft_revision: 3 } },
  ]);
  expect(lookups.sort()).toEqual(["/project/add", "/project/dep", "/project/main",
    "/version/add-v", "/version/dep-v", "/version/main-v"].sort());
});

test("a missing required dependency rejects the proposal without any vote write", async () => {
  const { request, calls } = setup();
  const response = await request("POST", path, { ...openBody, addVersionIds: ["need-v"] });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "A required dependency is missing or conflicts with the approved selection. Resolve and approve dependencies first." });
  expect(calls.map((call) => call.name)).toEqual(["my_pack_draft"]);
});

test("a version already in the draft is rejected before any vote write", async () => {
  const { request, calls, lookups } = setup();
  const response = await request("POST", path, { ...openBody, addVersionIds: ["dep-v"] });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "A proposed version is already in the draft." });
  expect(calls.map((call) => call.name)).toEqual(["my_pack_draft"]);
  expect(lookups).toEqual([]);
});

test("a Minecraft or loader change is rejected before catalog validation", async () => {
  const { request, calls, lookups } = setup();
  const response = await request("POST", path, { ...openBody, loader: "forge" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Vote does not match the draft settings." });
  expect(calls.map((call) => call.name)).toEqual(["my_pack_draft"]);
  expect(lookups).toEqual([]);
});

test("casting a ballot forwards only the ballot value to the atomic RPC", async () => {
  const { request, calls } = setup({ results: { cast_group_vote: { ...voteFixture, myBallot: "reject", rejectCount: 1, approveCount: 0 } } });
  const response = await request("POST", `${path}/${voteId}/ballots`, { value: "reject" });
  expect(response.status).toBe(200);
  expect((await response.json() as { myBallot: string }).myBallot).toBe("reject");
  expect(calls).toEqual([{ name: "cast_group_vote", args: { p_vote_id: voteId, p_value: "reject" } }]);
  const invalid = await request("POST", `${path}/${voteId}/ballots`, { value: "abstain" });
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ error: "Invalid vote value." });
  expect(calls).toHaveLength(1);
});

test("closed vote, empty electorate and approval failures keep the documented statuses", async () => {
  for (const [message, status] of [["This vote is already closed.", 409],
    ["Only the fixed electorate may vote.", 403], ["Vote not found.", 404]] as const) {
    const { request, calls } = setup({ errors: { cast_group_vote: message } });
    const response = await request("POST", `${path}/${voteId}/ballots`, { value: "approve" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(calls.map((call) => call.name)).toEqual(["cast_group_vote"]);
  }
});

test("cancelling a vote forwards the vote id only", async () => {
  const { request, calls } = setup({ results: { cancel_group_vote: { ...voteFixture, status: "cancelled", resolvedAt: "2026-11-12T01:00:00Z" } } });
  const response = await request("POST", `${path}/${voteId}/cancel`);
  expect(response.status).toBe(200);
  expect((await response.json() as { status: string }).status).toBe("cancelled");
  expect(calls).toEqual([{ name: "cancel_group_vote", args: { p_vote_id: voteId } }]);
});

test("incorporating an approved vote returns the updated draft under a revision guard", async () => {
  const merged = { gameVersion: "1.21.1", loader: "fabric", versionIds: ["main-v", "dep-v", "add-v"], revision: 4, updatedAt: "2026-11-12T02:00:00Z" };
  const { request, calls } = setup({ results: { incorporate_group_vote: {
    vote: { ...voteFixture, status: "approved", resolvedAt: "2026-11-12T00:30:00Z", incorporatedAt: "2026-11-12T02:00:00Z" },
    draft: merged } } });
  const response = await request("POST", `${path}/${voteId}/incorporate`, { expectedRevision: 3 });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    vote: { ...voteFixture, status: "approved", resolvedAt: "2026-11-12T00:30:00Z", incorporatedAt: "2026-11-12T02:00:00Z" },
    draft: merged });
  expect(calls).toEqual([{ name: "incorporate_group_vote", args: { p_vote_id: voteId, p_expected_draft_revision: 3 } }]);
});

test("a ballot page is paginated by electorate member and never exposes raw columns", async () => {
  const { request, calls } = setup({ results: { group_vote_ballots: { ballots: [
    { userId: "user_aaa", username: "ana", ballot: "approve", castAt: "2026-11-12T00:00:00Z", updatedAt: "2026-11-12T00:00:00Z" },
    { userId: "user_bbb", username: "beto", ballot: null, castAt: null, updatedAt: null }], nextCursor: "user_bbb" } } });
  const response = await request("GET", `${path}/${voteId}/ballots?cursor=user_aaa&limit=2`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ballots: [
    { userId: "user_aaa", username: "ana", ballot: "approve", castAt: "2026-11-12T00:00:00Z", updatedAt: "2026-11-12T00:00:00Z" },
    { userId: "user_bbb", username: "beto", ballot: null, castAt: null, updatedAt: null }], nextCursor: "user_bbb" });
  expect(calls).toEqual([{ name: "group_vote_ballots", args: { p_vote_id: voteId, p_cursor: "user_aaa", p_limit: 2 } }]);
});

test("malformed identifiers, bodies and upstream snapshots never become success or input errors", async () => {
  const { request } = setup();
  const badId = await request("GET", `${path}/not-a-vote/ballots`);
  expect(badId.status).toBe(400);
  expect(await badId.json()).toEqual({ error: "Invalid vote id." });
  const badBody = await request("POST", path, { ...openBody, extra: true });
  expect(badBody.status).toBe(400);
  expect(await badBody.json()).toEqual({ error: "Expected only gameVersion, loader, addVersionIds, durationHours, expectedDraftRevision." });
  const malformed = setup({ results: { my_group_votes: { votes: [{ ...voteFixture, status: "done" }], nextCursor: null } } });
  const badVote = await malformed.request("GET", path);
  expect(badVote.status).toBe(502);
  expect(await badVote.json()).toEqual({ error: "Vote service unavailable." });
  const unconfigured = createApp(async () => new Response(null, { status: 404 }), clerk, async () => Response.json(voteFixture), { url: undefined });
  const missing = await unconfigured.request(path, { headers: { Authorization: `bearer ${bearer}` } });
  expect(missing.status).toBe(503);
  expect(await missing.json()).toEqual({ error: "Vote service is not configured." });
});

test("upstream timeouts and failures map to distinct vote service errors", async () => {
  const timeout = setup({ fault: new DOMException("timed out", "TimeoutError") });
  const slow = await timeout.request("GET", path);
  expect(slow.status).toBe(504);
  expect(await slow.json()).toEqual({ error: "Vote service timed out." });
  const failure = setup({ fault: new TypeError("connection refused") });
  const broken = await failure.request("GET", path);
  expect(broken.status).toBe(502);
  expect(await broken.json()).toEqual({ error: "Vote service unavailable." });
});
