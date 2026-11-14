const { existsSync, readdirSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

// Lighthouse needs a Chrome binary. No system Chrome is installed, so reuse the
// Playwright one. CHROME_PATH always wins when the caller sets it.
if (!process.env.CHROME_PATH) {
  const root = join(homedir(), ".cache", "ms-playwright");
  const candidates = existsSync(root)
    ? readdirSync(root)
        .filter((entry) => entry.startsWith("chromium-"))
        .sort()
        .reverse()
        .map((entry) => join(root, entry, "chrome-linux64", "chrome"))
    : [];
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (chrome) process.env.CHROME_PATH = chrome;
}

// Same reason as the Playwright web server: the audit covers the public
// configuration, which needs no provider account.
process.env.CLERK_SECRET_KEY = "";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";

module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3000/"],
      startServerCommand: "bun run start --port 3000",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 60_000,
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
      },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:performance": ["warn", { minScore: 0.8 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
