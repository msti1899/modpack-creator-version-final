import { expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createApp } from "../apps/api/src/index";
import { createIdentityProxy } from "../apps/web/src/lib/identity";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  jwtKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  issuer: "https://clerk.example.test", authorizedParties: ["https://web.example.test"],
};
const noNetwork = async () => { throw Error("Unexpected network request"); };
function jwt(overrides: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = `${encode({ alg: "RS256", typ: "JWT", kid: "probe", ...header })}.${encode({
    iss: config.issuer, azp: config.authorizedParties[0], sub: "user_A", sid: "sess_A",
    exp: now + 60, iat: now - 1, nbf: now - 1, ...overrides,
  })}`;
  return `${content}.${sign("RSA-SHA256", Buffer.from(content), keys.privateKey).toString("base64url")}`;
}
function snapshot() {
  const files: string[] = [];
  function walk(path: string) {
    for (const name of readdirSync(path)) {
      const file = `${path}/${name}`;
      if (statSync(file).isDirectory()) walk(file);
      else files.push(file);
    }
  }
  files.push("supabase/config.toml");
  walk("supabase/migrations");
  walk("apps/api/tests");
  const hash = createHash("sha256");
  for (const path of files.sort()) hash.update(path).update(readFileSync(path));
  return hash.digest("hex");
}
async function api(header: string | undefined, status: number, error?: string, options = config) {
  const before = snapshot();
  const response = await createApp(noNetwork, options).request("/me", { headers: header ? { Authorization: header } : {} });
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toBe("Authorization");
  if (error) expect(await response.text()).toBe(JSON.stringify({ error }));
  if (status === 401) expect(response.headers.get("www-authenticate")).toBe("Bearer");
  expect(snapshot()).toBe(before);
}

test("omitted, malformed and cross-instance claims fail closed without fixture writes", async () => {
  const claims = [
    { azp: undefined }, { azp: "" }, { azp: ["https://web.example.test"] }, { azp: "https://web.example.test.evil" },
    { iss: undefined }, { iss: `${config.issuer}/` }, { exp: undefined }, { exp: "3000000000" },
    { exp: Math.floor(Date.now() / 1000) }, { iat: Math.floor(Date.now() / 1000) + 60 },
    { iat: "now" }, { nbf: Math.floor(Date.now() / 1000) + 60 }, { nbf: "now" },
    { sub: undefined }, { sid: undefined }, { sid: "m2m_A" }, { sub: "org_A" }, { sts: "pending" },
  ];
  for (const value of claims) await api(`Bearer ${jwt(value)}`, 401, "Authentication required.");
  for (const header of [{ alg: "none" }, { alg: "HS256" }, { cat: "cl_B7d4PD333AAA" }]) {
    await api(`Bearer ${jwt({}, header)}`, 401, "Authentication required.");
  }
  const [header, , signature] = jwt().split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "user_attacker" })).toString("base64url");
  await api(`Bearer ${header}.${forged}.${signature}`, 401, "Authentication required.");
  for (const credential of [undefined, "Bearer", "Bearer a b", `Bearer ${"x".repeat(8192)}`, `Bearer ${"x".repeat(8193)}`]) {
    await api(credential, 401, "Authentication required.");
  }
});

test("successful signed claims remain isolated across concurrent requests", async () => {
  const app = createApp(noNetwork, config);
  const replies = await Promise.all(Array.from({ length: 12 }, (_, n) => app.request("/me", {
    headers: { Authorization: `Bearer ${jwt({ sub: `user_${n}`, email: n % 2 ? null : `${n}@example.test`, private: "hidden" })}` },
  })));
  for (const [n, response] of replies.entries()) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id: `user_${n}`, email: n % 2 ? null : `${n}@example.test` } });
  }
  await api(undefined, 401, "Authentication required.");
});

test("invalid server configuration is unavailable, not logout", async () => {
  const variants = [{ jwtKey: "" }, { issuer: "https://clerk.example.test/path" },
    { issuer: "https://clerk.example.test?q=x" }, { authorizedParties: ["http://web.example.test"] },
    { authorizedParties: ["https://web.example.test/#x"] }];
  for (const value of variants) await api(`Bearer ${jwt()}`, 503, "Authentication is not configured.", { ...config, ...value });
});

const user = { id: "user_A", email: null };
const options = {
  enabled: true, apiUrl: "https://api.example.test", getToken: async () => "sentinel-session-token",
  fetcher: async () => Response.json({ user }),
};
async function proxy(extra: Partial<Parameters<typeof createIdentityProxy>[0]>, status: number, error?: string) {
  const before = snapshot();
  const response = await createIdentityProxy({ ...options, ...extra })();
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  if (error) expect(await response.text()).toBe(JSON.stringify({ error }));
  expect(snapshot()).toBe(before);
  return response;
}

test("unsafe transport destinations are rejected before obtaining credentials", async () => {
  for (const apiUrl of ["", "http://api.example.test", "https://api.example.test/me", "https://u:p@api.example.test",
    "https://api.example.test?q=token", "https://api.example.test/#token", "file:///tmp/socket"]) {
    await proxy({ apiUrl, getToken: async () => { throw Error("Token must not be requested"); }, fetcher: noNetwork }, 503, "Authentication is not configured.");
  }
  await proxy({ enabled: false, getToken: async () => { throw Error("Token must not be requested"); } }, 503, "Authentication is not configured.");
  await proxy({ getToken: async () => null, fetcher: noNetwork }, 401, "Authentication required.");
});

test("forwarding cannot leak credentials into URLs, redirects, output or cached replies", async () => {
  const response = await proxy({ fetcher: async (url, init) => {
    expect(url).toBe("https://api.example.test/me");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sentinel-session-token");
    return Response.json({ user: { ...user, secret: "sentinel-session-token" }, secret: "sentinel-session-token" });
  } }, 200);
  expect(await response.json()).toEqual({ user });
  for (const [status, expected] of [[301, 502], [302, 502], [307, 502], [308, 502], [401, 401], [403, 502], [429, 502], [500, 502], [503, 503], [504, 504]]) {
    await proxy({ fetcher: async () => new Response("sentinel-session-token", { status, headers: { location: "https://evil.example.test" } }) },
      expected, expected === 401 ? "Authentication required." : "Could not verify API identity.");
  }
});

test("byte boundary and broken stream produce safe upstream failures", async () => {
  const content = JSON.stringify({ user });
  const accepted = await proxy({ fetcher: async () => new Response(content + " ".repeat(16384 - content.length)) }, 200);
  expect(await accepted.json()).toEqual({ user });
  for (const body of [content + " ".repeat(16385 - content.length), "not json", "null", "{}", JSON.stringify({ user: { id: "org_A", email: null } })]) {
    await proxy({ fetcher: async () => new Response(body) }, 502, "Could not verify API identity.");
  }
  await proxy({ fetcher: async () => new Response(new ReadableStream({ start(controller) {
    controller.error(new Error("sentinel-session-token"));
  } })) }, 502, "Could not verify API identity.");
});

test("actual timeout signal bounds header and body waits", async () => {
  const began = Date.now();
  const header = proxy({ fetcher: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }) }, 504, "Could not verify API identity.");
  const body = proxy({ fetcher: async (_url, init) => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"user":'));
    init.signal!.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
  } })) }, 504, "Could not verify API identity.");
  await Promise.all([header, body]);
  expect(Date.now() - began).toBeGreaterThanOrEqual(4900);
  expect(Date.now() - began).toBeLessThan(6500);
}, 8000);
