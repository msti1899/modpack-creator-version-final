import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const blockingTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("the public home page has no serious or critical accessibility violations", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page }).withTags(blockingTags).analyze();

  const blocking = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );

  expect(
    blocking,
    blocking
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`)
      .join("\n"),
  ).toEqual([]);
});

test("the public sign-in route has no serious or critical accessibility violations", async ({ page }) => {
  await page.goto("/sign-in");

  const results = await new AxeBuilder({ page }).withTags(blockingTags).analyze();

  const blocking = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );

  expect(
    blocking,
    blocking
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`)
      .join("\n"),
  ).toEqual([]);
});
