import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const token = clerkToken();
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const id = "11111111-1111-4111-8111-111111111111";
const member = { userId: "user_player", username: "Player", role: "owner", joinedAt: "2026-11-12T00:00:00Z" };
const overview = { id, name: "Friends", visibility: "public", ownerId: "user_player", role: "owner",
  createdAt: "2026-11-12T00:00:00Z", memberCount: 1, members: [member], membersNextCursor: null,
  invitation: null, requests: [], requestsNextCursor: null };
function setup(fetcher = async (_url: string, _init: RequestInit) => Response.json(overview)) {
  return createApp(async () => { throw new Error("Group requests must not call Modrinth"); }, clerk, fetcher, config);
}
function request(app: ReturnType<typeof setup>, path: string, method = "GET", body?: unknown, bearer = token) {
  return app.request(path, { method, headers: { Authorization: `bearer ${bearer}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}

test("group creation requires verified identity and forwards only validated RPC arguments", async () => {
  let calls = 0;
  const app = setup(async (url, init) => {
    calls++;
    expect(url).toBe(config.url + "/rest/v1/rpc/create_group");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(init.headers).get("apikey")).toBe(config.publishableKey);
    expect(JSON.parse(String(init.body))).toEqual({ p_name: "Friends", p_visibility: "public" });
    return Response.json(overview);
  });
  expect((await app.request("/groups", { method: "POST" })).status).toBe(401);
  expect(calls).toBe(0);
  const response = await request(app, "/groups", "POST", { name: "\u00a0Friends\u3000", visibility: "public" });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ group: overview });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
  expect(calls).toBe(1);
});

const invite = { token: "a".repeat(64), createdAt: "2026-11-12T00:00:00Z" };
const routes: [string, string, string, Record<string, unknown>, unknown, unknown, number, unknown?][] = [
  ["GET", "/groups/me", "my_group", {}, null, { group: null }, 200],
  ["POST", `/groups/${id}/join`, "join_public_group", { p_group_id: id }, overview, { group: overview }, 200],
  ["POST", "/groups/me/invitation", "create_invitation", {}, invite, { invitation: invite }, 201],
  ["DELETE", "/groups/me/invitation", "revoke_invitation", {}, { invitation: null }, { invitation: null }, 200],
  ["GET", `/groups/invitations/${invite.token}`, "resolve_invitation", { p_token: invite.token },
    { groupId: id, name: "Friends", ownerUsername: "Player", requested: false, member: false },
    { invitation: { groupId: id, name: "Friends", ownerUsername: "Player", requested: false, member: false } }, 200],
  ["POST", `/groups/invitations/${invite.token}/requests`, "request_join", { p_token: invite.token },
    { groupId: id, status: "pending", createdAt: invite.createdAt }, { request: { groupId: id, status: "pending", createdAt: invite.createdAt } }, 201],
  ["POST", "/groups/me/requests/user_member/approve", "approve_join_request", { p_user_id: "user_member" }, overview, { group: overview }, 200],
  ["POST", "/groups/me/requests/user_member/reject", "reject_join_request", { p_user_id: "user_member" },
    { userId: "user_member", status: "rejected" }, { request: { userId: "user_member", status: "rejected" } }, 200],
  ["POST", "/groups/me/ownership", "transfer_ownership", { p_user_id: "user_player" }, overview, { group: overview }, 200, { userId: "user_player" }],
  ["DELETE", "/groups/me/membership", "leave_group", {}, { groupId: id, groupDeleted: true }, { groupId: id, groupDeleted: true }, 200],
];
for (const [method, path, rpc, args, output, expected, status, body] of routes) {
  test(`${method} ${path} uses the user-scoped ${rpc} RPC`, async () => {
    let calls = 0;
    const app = setup(async (url, init) => {
      calls++;
      expect(new URL(url).pathname).toBe(`/rest/v1/rpc/${rpc}`);
      expect(JSON.parse(String(init.body))).toEqual(args);
      expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${token}`);
      return Response.json(output);
    });
    expect((await app.request(path, { method })).status).toBe(401);
    expect(calls).toBe(0);
    const response = await request(app, path, method, body);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(expected);
    expect(calls).toBe(1);
  });
}

test("member and request pages forward bounded cursors and strip unexpected fields", async () => {
  const cursor = "1760000000000000.user_member";
  const cases = [
    ["/groups/me/members?limit=2&cursor=" + cursor, "group_members_page", { p_limit: 2, p_cursor: cursor },
      { members: [{ ...member, secret: "hidden" }], nextCursor: cursor, secret: "hidden" },
      { members: [member], nextCursor: cursor }],
    ["/groups/me/requests?limit=1", "group_requests_page", { p_limit: 1, p_cursor: null },
      { requests: [{ userId: "user_member", username: "Member", createdAt: invite.createdAt, secret: "hidden" }], nextCursor: null },
      { requests: [{ userId: "user_member", username: "Member", createdAt: invite.createdAt }], nextCursor: null }],
  ] as const;
  for (const [path, rpc, args, output, expected] of cases) {
    let calls = 0;
    const app = setup(async (url, init) => {
      calls++;
      expect(new URL(url).pathname).toBe(`/rest/v1/rpc/${rpc}`);
      expect(JSON.parse(String(init.body))).toEqual(args);
      return Response.json(output);
    });
    expect((await app.request(path)).status).toBe(401);
    expect(calls).toBe(0);
    const response = await request(app, path);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
    expect(calls).toBe(1);
  }
  for (const path of ["/groups/me/members?limit=0", "/groups/me/members?limit=101", "/groups/me/members?limit=1.5",
    "/groups/me/members?cursor=bad", "/groups/me/members?limit=1&cursor=" + encodeURIComponent("1.user_x!"),
    "/groups/me/requests?cursor=1.user_ok&extra=1"]) {
    expect((await request(setup(async () => { throw new Error("Validation must not reach the database"); }), path)).status).toBe(400);
  }
});

