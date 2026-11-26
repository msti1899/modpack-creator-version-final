import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Pins the two modes of `playwright.config.ts`.
 *
 * The public mode is what CI runs, so a change that starts the API, loads a
 * provider key or stops clearing the two Clerk variables must fail here instead of
 * in the browser job. The authenticated mode is owner-run, so its selection rules
 * are pinned the same way and never depend on a provider call.
 */

let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  snapshot = { ...process.env };
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of Object.keys(process.env)) if (!(key in snapshot)) delete process.env[key];
  Object.assign(process.env, snapshot);
  vi.resetModules();
});

describe("playwright mode selection", () => {
  test("public mode runs only the public project with provider credentials cleared", async () => {
    vi.stubEnv("PLAYWRIGHT_AUTH", "");
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");
    const projects = config.projects ?? [];
    expect(projects.map((project) => project.name)).toEqual(["chromium"]);

    const ignore = projects[0].testIgnore as RegExp;
    expect(ignore.test("authenticated/account-session.spec.ts")).toBe(true);
    expect(ignore.test("auth.setup.ts")).toBe(true);
    expect(ignore.test("home.spec.ts")).toBe(false);

    const servers = config.webServer;
    const server = Array.isArray(servers) ? servers[0] : servers;
    expect(server?.env).toEqual({ CLERK_SECRET_KEY: "", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "" });
  });

  test("authenticated mode runs setup then the authenticated specs with the saved state", async () => {
    vi.stubEnv("PLAYWRIGHT_AUTH", "1");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_unit");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_unit");
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");
    const projects = config.projects ?? [];
    expect(projects.map((project) => project.name)).toEqual(["auth-setup", "authenticated"]);
    expect(projects[1].dependencies).toEqual(["auth-setup"]);
    expect(projects[1].use?.storageState).toBe("./e2e/.auth/state.json");

    const match = projects[1].testMatch as RegExp;
    expect(match.test("authenticated/account-session.spec.ts")).toBe(true);
    expect(match.test("home.spec.ts")).toBe(false);
    expect(Array.isArray(config.webServer)).toBe(true);
  });

  test("refuses to load the authenticated mode without both provider keys", async () => {
    vi.stubEnv("PLAYWRIGHT_AUTH", "1");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.resetModules();

    await expect(import("../../playwright.config")).rejects.toThrow(/needs CLERK_SECRET_KEY/);
  });

  test("refuses provider keys that are not development-instance keys", async () => {
    vi.stubEnv("PLAYWRIGHT_AUTH", "1");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_unit");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_unit");
    vi.resetModules();

    await expect(import("../../playwright.config")).rejects.toThrow(/development-instance keys/);
  });
});
