import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { ModSummary } from "../src/lib/mods";

const blockingTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const TOTAL = 1_284;

const CATALOG = [
  ["Sodium", "jellysquid3", ["optimization"], "required", "unsupported", 84_300_000, "0.6.1"],
  ["Fabric API", "modmuss50", ["library"], "required", "required", 92_400_000, "0.116.0"],
  ["Iris Shaders", "coderbot", ["shaders", "optimization"], "required", "unsupported", 21_700_000, "1.8.4"],
  ["Create", "simibubi", ["technology", "utility"], "required", "required", 38_600_000, "6.0.4"],
  ["JEI", "mezz", ["utility"], "required", "required", 41_200_000, "19.27.0"],
  ["Jade", "Snownee", ["utility"], "optional", "required", 22_100_000, "15.3.0"],
  ["Cloth Config", "shedaniel", ["library"], "required", "required", 57_100_000, "15.0.140"],
  ["Xaero's Minimap", "xaero96", ["utility"], "required", "unsupported", 31_500_000, "24.2.0"],
  ["AppleSkin", "squeek502", ["food"], "required", "unsupported", 18_300_000, "3.0.6"],
  ["Terralith", "Starmute", ["worldgen"], "optional", "required", 14_800_000, "2.5.4"],
  ["FerriteCore", "malte0811", ["optimization"], "required", "required", 842_100, "7.0.1"],
  // Icon fallback, null author, null downloads and null latest version.
  ["Mosslight Decor", null, ["decoration"], "required", "unsupported", null, null],
  ["Lithium", "jellysquid3", ["optimization"], "required", "required", 36_400_000, "0.15.3"],
  ["Mod Menu", "Prospector", ["utility"], "required", "unsupported", 42_800_000, "11.0.3"],
  ["Roughly Enough Items", "shedaniel", ["utility"], "required", "required", 12_600_000, "16.0.4"],
  ["Architectury API", "shedaniel", ["library"], "required", "required", 64_200_000, "13.3.0"],
  ["Mouse Tweaks", "YaLTeR", ["utility"], "required", "unsupported", 9_100_000, "2.26"],
  ["Controlling", "Jaredlll08", ["utility"], "required", "unsupported", 7_800_000, "19.0.4"],
  ["Indium", "comp500", ["optimization"], "required", "unsupported", 6_400_000, "1.0.35"],
  ["Entity Culling", "tr7zw", ["optimization"], "required", "unsupported", 5_200_000, "1.7.1"],
] as const;

const icon = (index: number) =>
  index === 2
    ? "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='8'%20fill='%23C2410C'/%3E%3C/svg%3E"
    : null;

function summary(index: number, offset: number): ModSummary {
  const [title, author, categories, clientSide, serverSide, downloads, latestVersion] =
    CATALOG[(index + offset) % CATALOG.length];
  return {
    projectId: `project-${offset + index}`,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    description: `${title} description from the stubbed catalog response.`,
    iconUrl: icon(index),
    downloads,
    follows: downloads === null ? null : Math.round(downloads / 40),
    author,
    categories: [...categories],
    clientSide,
    serverSide,
    latestVersion,
  };
}

function pageOf(offset: number) {
  return {
    hits: Array.from({ length: 20 }, (_, index) => summary(index, offset)),
    total: TOTAL,
    offset,
  };
}

async function stubCatalog(page: Page) {
  await page.route("**/api/mods?*", async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? "0");
    await route.fulfill({ json: pageOf(offset) });
  });
}

/**
 * A request double for layout evidence — not authenticated proof.
 *
 * The harness builds and serves with the provider credentials cleared (spec
 * S15), so the real `/api/me` answers `503` and the frame would replace the
 * catalog with its unconfigured state. These two responses only let the
 * signed-in frame compose so its layout can be measured; they prove nothing
 * about sign-in. Acceptance items 1, 3 and 5 stay unobservable without a test
 * account (B4).
 *
 * Shapes are the parsers' own: the identity subject matches
 * `/^user_[A-Za-z0-9]+$/` and the group is a lowercase v4 uuid.
 */
const HARNESS_IDENTITY = { user: { id: "user_harness", email: "mara.reid@proton.me" } } as const;
const HARNESS_GROUP = {
  group: { id: "3f0c1a9e-7d2b-4c58-9a61-0d4e2b7c8f13", name: "Copper Hollow", role: "owner" },
} as const;

