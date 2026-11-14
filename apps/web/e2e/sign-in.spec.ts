import { expect, test } from "@playwright/test";

test("the public sign-in route renders its shell when accounts are not configured", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page).toHaveTitle(/Sign in · Modpack Creator/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Accounts are unavailable until Clerk is configured for this deployment."),
  ).toBeVisible();
  // The public build must not render provider buttons that cannot work.
  await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(0);
});
