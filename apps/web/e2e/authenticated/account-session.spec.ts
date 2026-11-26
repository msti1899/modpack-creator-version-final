import { expect, test } from "@playwright/test";
import { readTestAccount } from "../support/clerk-test-account";

/**
 * The first authenticated journey: a signed-in person reaches the account
 * surface, and the session the browser holds is the identity the API verifies.
 *
 * It runs against a real Clerk development instance and a real API, so it is the
 * proof that the mechanism works at all. Later journeys build on this state
 * instead of repeating the sign-in.
 */
test("a signed-in person reaches the account surface and the API knows the same identity", async ({ page }) => {
  const account = await readTestAccount();

  await page.goto("/");

  const accountControls = page.getByRole("navigation", { name: "Account" });
  await expect(accountControls).toBeVisible();
  await expect(accountControls.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(accountControls.getByRole("link", { name: "Check API session" })).toBeVisible();
  await expect(page.getByText("Configure Clerk to enable sign-in.")).toHaveCount(0);

  const identity = await page.request.get("/api/me");
  expect(identity.status()).toBe(200);
  expect(identity.headers()["cache-control"]).toBe("no-store");
  expect((await identity.json()).user.id).toBe(account.id);
});
