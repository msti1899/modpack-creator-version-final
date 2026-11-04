import { expect, test } from "bun:test";
import app from "../src/index";

test("GET /health reports a healthy API", async () => {
  const response = await app.request("/health");

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ status: "ok", service: "modpack-api" });
});

test("unknown routes return 404", async () => {
  const response = await app.request("/does-not-exist");

  expect(response.status).toBe(404);
});
