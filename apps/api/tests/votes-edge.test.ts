import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const bearer = clerkToken();
const database = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const groupId = "11111111-1111-4111-8111-111111111111";
const voteId = "22222222-2222-4222-8222-222222222222";
const path = "/groups/me/votes";
const selection = { gameVersion: "1.21.1", loader: "fabric", versionIds: ["main-v", "dep-v"] };
const draft = { ...selection, revision: 3, updatedAt: "2026-11-12T00:00:00Z" };
const context = { groupId, role: "owner", draft };
const meta = (id: string, project: string, overrides: Record<string, unknown> = {}) => ({
  id, project_id: project, name: id, version_number: "1.0", date_published: "2026-01-01",
  game_versions: ["1.21.1"], loaders: ["fabric"], dependencies: [],
  files: [{ filename: project + ".jar", primary: true, hashes: { sha1: "a".repeat(40), sha512: "b".repeat(128) },
    url: `https://cdn.modrinth.com/data/${project}/versions/${id}/mod.jar`, size: 100 }], ...overrides,
});
const catalog: Record<string, unknown> = {
  "/version/main-v": meta("main-v", "main"), "/version/dep-v": meta("dep-v", "dep"), "/version/add-v": meta("add-v", "add"),
  "/project/main": { id: "main", title: "Main", project_type: "mod", client_side: "required", server_side: "optional" },
  "/project/dep": { id: "dep", title: "Dep", project_type: "mod", client_side: "required", server_side: "optional" },
  "/project/add": { id: "add", title: "Add", project_type: "mod", client_side: "required", server_side: "optional" },
};
const proposal = [{ versionId: "add-v", projectId: "add", projectTitle: "Add", versionNumber: "1.0" }];
const voteFixture = { id: voteId, groupId, gameVersion: "1.21.1", loader: "fabric", proposal,
  durationHours: 24, electorateSize: 3, status: "open", createdAt: "2026-11-12T00:00:00Z",
  closesAt: "2026-11-13T00:00:00Z", resolvedAt: null, incorporatedAt: null,
  approveCount: 1, rejectCount: 0, myBallot: "approve" };
const openBody = { gameVersion: "1.21.1", loader: "fabric", addVersionIds: ["add-v"], durationHours: 24, expectedDraftRevision: 3 };

