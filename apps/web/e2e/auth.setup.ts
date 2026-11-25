import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import { createTestAccount, deleteRecordedAccount, storageStateFile } from "./support/clerk-test-account";

/**
 * Prepares one signed-in browser state for the authenticated project.
 *
 * The account is created here and deleted by `auth.teardown.ts`, so a normal run
 * leaves the Clerk instance exactly as it found it.
 */
setup.describe.configure({ mode: "serial" });

setup("create a test account and save its signed-in state", async ({ page }) => {
  const account = await createTestAccount();

  try {
    await clerkSetup({
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
      dotenv: false,
    });

    await page.goto("/");
    await clerk.signIn({ page, emailAddress: account.emailAddress });

    // Prove the whole chain once, here: the browser session this state captures
    // is the same identity the API verifies. A spec that only rendered the page
    // could pass while the API path stayed broken.
    const identity = await page.goto("/api/me");
    if (!identity) throw new Error("GET /api/me produced no response.");
    expect(identity.status()).toBe(200);
    const body = (await identity.json()) as { user: { id: string } };
    expect(body.user.id).toBe(account.id);

    await page.context().storageState({ path: storageStateFile });
  } catch (error) {
    await deleteRecordedAccount();
    throw error;
  }
});
