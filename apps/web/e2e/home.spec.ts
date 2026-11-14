import { expect, test } from "@playwright/test";

test("the public home page renders its scaffold landmarks", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Modpack Creator/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Modpack Creator");
  await expect(page.getByText("Project scaffold is ready.")).toBeVisible();
});
