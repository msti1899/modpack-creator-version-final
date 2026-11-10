import { expect, test } from "bun:test";
import { createApp } from "../src/index";
import { clerk } from "./fixtures/clerk";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "player@example.test" };
const configuration = { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_test" };

test("retired email-management proxies return 404 without calling an Auth provider", async () => {
  let calls = 0;
  const external = async () => { calls++; throw new Error("Retired account routes must not make external requests."); };
  const app = createApp(external, clerk, external, configuration);
  for (const [method, path, body] of [
    ["POST", "/auth/verify", { tokenHash: "email-hash", type: "signup" }],
    ["POST", "/auth/recover", { email: user.email }],
    ["PATCH", "/auth/password", { password: "New-password1!" }],
  ] as const) {
    const response = await app.request(path, { method, headers: { authorization: "Bearer access-token" }, body: JSON.stringify(body) });
    expect(response.status).toBe(404);
  }
  expect(calls).toBe(0);
});

test("retired credential proxies return 404 without calling providers or returning sessions", async () => {
  let calls = 0;
  const external = async () => { calls++; throw new Error("Retired account routes must not make external requests."); };
  const app = createApp(external, clerk, external, configuration);
  for (const path of ["/auth/register", "/auth/login"]) {
    const response = await app.request(path, { method: "POST", body: JSON.stringify({ email: user.email, password: "  Password1!  " }) });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/access-token|refresh-token|player@example/);
  }
  expect(calls).toBe(0);
});
