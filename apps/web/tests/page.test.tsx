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
