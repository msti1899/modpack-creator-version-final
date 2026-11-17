import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const token = clerkToken();
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const id = "11111111-1111-4111-8111-111111111111";
const summary = {
  id,
  name: "Friends",
  visibility: "public",
  ownerUsername: "Owner",
  memberCount: 3,
  membership: null,
};

function setup(value: unknown = summary) {
  const calls: { url: string; body: unknown }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json(value);
  };
  return { api: createApp(async () => { throw new Error("No Modrinth call expected"); }, clerk, fetcher, config), calls };
}

function request(app: ReturnType<typeof setup>["api"], bearer = token) {
  return app.request(`/groups/${id}`, { headers: { Authorization: `bearer ${bearer}` } });
}

test("a public group is summarized without its member list", async () => {
  const { api, calls } = setup();
  const response = await request(api);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ group: summary });
  expect(calls[0]!.url).toBe(config.url + "/rest/v1/rpc/group_summary");
  expect(calls[0]!.body).toEqual({ p_group_id: id });
});

test("a private group the caller cannot see is a 404, not a 403", async () => {
  const { api } = setup(null);
  const response = await request(api);
  expect(response.status).toBe(404);
  expect((await response.json()).error).toBe("Group not found.");
});

test("member and requested statuses pass through", async () => {
  for (const membership of ["member", "requested"] as const) {
    const { api } = setup({ ...summary, visibility: "private", membership });
    const response = await request(api);
    expect(response.status).toBe(200);
    expect((await response.json()).group.membership).toBe(membership);
  }
});

test("an invalid identifier and an unauthenticated call never reach the database", async () => {
  const { api, calls } = setup();
  expect((await api.request("/groups/not-a-uuid", { headers: { Authorization: `bearer ${token}` } })).status).toBe(400);
  expect((await request(api, "not-a-token")).status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("a malformed summary is a 502, never a partial shape", async () => {
  const { api } = setup({ ...summary, memberCount: 3, members: [{ userId: "user_inside" }] });
  // Unknown fields are ignored by the projection: only the named fields leave the API.
  expect(await (await request(api)).json()).toEqual({ group: summary });

  const broken = setup({ ...summary, ownerUsername: "x" });
  expect((await request(broken.api)).status).toBe(502);
});
