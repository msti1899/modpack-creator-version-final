import { expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createApp } from "../src/index";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  jwtKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  issuer: "https://clerk.example.test",
  authorizedParties: ["http://localhost:3000"],
};
const catalog = async () => { throw new Error("Auth must not call the catalog fetcher"); };
function token(overrides = {}, key = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = `${encode({ alg: "RS256", typ: "JWT", kid: "test-key" })}.${encode({
    iss: config.issuer, sub: "user_player", sid: "sess_player", azp: config.authorizedParties[0],
    iat: now, nbf: now - 1, exp: now + 60, ...overrides,
  })}`;
  return `${content}.${sign("RSA-SHA256", Buffer.from(content), key).toString("base64url")}`;
}
function setup(overrides = {}) { return createApp(catalog, { ...config, ...overrides }); }
function me(app = setup(), authorization?: string) {
  return app.request("/me", { headers: authorization ? { authorization } : {} });
}

test("GET /me verifies Clerk signatures and returns only the caller's identity", async () => {
  const response = await me(setup(), `Bearer ${token({ email: "player@example.test", private: "hidden" })}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: { id: "user_player", email: "player@example.test" } });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
});

test("missing and malformed credentials remain unauthorized without provider configuration", async () => {
  for (const header of [undefined, "Basic token", "Bearer", "Bearer one two", "Bearer one,Bearer two", `Bearer ${"x".repeat(8193)}`]) {
    const response = await me(createApp(catalog, {}), header);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});

test("invalid signatures, expired sessions and non-user tokens cannot authenticate", async () => {
  for (const credential of ["invalid-token", "sb_publishable_not-a-user", token({}, otherKeys.privateKey),
    token({ exp: 1 }), token({ nbf: Math.floor(Date.now() / 1000) + 3600 }),
    token({ sub: "" }), token({ sub: "org_not-a-user" }), token({ sid: "" }), token({ sts: "pending" }),
    token({ iss: "https://other.example.test" }), token({ azp: "https://other.example.test" }), token({ azp: null })]) {
    const response = await me(setup(), `Bearer ${credential}`);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({ error: "Authentication required." });
  }
});

test("missing or invalid Clerk configuration fails closed without exposing its values", async () => {
  for (const overrides of [{ jwtKey: undefined }, { jwtKey: "private-invalid-key" }, { issuer: undefined },
    { issuer: "http://clerk.example.test" }, { issuer: "https://user:secret@clerk.example.test" },
    { authorizedParties: [] }, { authorizedParties: undefined }, { authorizedParties: ["*"] }]) {
    const response = await me(setup(overrides), `Bearer ${token()}`);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Authentication is not configured." });
  }
});

test("email remains nullable and never comes from unsigned request data", async () => {
  for (const claims of [{}, { email: null }, { email: { private: "hidden" } }]) {
    const response = await me(setup(), `Bearer ${token(claims)}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id: "user_player", email: null } });
  }
});

test("identities are request scoped and Clerk verification needs no Auth network call", async () => {
  const app = setup();
  const responses = await Promise.all([me(app, `Bearer ${token()}`), me(app, `Bearer ${token({ sub: "user_other" })}`)]);
  expect((await responses[0].json()).user.id).toBe("user_player");
  expect((await responses[1].json()).user.id).toBe("user_other");
  expect((await me(app, `Bearer ${token()}`)).status).toBe(200);
});

test("existing health and unknown routes remain public without identity configuration", async () => {
  const app = createApp(catalog, {});
  expect(await (await app.request("/health")).json()).toEqual({ status: "ok", service: "modpack-api" });
  expect((await app.request("/not-found")).status).toBe(404);
  expect((await me(app, `Bearer ${token()}`)).status).toBe(503);
});
