import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("local database configuration disables first-party authentication and email capture", () => {
  const config = Bun.TOML.parse(readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8")) as {
    auth: { enable_signup?: boolean; enable_anonymous_sign_ins?: boolean; email?: { enabled?: boolean }; sms?: { enabled?: boolean } };
    local_smtp: { enabled?: boolean };
  };
  expect(config.auth.enable_signup).toBe(false);
  expect(config.auth.enable_anonymous_sign_ins).toBe(false);
  expect(config.auth.email?.enabled).toBe(false);
  expect(config.auth.sms?.enabled).toBe(false);
  expect(config.local_smtp.enabled).toBe(false);
});