test("group writes reject forged fields, invalid types and oversized bodies before database access", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(overview); });
  for (const body of [null, [], {}, { name: "Friends", visibility: ["public"] },
    { name: "Friends", visibility: { toString: "public" } },
    { name: "Friends", visibility: "public", ownerId: "user_other" },
    { name: "", visibility: "public" }, { name: " ", visibility: "private" },
    { name: "bad\nname", visibility: "public" }, { name: "a".repeat(61), visibility: "public" },
    { name: "a".repeat(2000), visibility: "public" }, { name: "Friends", visibility: "secret" }]) {
    expect((await request(app, "/groups", "POST", body)).status).toBe(400);
  }
  for (const [path, method, body] of [
    ["/groups/not-a-uuid/join", "POST", undefined], ["/groups/invitations/abc", "GET", undefined],
    ["/groups/me/requests/not-a-subject/approve", "POST", undefined],
    ["/groups/me/ownership", "POST", {}], ["/groups/me/ownership", "POST", { userId: "user_other", ownerId: "user_other" }],
    ["/groups/me/invitation", "POST", { groupId: id }], ["/groups/me/membership", "DELETE", { userId: "user_other" }],
  ] as const) expect((await request(app, path, method, body)).status).toBe(400);
  const malformed = await app.request("/groups", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "{" });
  expect(malformed.status).toBe(400);
  expect(calls).toBe(0);
});

test("every group operation rejects missing or privileged database roles without forwarding", async () => {
  let calls = 0;
  const app = setup(async () => { calls++; return Response.json(overview); });
  for (const role of [undefined, "anon", "service_role"]) {
    const bearer = clerkToken({ role });
    for (const [method, path, , , , , , body] of routes) {
      const response = await request(app, path, method, body, bearer);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Authentication required." });
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
    }
    expect((await request(app, "/groups", "POST", { name: "Friends", visibility: "public" }, bearer)).status).toBe(401);
  }
  expect(calls).toBe(0);
});

test("group service errors preserve safe statuses, cancel invalid credentials and never retry writes", async () => {
  const faults: [number, unknown, number, string][] = [
    [400, { code: "P0001", message: "Profile required." }, 409, "Profile required."],
    [400, { code: "P0001", message: "Only the owner can perform this action." }, 403, "Only the owner can perform this action."],
    [400, { code: "P0001", message: "Request not found." }, 404, "Request not found."],
    [400, { code: "P0001", message: "Transfers are required before leaving a group with other members." }, 409, "Transfers are required before leaving a group with other members."],
    [409, { code: "23505", message: "SECRET index details" }, 409, "Group operation conflicts with current state."],
    [403, { code: "42501", message: "SECRET permissions" }, 502, "Group service unavailable."],
    [400, { code: "P0001", message: "SECRET unknown failure" }, 502, "Group service unavailable."],
    [429, {}, 502, "Group service unavailable."], [200, {}, 502, "Group service unavailable."],
    [200, null, 502, "Group service unavailable."],
  ];
  for (const [upstreamStatus, body, expected, error] of faults) {
    let calls = 0;
    const response = await request(setup(async () => { calls++; return Response.json(body, { status: upstreamStatus }); }),
      "/groups", "POST", { name: "Friends", visibility: "public" });
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({ error });
    expect(calls).toBe(1);
  }
  let cancelled = false;
  const response = await request(setup(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 401 })), "/groups/me");
  expect(response.status).toBe(401);
  expect(cancelled).toBe(true);
  for (const upstream of [new Response("{"), Response.json({ huge: "x".repeat(262145) })]) {
    expect((await request(setup(async () => upstream), "/groups/me")).status).toBe(502);
  }
  for (const fault of [new Error("SECRET network"), new DOMException("late", "TimeoutError")]) {
    const response = await request(setup(async () => { throw fault; }), "/groups/me");
    expect(response.status).toBe(fault.name === "TimeoutError" ? 504 : 502);
    expect(await response.json()).toEqual({ error: fault.name === "TimeoutError" ? "Group service timed out." : "Group service unavailable." });
  }
});

test("group responses omit unexpected columns and suppress owner-only data for members", async () => {
  const member = { ...overview, ownerId: "user_other", role: "member", visibility: "private",
    members: [...overview.members.map((m) => ({ ...m, role: "member", secret: "hidden" })),
      { userId: "user_other", username: "Other", role: "owner", joinedAt: invite.createdAt }],
    invitation: invite, requests: [{ secret: "hidden" }], secret: "hidden" };
  const response = await request(setup(async () => Response.json(member)), "/groups/me");
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.group.invitation).toBeNull();
  expect(result.group.requests).toBeNull();
  expect(JSON.stringify(result)).not.toContain("hidden");
  const unavailable = createApp(async () => { throw new Error(); }, clerk, async () => { throw new Error(); }, {});
  expect((await request(unavailable, "/groups/me")).status).toBe(503);
  const unicode = { ...overview, name: "Café 🎮" };
  const created = await request(setup(async () => Response.json(unicode)), "/groups", "POST", { name: unicode.name, visibility: "public" });
  expect(created.status).toBe(201);
  expect((await created.json()).group.name).toBe(unicode.name);
});
