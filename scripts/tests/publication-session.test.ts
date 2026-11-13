import { expect, test } from "bun:test";
import { join } from "node:path";

// The hosted live check mutates accounts and hosted rows, so its guards are the only
// thing that can be tested without authorization. Each refusal must happen before any
// network call and must print to stderr only.
const script = join(import.meta.dir, "../test-publication-session.ts");

function run(args: string[], env: Record<string, string>) {
  const result = Bun.spawnSync([process.execPath, script, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env }, stdout: "pipe", stderr: "pipe",
  });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

test("the live publication check refuses unsafe invocations before any network call", () => {
  const missing = run([], {});
  expect(missing.code).toBe(2);
  expect(missing.err).toContain("pass --live");
  expect(missing.out).toBe("");

  const liveSecret = run(["--live"], { CLERK_SECRET_KEY: "sk_live_fake" });
  expect(liveSecret.code).toBe(2);
  expect(liveSecret.err).toContain("development-instance key");

  const local = run(["--live"], {
    CLERK_SECRET_KEY: "sk_test_fake", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fake",
    SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  });
  expect(local.code).toBe(2);
  expect(local.err).toContain("SUPABASE_URL must be the hosted project");
  expect(local.out).toBe("");
});
