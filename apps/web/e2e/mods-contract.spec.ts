import { expect, test } from "@playwright/test";

// Every query here fails the proxy's own validation, so a 400 proves the request
// never left the web app: a forwarded request would answer 502 against the
// unconfigured catalog address.
const REJECTED_QUERIES = [
  "foo=bar", // unknown parameter
  "limit=20", // page size is not caller-selectable
  "sort=top", // outside the allowed sort set
  "loader=vanilla", // outside the allowed loader set
  "offset=10001", // past the maximum offset
  "query=a&query=b", // a single-value parameter repeated
];

for (const query of REJECTED_QUERIES) {
  test(`the proxy rejects /api/mods?${query} locally`, async ({ request }) => {
    const response = await request.get(`/api/mods?${query}`);
    expect(response.status()).toBe(400);

    const body = (await response.json()) as { error?: unknown };
    const error = typeof body.error === "string" ? body.error.trim() : "";
    expect(error, "the proxy must explain the rejection").not.toBe("");
  });
}
