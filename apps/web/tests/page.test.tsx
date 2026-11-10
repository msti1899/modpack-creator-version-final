import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";

test("the starter page renders the project name", () => {
  const html = renderToStaticMarkup(<Home />);

  expect(html).toContain("<main");
  expect(html).toContain("Modpack Creator");
  expect(html).toContain("Project scaffold is ready.");
});

test("the public page explains missing auth setup without rendering a broken sign-in widget", () => {
  const previous = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  try {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Configure Clerk to enable sign-in.");
    expect(html).not.toContain("session-token");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previous;
  }
});

// Provider doubles prove application composition, not Clerk's dialogs or login.
test("configured account states and missing-key gates compose in isolation", () => {
  const probe = Bun.spawnSync([process.execPath, "run", "apps/web/tests/fixtures/clerk-controls-probe.tsx"], {
    cwd: new URL("../../..", import.meta.url).pathname,
    timeout: 10_000,
  });
  expect(probe.exitCode).toBe(0);
  expect(probe.stderr.toString()).toBe("");
  expect(probe.stdout.toString()).toContain("Configured controls composition passed");
});
