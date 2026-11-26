import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads `apps/web/.env.local` and `apps/web/.env` into `process.env` for the keys
 * that are still unset.
 *
 * Next.js loads those files itself for the web server, and Bun loads
 * `apps/api/.env` for the API. The Playwright process is a third program, so it
 * has to read the same files itself, otherwise `bun run test:e2e:auth` only works
 * when the keys were exported by hand. Later files never override earlier ones
 * and nothing overrides the real environment, matching Next's precedence.
 */
export function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const target = path.join(__dirname, "..", "..", file);
    if (!existsSync(target)) continue;

    for (const line of readFileSync(target, "utf8").split(/\r?\n/)) {
      const entry = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!entry || entry[1].startsWith("#")) continue;
      const value = entry[2].replace(/^(["'])(.*)\1$/, "$2");
      if (process.env[entry[1]] === undefined) process.env[entry[1]] = value;
    }
  }
}

/**
 * Refuses to run the authenticated suite without a Clerk development instance.
 *
 * The suite creates and deletes real accounts on the provider. A production
 * instance would mean deleting real people's accounts, so the key prefixes are
 * checked before any provider call, the same guard `scripts/test-account-session.ts`
 * already uses.
 */
export function requireDevelopmentInstance(): { secretKey: string; publishableKey: string } {
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

  if (!secretKey || !publishableKey) {
    throw new Error(
      "The authenticated browser suite needs CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from a Clerk development instance, in the environment or in apps/web/.env.",
    );
  }
  if (!secretKey.startsWith("sk_test_") || !publishableKey.startsWith("pk_test_")) {
    throw new Error(
      "The authenticated browser suite creates and deletes test accounts, so it refuses keys that are not development-instance keys (sk_test_ / pk_test_).",
    );
  }

  return { secretKey, publishableKey };
}
