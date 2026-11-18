// Run in a fresh subprocess so SDK mocks cannot contaminate other tests.
// biome-ignore-all lint/correctness/noComponentHookFactories: the stubs stand in for the Clerk module inside `mock.module`, so they must be defined inside that factory.
import { mock } from "bun:test";
import { strict as assert } from "node:assert";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
let signedIn = false;
mock.module("next/headers", () => ({
  // Outside a request there is no cookie store; the layout must still compose.
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
mock.module("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    (when === "signed-in") === signedIn ? children : null,
  // The home page links to the dedicated screen; it no longer opens a modal.
  SignUpButton: ({ children, mode }: { children: ReactNode; mode: string }) => {
    assert.equal(mode, "modal"); return children;
  },
  UserButton: () => <button type="button" aria-label="Account settings">Account settings</button>,
  ClerkProvider: ({ children, ...options }: { children: ReactNode; [key: string]: unknown }) => {
    assert.equal(options.afterSignOutUrl, "/");
    assert.equal(options.signInFallbackRedirectUrl, "/");
    assert.equal(options.signUpFallbackRedirectUrl, "/");
    return <div data-testid="provider">{children}</div>;
  },
}));
const { default: Home } = await import("../../src/app/page");
const { default: Layout } = await import("../../src/app/layout");
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_fixture";
process.env.CLERK_SECRET_KEY = "server-secret-sentinel";
for (signedIn of [false, true]) {
  const html = renderToStaticMarkup(await Layout({ children: <Home /> }));
  assert.ok(html.includes('data-testid="provider"'));
  assert.equal(html.includes('href="/sign-in"'), !signedIn);
  assert.equal(html.includes(">Sign in</a>"), !signedIn);
  assert.equal(html.includes(">Create account</button>"), !signedIn);
  assert.equal(html.includes('aria-label="Account settings"'), signedIn);
  assert.equal(html.includes('href="/api/me"'), signedIn);
  assert.ok(!html.includes("server-secret-sentinel"));
}
for (const key of ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]) {
  const value = process.env[key]; delete process.env[key];
  const html = renderToStaticMarkup(await Layout({ children: <Home /> }));
  assert.ok(!html.includes('data-testid="provider"'));
  assert.ok(html.includes("Configure Clerk to enable sign-in."));
  process.env[key] = value;
}
console.log("Configured controls composition passed (isolated SDK doubles; not provider login).");
