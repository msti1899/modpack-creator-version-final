import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";

test("the starter page renders the project name", () => {
  const html = renderToStaticMarkup(<Home />);

  expect(html).toContain("<main");
  expect(html).toContain("Modpack Creator");
  expect(html).toContain("Project scaffold is ready.");
});
