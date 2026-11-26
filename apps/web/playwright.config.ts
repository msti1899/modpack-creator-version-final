import { defineConfig, devices } from "@playwright/test";
import { loadLocalEnv, requireDevelopmentInstance } from "./e2e/support/clerk-env";

const port = 3000;
const apiPort = 3001;

/**
 * Two modes, chosen by `PLAYWRIGHT_AUTH`.
 *
 * Default (`bun run test:e2e`): the public journeys. The web server runs with the
 * provider credentials cleared, so CI needs no Clerk instance and no secret. This
 * is the mode the Frontend CI browser job uses.
 *
 * Authenticated (`bun run test:e2e:auth`): creates one throwaway account in a
 * Clerk development instance, signs in, saves the browser state and runs the
 * journeys under `e2e/authenticated`. It also starts the API, because those
 * journeys reach it. It is deliberately not a CI gate: CI has no deployed API and
 * no provider secret, and the run mutates provider state. See
 * docs/decisions/0007-authenticated-e2e-account.md.
 */
const authenticated = process.env.PLAYWRIGHT_AUTH === "1";

if (authenticated) {
  loadLocalEnv();
  requireDevelopmentInstance();
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    // Next 16 blocks its development resources for 127.0.0.1, which leaves the
    // page unhydrated. Always drive the app through localhost.
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: authenticated
    ? [
        {
          // Signs in and writes the state the authenticated project reuses.
          name: "auth-setup",
          testMatch: /auth\.setup\.ts/,
        },
        {
          name: "authenticated",
          testMatch: /authenticated\/.*\.spec\.ts/,
          dependencies: ["auth-setup"],
          use: { ...devices["Desktop Chrome"], storageState: "./e2e/.auth/state.json" },
        },
      ]
    : [
        {
          name: "chromium",
          testIgnore: /auth\.(setup|teardown)\.ts|authenticated\//,
          use: { ...devices["Desktop Chrome"] },
        },
      ],
  // Deletes the account on success and on failure. A no-op in the public mode.
  globalTeardown: "./e2e/auth.teardown.ts",
  webServer: authenticated
    ? [
        {
          // The authenticated journeys read the API, so it must be up. A running
          // development API is reused; its own `apps/api/.env` supplies the Clerk
          // verification key and the database connection.
          command: "bun run --filter @modpack/api start",
          url: `http://127.0.0.1:${apiPort}/me`,
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          // Built with the provider credentials, so the pages load Clerk. A
          // development server on port 3000 must be stopped first: it was built
          // without them and would answer for the authenticated journeys.
          command: `bun run build && bun run start --port ${port}`,
          url: `http://localhost:${port}`,
          reuseExistingServer: false,
          timeout: 240_000,
        },
      ]
    : [
        {
          // The public journeys need no provider account, so the server runs with
          // the provider credentials cleared, the same configuration the Backend
          // CI build gate uses.
          command: `bun run build && bun run start --port ${port}`,
          url: `http://localhost:${port}`,
          env: { CLERK_SECRET_KEY: "", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "" },
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      ],
});