async function stubHarnessSession(page: Page) {
  await page.route("**/api/me", (route) => route.fulfill({ json: HARNESS_IDENTITY }));
  await page.route("**/api/groups/me", (route) => route.fulfill({ json: HARNESS_GROUP }));
}

// Every journey here opens `/mods`, which now lives inside the app frame, and
// the frame owns the catalog's presence. Installing the double once keeps each
// journey focused on what it asserts.
test.beforeEach(async ({ page }) => {
  await stubHarnessSession(page);
});

async function openBrowser(page: Page) {
  await stubCatalog(page);
  await page.goto("/mods?gameVersion=1.21.1&loader=fabric");
  await expect(page.getByRole("list", { name: "Mod results" })).toBeVisible();
}

function oversized(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        if (!element.getClientRects().length) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right > width + 1 || rect.left < -1);
      })
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
      .slice(0, 5);
  });
}

const viewports = [
  { label: "1440x900", width: 1440, height: 900 },
  { label: "768x1024", width: 768, height: 1024 },
  { label: "390x844", width: 390, height: 844 },
];

for (const viewport of viewports) {
  for (const theme of ["light", "dark"] as const) {
    test(`the ledger renders at ${viewport.label} in the ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openBrowser(page);

      // The frame owns the one skip link and puts it first in the document, so
      // the first Tab reaches it rather than walking the bar (spec S14).
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to results" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#mod-results")).toBeFocused();

      await expect(page.getByRole("heading", { level: 1, name: "Add mods" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Mod results" }).getByRole("button")).toHaveCount(20);
      await expect(page.getByText("1,284 results")).toBeVisible();
      await expect(page.getByRole("button", { name: "Add to pack" })).toBeVisible();

      if (theme === "dark") await page.getByRole("button", { name: "Dark theme" }).click();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /(^|\s)dark(\s|$)/ : /^(?!.*\bdark\b)/);
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).toBe(theme === "dark" ? "rgb(22, 18, 14)" : "rgb(251, 248, 244)");

      // Acceptance 10: one global bar carries one brand, one theme control and
      // the catalog's header is gone. The catalog used to draw all three again.
      await expect(page.getByRole("button", { name: "Dark theme" })).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Modpack Creator" })).toHaveCount(1);
      await expect(page.getByText("Modpack Creator", { exact: true })).toHaveCount(1);
      await expect(page.locator("header")).toHaveCount(1);

      // Acceptance 10: the title and the locked context appear once, in the
      // frame's context line. The filter sheet repeats the version and loader in
      // hidden markup, so the assertion is the exact line, not the bare strings.
      const contextLine = page.getByText(/^Pack · Minecraft 1\.21\.1 · Fabric$/);
      await expect(contextLine).toHaveCount(1);
      await expect(contextLine).toBeVisible();

      if (viewport.width === 1440) {
        await expect(page.locator("aside")).toBeVisible();
        await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeHidden();
        // Category and author appear from 1280 (spec S13).
        const sodium = page.getByRole("list", { name: "Mod results" }).getByRole("button", { name: /Sodium/ });
        await expect(sodium.getByText("Optimization")).toBeVisible();
        await expect(sodium.getByText("jellysquid3")).toBeVisible();
      }

      if (viewport.width === 768) {
        await expect(page.locator("aside")).toBeHidden();
        await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
      }

      if (viewport.width === 390) {
        // Acceptance 11: the strip under the bar holds the group only, and no
        // `Pending proposals` text exists anywhere (decision D2), while the
        // account menu keeps its own group entry (spec S13 keeps both).
        const strip = page.getByRole("navigation", { name: "Group" });
        await expect(strip).toBeVisible();
        await expect(strip.getByRole("link")).toHaveCount(1);
        await expect(strip.getByRole("link")).toHaveAccessibleName("Copper Hollow");
        await expect(strip.getByText("Pending proposals")).toHaveCount(0);
        await expect(page.getByText("Pending proposals")).toHaveCount(0);

        const chip = page.getByRole("button", { name: /Account menu/ });
        await chip.click();
        const menu = page.getByRole("group", { name: "Account" });
        await expect(menu).toBeVisible();
        await expect(menu.getByText("Copper Hollow")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(chip).toBeFocused();
      }

      expect(await oversized(page)).toEqual([]);
    });
  }
}

// Acceptance 11: the tablet widths keep the version and hide category and
// author. The frozen artboard's written rule says the opposite; spec S13 records
// the verified catalog behaviour, so this pins what the code does from 1024 to
// just below the 1280 breakpoint.
for (const width of [1024, 1279]) {
  test(`the row keeps the version and hides category and author at ${width}x900`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openBrowser(page);

    const row = page.getByRole("list", { name: "Mod results" }).getByRole("button", { name: /Sodium/ });
    await expect(row).toBeVisible();

    // The version column renders; category and author stay in the markup but are
    // not rendered (count first, so "hidden" cannot pass by absence).
    await expect(row.getByText("v0.6.1")).toBeVisible();
    await expect(row.getByText("Optimization")).toHaveCount(1);
    await expect(row.getByText("Optimization")).toBeHidden();
    await expect(row.getByText("jellysquid3")).toHaveCount(1);
    await expect(row.getByText("jellysquid3")).toBeHidden();

    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeHidden();

    expect(await oversized(page)).toEqual([]);
  });
}

// Spec S15: with the provider credentials cleared, the harness proves the
// unconfigured state. This journey replaces the session double with the 503 the
// build really answers, so that state stays observable next to the catalog ones.
test("the frame names the missing account provider instead of the catalog", async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 503, json: { error: "Accounts are not configured." } }),
  );
  await page.goto("/mods");

  await expect(page.getByText("Accounts are not available here")).toBeVisible();
  await expect(page.getByRole("list", { name: "Mod results" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveCount(1);
});

// Acceptance 8: the drawn views are measured against the approved artboard,
// not eyeballed. These are the values the comparison recorded; a change here
// means the screen moved away from the frozen reference.
test("the 1440 frame keeps the approved bar and results-head measurements", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBrowser(page);

  const measured = await page.evaluate(() => {
    const height = (element: Element | null) =>
      element === null ? null : Math.round(element.getBoundingClientRect().height * 10) / 10;
    const head = document.querySelector("#mod-results")?.previousElementSibling ?? null;
    const mark = document.querySelector('header a[aria-label="Modpack Creator"] svg');
    const rail = document.querySelector("aside");
    return {
      bar: height(document.querySelector("header")),
      theme: height(document.querySelector('header button[aria-label="Dark theme"]')),
      chip: height(document.querySelector("header button[aria-expanded]")),
      group: height(document.querySelector('nav[aria-label="Group"] a')),
      head: height(head),
      headMargin: head === null ? null : getComputedStyle(head).marginTop,
      rail: rail === null ? null : Math.round(rail.getBoundingClientRect().width),
      footer: height(document.querySelector("footer")),
      markColour: mark === null ? null : getComputedStyle(mark).color,
      note: head?.textContent?.includes("Sorted by relevance") ?? false,
    };
  });

  expect(measured).toEqual({
    bar: 60,
    theme: 32,
    chip: 36,
    group: 32,
    head: 40,
    headMargin: "10px",
    rail: 288,
    footer: 76,
    markColour: "rgb(28, 25, 23)",
    note: true,
  });
});

test("the 390 frame keeps the approved strip, bar and selected-row measurements", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBrowser(page);

  const measured = await page.evaluate(() => {
    const height = (element: Element | null) =>
      element === null ? null : Math.round(element.getBoundingClientRect().height * 10) / 10;
    const strip = document.querySelector("header + nav");
    return {
      bar: height(document.querySelector("header")),
      chip: height(document.querySelector("header button[aria-expanded]")),
      theme: height(document.querySelector('header button[aria-label="Dark theme"]')),
      strip: height(strip),
      group: height(strip?.querySelector("a") ?? null),
      footer: height(document.querySelector("footer")),
      head: height(document.querySelector("#mod-results")?.previousElementSibling ?? null),
    };
  });

  expect(measured).toEqual({ bar: 56, chip: 36, theme: 32, strip: 40, group: 30, footer: 68, head: 36 });

  const row = page.getByRole("list", { name: "Mod results" }).getByRole("button", { name: /Sodium/ });
  // The approved phone row carries the author and, once selected, the
  // `Selected` line; the artboard measures 76.5px for that state.
  await expect(row.getByText("jellysquid3")).toBeVisible();
  await row.click();
  await expect(row.getByText("Selected")).toBeVisible();
  const selectedHeight = await row.evaluate((element) => element.getBoundingClientRect().height);
  expect(selectedHeight).toBeCloseTo(76.5, 1);
});

test("the filter sheet closes when the scrim is pressed and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBrowser(page);

  const trigger = page.getByRole("button", { name: "Filters", exact: true });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();

  // The sheet stops at 82% of the viewport, so a point near the top is scrim.
  await page.mouse.click(10, 60);
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the theme toggle flips the whole view and records the choice the server reads", async ({ page }) => {
  await openBrowser(page);
  const toggle = page.getByRole("button", { name: "Dark theme" });

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(22, 18, 14)",
  );

  // Decision D4: one control, and the choice lives in the cookie the server
  // reads on the next visit, so the first paint is already the chosen theme.
  expect(await page.evaluate(() => document.cookie)).toContain("theme=dark");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(251, 248, 244)",
  );
  expect(await page.evaluate(() => document.cookie)).toContain("theme=light");
});

test("the initial load shows the skeleton until results arrive", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/mods?*", async (route) => {
    await gate;
    await route.fulfill({ json: pageOf(0) });
  });

  await page.goto("/mods");

  await expect(page.getByRole("status", { name: "Loading mods" })).toBeVisible();
  release();
  await expect(page.getByRole("list", { name: "Mod results" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading mods" })).toHaveCount(0);
});

test("an empty result names the problem and clears the filters", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/mods?*", async (route) => {
    requests += 1;
    const url = new URL(route.request().url());
    const filtered = url.searchParams.get("query") !== "" || url.searchParams.getAll("category").length > 0;
    await route.fulfill({
      json: filtered ? { hits: [], total: 0, offset: 0 } : pageOf(0),
    });
  });

  await page.goto("/mods");
  await page.getByRole("searchbox", { name: "Search", exact: true }).fill("no such mod");
  await expect(page.getByText("No mods match these filters")).toBeVisible();
  await expect(page.getByRole("list", { name: "Mod results" })).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("list", { name: "Mod results" })).toBeVisible();
  expect(requests).toBeGreaterThan(1);
});

test("the facet rail narrows the request and exposes removable chips", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/mods?*", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ json: pageOf(0) });
  });

  await page.goto("/mods");
  await expect(page.getByRole("list", { name: "Mod results" })).toBeVisible();

  await page.getByRole("button", { name: "Optimization", exact: true }).click();
  await expect.poll(() => requests.at(-1) ?? "").toContain("category=optimization");

  await page.getByRole("button", { name: "Client", exact: true }).click();
  await expect.poll(() => requests.at(-1) ?? "").toContain("environment=client");

  const chips = page.getByRole("group", { name: "Active filters" });
  await expect(chips.getByText("Optimization")).toBeVisible();
  await chips.getByRole("button", { name: "Remove Optimization category filter" }).click();
  await expect.poll(() => requests.at(-1) ?? "").not.toContain("category=optimization");
  await expect(chips.getByText("Optimization")).toHaveCount(0);
});

test("an upstream failure offers a retry that recovers", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/mods?*", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 502, json: { error: "Could not search the mod catalog." } });
      return;
    }
    await route.fulfill({ json: pageOf(0) });
  });

  await page.goto("/mods");

  const alert = page.getByRole("alert").filter({ hasText: "The mod catalog is unavailable." });
  await expect(alert).toContainText("The mod catalog is unavailable.");
  await expect(page.getByRole("list", { name: "Mod results" })).toHaveCount(0);

  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("list", { name: "Mod results" })).toBeVisible();
});

test("a failed reload drops the loaded rows and the error says so", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/mods?*", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ json: pageOf(0) });
      return;
    }
    await route.fulfill({ status: 502, json: { error: "Could not search the mod catalog." } });
  });

  await page.goto("/mods");
  await expect(page.getByRole("list", { name: "Mod results" })).toBeVisible();

  await page.getByRole("button", { name: "Optimization", exact: true }).click();

  const alert = page.getByRole("alert").filter({ hasText: "The mod catalog is unavailable." });
  await expect(alert).toContainText("the request failed and the previous results are gone");
  await expect(page.getByRole("list", { name: "Mod results" })).toHaveCount(0);
});

test("the end of the loaded page reports the total and loads the next page", async ({ page }) => {
  await openBrowser(page);

  await expect(page.getByText("Showing 20 of 1,284")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("list", { name: "Mod results" }).getByRole("button")).toHaveCount(40);
  await expect(page.getByText("Showing 40 of 1,284")).toBeVisible();
});

test("the null summary keeps every column and the icon falls back", async ({ page }) => {
  await openBrowser(page);

  const row = page.getByRole("list", { name: "Mod results" }).getByRole("button", { name: /Mosslight Decor/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("Unknown author")).toBeVisible();
  await expect(row.getByText("Downloads not listed")).toBeAttached();
  await expect(row.getByText("Latest version not listed")).toBeAttached();
  await expect(row.getByText("No icon available")).toBeAttached();
});

test("the selected row uses the card surface and enables the single copper action", async ({ page }) => {
  // The row animates its surface; reduced motion settles it before the snapshot.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBrowser(page);
  const rows = page.getByRole("list", { name: "Mod results" }).getByRole("button");
  const add = page.getByRole("button", { name: "Add to pack" });

  await expect(add).toBeDisabled();

  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("aria-pressed", "true");
  await expect(add).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("1 mod selected");

  const surface = await rows.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopColor };
  });
  expect(surface).toEqual({ background: "rgb(255, 255, 255)", border: "rgb(226, 217, 205)" });

  await add.click();
  await expect(page.getByRole("status")).toContainText("Pack editing is not connected yet.");

  await rows.first().click();
  await expect(add).toBeDisabled();
});

test("the facet sheet is reachable at 390x844 and leaves the top layer when the rail returns", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBrowser(page);

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("searchbox", { name: "Search", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Optimization/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Show 1,284 mods$/ })).toBeVisible();

  // The approved sheet shows the active filters above the facets, not only the
  // locked scope chips.
  await sheet.getByRole("button", { name: /Optimization/ }).first().click();
  await expect(sheet.getByRole("group", { name: "Active filters" }).getByText("Optimization")).toBeVisible();

  // The artboard aligns the chips with the field and the sections it sits
  // between; the sheet body's gutter is the only inset.
  const aligned = await page.evaluate(() => {
    const dialog = document.querySelector("#filter-sheet");
    if (dialog === null) return null;
    const chip = dialog.querySelector('[role="group"][aria-label="Active filters"] span');
    const field = dialog.querySelector('input[type="search"]');
    return chip === null || field === null
      ? null
      : Math.round(chip.getBoundingClientRect().x) === Math.round(field.getBoundingClientRect().x);
  });
  expect(aligned).toBe(true);

  // With a filter on, the approved sheet still keeps the last environment
  // option clear of the fixed foot; it must not be cut by the scroll edge.
  const clearance = await page.evaluate(() => {
    const dialog = document.querySelector("#filter-sheet");
    if (dialog === null) return null;
    const server = [...dialog.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Server");
    const foot = [...dialog.querySelectorAll("div")].filter((element) => element.className.includes("border-t")).at(-1);
    return server === undefined || foot === undefined
      ? null
      : Math.round(server.getBoundingClientRect().bottom) <= Math.round(foot.getBoundingClientRect().top);
  });
  expect(clearance).toBe(true);

  // Widening past the rail breakpoint must not leave a modal in the top layer.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("dialog")).not.toHaveAttribute("open", "");

  await page.setViewportSize({ width: 390, height: 844 });
  // The trigger's accessible name carries the active count once a filter is on.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close filters" }).click();
  await expect(sheet).toBeHidden();
});

for (const state of [
  { label: "1440x900 light", width: 1440, height: 900, dark: false, open: false },
  { label: "1440x900 dark", width: 1440, height: 900, dark: true, open: false },
  { label: "390x844 filters open", width: 390, height: 844, dark: false, open: true },
]) {
  test(`axe finds no serious or critical violation at ${state.label}`, async ({ page }) => {
    await page.setViewportSize({ width: state.width, height: state.height });
    // The themed and selected surfaces animate their colour for 150ms, so the
    // snapshot waits for the transition to settle before axe reads contrast.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openBrowser(page);
    if (state.dark) await page.getByRole("button", { name: "Dark theme" }).click();
    if (state.open) await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.waitForTimeout(250);

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
}
