import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import SignInPage, { metadata } from "../src/app/sign-in/page";

test("the sign-in page renders its card shell without a provider configuration", async () => {
  const keys = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"] as const;
  const previous = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];

  try {
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("<main");
    expect(html).toContain(">Sign in</h1>");
    expect(html).toContain("Accounts are unavailable until Clerk is configured for this deployment.");
    // The public build must not reach for the SDK: no provider, no credential widget.
    expect(html).not.toContain("Continue with Google");
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("the sign-in page names itself in the document metadata", () => {
  expect(metadata.title).toBe("Sign in · Modpack Creator");
});
