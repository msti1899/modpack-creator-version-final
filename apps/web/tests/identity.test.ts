import { expect, test } from "bun:test";
import { createIdentityProxy } from "../src/lib/identity";

const user = { id: "user_player", email: null };
const options = {
  enabled: true, apiUrl: "http://127.0.0.1:3001", getToken: async () => "session-token",
  fetcher: async (_url: string, _init: RequestInit) => Response.json({ user }),
};

test("web identity forwards the session only to the configured API and returns minimal identity", async () => {
  let calls = 0;
  const handler = createIdentityProxy({ ...options, fetcher: async (url, init) => {
    calls++;
    expect(url).toBe("http://127.0.0.1:3001/me");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer session-token");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ user, private: "hidden" });
  } });
  const response = await handler();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(calls).toBe(1);
});

test("unconfigured and signed-out web requests fail closed without contacting the API", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error("Unexpected API call"); };
  for (const config of [{ enabled: false }, { apiUrl: "https://evil.test/path" }, { apiUrl: "http://remote.test" },
    { apiUrl: "https://user:password@api.example.test" }]) {
    const response = await createIdentityProxy({ ...options, ...config, fetcher })();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  const response = await createIdentityProxy({ ...options, getToken: async () => null, fetcher })();
  expect(response.status).toBe(401);
  expect(calls).toBe(0);
});

test("web identity does not expose upstream errors and distinguishes failures from logout", async () => {
  for (const [status, expected] of [[401, 401], [503, 503], [429, 502], [500, 502], [504, 504]]) {
    const response = await createIdentityProxy({ ...options, fetcher: async () => new Response("private-token-detail", { status }) })();
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain("private-token-detail");
  }
  for (const [error, expected] of [[new Error("private-token-detail"), 502], [new DOMException("private-token-detail", "TimeoutError"), 504]] as const) {
    const response = await createIdentityProxy({ ...options, fetcher: async () => { throw error; } })();
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain("private-token-detail");
  }
});

test("web identity rejects malformed or oversized responses and keeps requests isolated", async () => {
  for (const value of [null, { user: {} }, { user: { ...user, email: {} } }, { user: { ...user, id: "org_other" } }]) {
    const response = await createIdentityProxy({ ...options, fetcher: async () => Response.json(value) })();
    expect(response.status).toBe(502);
  }
  expect((await createIdentityProxy({ ...options, fetcher: async () => new Response("x".repeat(16_385)) })()).status).toBe(502);
  const other = { id: "user_other", email: "other@example.test" };
  const responses = await Promise.all([createIdentityProxy(options)(), createIdentityProxy({ ...options, fetcher: async () => Response.json({ user: other }) })()]);
  expect(await responses[0].json()).toEqual({ user });
  expect(await responses[1].json()).toEqual({ user: other });
});

test("the actual web GET route returns unavailable before invoking unconfigured Clerk", async () => {
  const previous = process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_SECRET_KEY;
  try {
    const { GET } = await import("../src/app/api/me/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Authentication is not configured." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  } finally {
    if (previous === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = previous;
  }
});
