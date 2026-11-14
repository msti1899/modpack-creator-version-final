import { describe, expect, it } from "bun:test";
import { withoutSelfRewrite } from "../src/lib/middleware-response";

const requestUrl = "http://localhost:3000/";

function rewritten(url: string) {
  return new Response(null, {
    headers: {
      "x-middleware-rewrite": url,
      "x-middleware-override-headers": "x-clerk-auth-status",
      "x-middleware-request-x-clerk-auth-status": "signed-out",
    },
  });
}

describe("withoutSelfRewrite", () => {
  it("turns Clerk's same-URL rewrite into a pass-through and keeps the request headers", () => {
    const response = withoutSelfRewrite(requestUrl, rewritten(requestUrl));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-clerk-auth-status")).toBe("signed-out");
  });

  it("ignores the protocol a TLS-terminating proxy reports", () => {
    const response = withoutSelfRewrite("https://localhost:3000/", rewritten(requestUrl));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves a rewrite to a different path untouched", () => {
    const response = withoutSelfRewrite(requestUrl, rewritten("http://localhost:3000/profile"));

    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/profile");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("leaves a rewrite to a different host untouched", () => {
    const response = withoutSelfRewrite(requestUrl, rewritten("http://127.0.0.1:3000/"));

    expect(response.headers.get("x-middleware-rewrite")).toBe("http://127.0.0.1:3000/");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("leaves a response without a rewrite untouched", () => {
    const response = withoutSelfRewrite(requestUrl, new Response(null));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });
});
