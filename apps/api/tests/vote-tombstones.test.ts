import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk, clerkToken } from "./fixtures/clerk";

const token = clerkToken();
const config = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };
const voteId = "11111111-1111-4111-8111-111111111111";
const noCatalog = async () => { throw new Error("Ballot probes must not call Modrinth"); };
const deleted = { userId: "user_deleted", username: null, ballot: "reject",
  castAt: "2026-11-14T09:35:06.796348+00:00", updatedAt: "2026-11-14T09:35:06.796348+00:00" };
const pending = { userId: "user_live", username: "LiveVoter", ballot: null, castAt: null, updatedAt: null };

function request(body: unknown) {
  const app = createApp(noCatalog, clerk, async (url) => {
    expect(url).toBe(config.url + "/rest/v1/rpc/group_vote_ballots");
    return Response.json(body);
  }, config);
  return app.request(`/groups/me/votes/${voteId}/ballots`, { headers: { Authorization: `Bearer ${token}` } });
}

test("a retained tombstone keeps the surviving group's ballot page readable", async () => {
  const response = await request({ ballots: [deleted, pending], nextCursor: null });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ballots: [deleted, pending], nextCursor: null });
});

test("a malformed ballot row still fails closed", async () => {
  for (const ballots of [
    [{ ...deleted, username: "ab" }],
    [{ ...deleted, username: "a".repeat(21) }],
    [{ ...deleted, username: 42 }],
    [{ ...deleted, username: undefined }],
    [{ ...deleted, userId: "deleted" }],
    [{ ...deleted, ballot: "abstain" }],
    [{ ...deleted, castAt: "not a date" }],
    [{ ...deleted, updatedAt: "not a date" }],
    [{ ...deleted, userId: undefined }],
  ]) {
    const response = await request({ ballots, nextCursor: null });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Vote service unavailable." });
  }
});