function setup(config: { overrides?: Record<string, unknown>; rpc?: Record<string, Response | (() => Response)>; fault?: Error } = {}) {
  const calls: string[] = [];
  const api = createApp(async (input) => {
    const found = new URL(String(input)).pathname.replace("/v2", "");
    const value = Object.hasOwn(config.overrides ?? {}, found) ? config.overrides![found] : catalog[found];
    if (value === undefined || value === "404") return new Response(null, { status: 404 });
    return Response.json(value);
  }, clerk, async (url) => {
    const name = new URL(String(url)).pathname.split("/").at(-1)!;
    calls.push(name);
    if (name === "my_pack_draft") return Response.json(context);
    if (config.fault) throw config.fault;
    if (config.rpc && Object.hasOwn(config.rpc, name)) {
      const raw = config.rpc[name]!;
      return typeof raw === "function" ? raw() : raw;
    }
    const defaults: Record<string, unknown> = {
      my_group_votes: { votes: [voteFixture], nextCursor: null },
      group_vote_ballots: { ballots: [], nextCursor: null },
    };
    return Response.json(defaults[name] ?? voteFixture);
  }, database);
  const request = (method: string, url: string, body?: unknown) => api.request(url, {
    method, headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { request, calls };
}

test("a body of exactly 16 KiB is read and one byte more is rejected before any RPC", async () => {
  const valid = JSON.stringify(openBody);
  const exact = setup();
  const accepted = await exact.request("POST", path, valid + " ".repeat(16384 - valid.length));
  expect(accepted.status).toBe(200);
  expect(exact.calls).toEqual(["my_pack_draft", "open_group_vote"]);
  const over = setup();
  const rejected = await over.request("POST", path, valid + " ".repeat(16385 - valid.length));
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({ error: "Invalid or oversized JSON body." });
  expect(over.calls).toEqual([]);
});

test("a database response of exactly 256 KiB is accepted and one byte more is 502", async () => {
  const shape = JSON.stringify({ votes: [], nextCursor: null });
  const at = shape.slice(0, -1) + ',"pad":"' + "x".repeat(262144 - (shape.length - 1 + 8 + 2)) + '"}';
  expect(Buffer.byteLength(at)).toBe(262144);
  const accepted = setup({ rpc: { my_group_votes: () => new Response(at, { status: 200 }) } });
  expect((await accepted.request("GET", path)).status).toBe(200);
  const over = setup({ rpc: { my_group_votes: () => new Response(at.replace('"}', '"} '), { status: 200 }) } });
  const response = await over.request("GET", path);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Vote service unavailable." });
});

test("every documented SQL message maps to its documented HTTP status", async () => {
  const table: [string, number][] = [
    ["Authentication required.", 401], ["Group required.", 404], ["Vote not found.", 404],
    ["Only the group owner may start votes.", 403], ["Only the group owner may cancel votes.", 403],
    ["Only the group owner may incorporate votes.", 403], ["Only the fixed electorate may vote.", 403],
    ["Invalid vote settings.", 400], ["Invalid vote selection.", 400], ["Invalid vote proposal.", 400],
    ["Invalid vote duration.", 400], ["Invalid vote revision.", 400], ["Invalid vote value.", 400],
    ["Invalid vote cursor.", 400], ["Draft revision conflict.", 409],
    ["Vote does not match the draft settings.", 409], ["A proposed version is already in the draft.", 409],
    ["This vote is already closed.", 409], ["Vote is not approved.", 409], ["Vote is already incorporated.", 409],
  ];
  for (const [message, status] of table) {
    const { request } = setup({ rpc: { my_group_votes: () => Response.json({ code: "P0001", message }, { status: 400 }) } });
    const response = await request("GET", path);
    expect([message, response.status, await response.json()]).toEqual([message, status, { error: message }]);
  }
  const unknown = setup({ rpc: { my_group_votes: () => Response.json({ code: "P0001", message: "other" }, { status: 400 }) } });
  expect((await unknown.request("GET", path)).status).toBe(502);
});

test("page limits and cursor length are rejected before the RPC", async () => {
  for (const [query, status, error] of [
    ["?limit=0", 400, "Vote page size is invalid."], ["?limit=101", 400, "Vote page size is invalid."],
    ["?limit=1.5", 400, "Vote page size is invalid."], ["?limit=", 400, "Vote page size is invalid."],
    ["?cursor=" + "a".repeat(65), 400, "Invalid vote cursor."],
  ] as const) {
    const { request, calls } = setup();
    const response = await request("GET", path + query);
    expect([query, response.status, await response.json()]).toEqual([query, status, { error }]);
    expect([query, calls]).toEqual([query, []]);
  }
  const ok = setup();
  await ok.request("GET", path + "?limit=100&cursor=" + "a".repeat(64));
  expect(ok.calls).toEqual(["my_group_votes"]);
});

test("write calls are attempted once and timeouts map to 504", async () => {
  const fault = setup({ fault: new TypeError("connection refused") });
  const failed = await fault.request("POST", `${path}/${voteId}/cancel`);
  expect(failed.status).toBe(502);
  expect(fault.calls).toEqual(["cancel_group_vote"]);
  const timeout = setup({ fault: new DOMException("slow", "TimeoutError") });
  const slow = await timeout.request("POST", `${path}/${voteId}/incorporate`, { expectedRevision: 3 });
  expect(slow.status).toBe(504);
  expect(await slow.json()).toEqual({ error: "Vote service timed out." });
});

test("malformed catalog data on the open path never creates a vote", async () => {
  for (const [overrides, status, error] of [
    [{ "/version/add-v": "404" }, 409, "A selected mod or dependency is unavailable."],
    [{ "/version/add-v": { id: "add-v", project_id: "add" } }, 502, "Modrinth returned invalid version metadata."],
    [{ "/version/add-v": meta("other", "add") }, 502, "Modrinth returned a different version."],
    [{ "/project/add": { id: "add", title: "bad\nname", project_type: "mod", client_side: "required", server_side: "optional" } }, 502, "Modrinth returned an invalid project title."],
    [{ "/project/add": { id: "add", title: "bad\nname", project_type: "mod", client_side: "required", server_side: "optional" },
      "/version/add-v": meta("add-v", "add", { version_number: "v".repeat(101) }) }, 502, "Modrinth returned an invalid project title."],
    [{ "/project/add": { id: "add", title: "Add", project_type: "shader", client_side: "required", server_side: "optional" } }, 409, "Only mods can be included in this pack."],
  ] as const) {
    const { request, calls } = setup({ overrides });
    const response = await request("POST", path, openBody);
    expect([response.status, await response.json(), calls.includes("open_group_vote")]).toEqual([status, { error }, false]);
  }
});
