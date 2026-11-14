import { defineConfig, devices } from "@playwright/test";

const port = 3000;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The public journeys need no provider account, so the server runs with the
    // provider credentials cleared, the same configuration the Backend CI build
    // gate uses. Authenticated journeys need a Clerk test instance and are not
    // covered yet.
    command: `bun run build && bun run start --port ${port}`,
    url: `http://localhost:${port}`,
    env: { CLERK_SECRET_KEY: "", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
