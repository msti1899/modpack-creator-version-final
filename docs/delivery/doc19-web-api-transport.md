# doc19: Web-to-API transport guide

Date: 2026-11-15
Scope: documentation only. One guide describing how the web app reaches the Hono
API, one index entry and one handoff line. No application, test, migration or
configuration change.
Baseline: `main` at `0432b67`, working tree clean, verified before writing.

## Objective

Record the transport the web app already uses, because the code decided it and no
document did. A reader could not answer how a screen obtains data, where the
session token lives, or which limits apply to an outbound call.

The documented behaviour predates this record: `/api/me` and `/api/mods` were
delivered with the sign-in and mod browser slices (doc15, doc18), mirroring the
pattern fixed in doc14. This record adds the description, not the behaviour.

## Changes and rationale

- `docs/guides/web-api-transport.md` — the guide: the two handlers, the shared
  rules, configuration, the middleware trap, the checks that pin it, the steps for
  a new surface, and the deliberate limits.
- `docs/README.md` — the guide added to the documentation map.
- `docs/delivery/README.md` — this record added to the index.
- `docs/handoff.md` — delivery state updated with this record.

A guide was chosen over a decision record: the rules below describe implemented
behaviour, and the documentation conventions reserve decisions for accepted
choices with their rationale. Nothing here is a new choice.

The recorded shape: the browser calls a relative `/api/*` route on the Next server;
the server validates `API_URL`, attaches the Clerk session token where required and
calls the API with a five-second deadline, `redirect: "error"`, byte-capped reads and
`no-store` responses. No generic proxy exists; each surface owns its handler. Only
reads are proxied, so no browser mutation has a body-forwarding path yet.

## Verification

- Structural readback of every claim against the code on `0432b67`:
  `apps/web/src/app/api/me/route.ts`, `apps/web/src/app/api/mods/route.ts`,
  `apps/web/src/lib/identity.ts`, `apps/web/src/lib/mods.ts`,
  `apps/web/src/lib/middleware-response.ts`, `apps/web/src/proxy.ts`,
  `apps/web/src/components/mod-browser.tsx` and both `.env.example` files.
- Test inventory counted from the files themselves: 6 in `tests/identity.test.ts`,
  5 in `tests/middleware-response.test.ts`, 15 in `tests/lib/mods.test.ts`, 6 in
  `e2e/mods-contract.spec.ts`, 13 in `e2e/mods.spec.ts`. The guide states counts, so
  they were counted rather than estimated.
- Handler inventory confirmed by search: two route files under
  `apps/web/src/app/api`, both exporting `GET`, and no client call passing `method`.
- `bun run check` re-run on the changed tree: both typechecks, 197 Bun tests and 81
  Vitest tests, exit 0.
- Every relative link in the new guide checked by hand against the file tree. No
  markdown link checker exists in this repository, so that check is manual and this
  record does not claim tooling.
- Not run: browser journeys, because this change touches no code path they exercise.

## Delivery state

Documentation written and committed on `docs/web-api-transport`, cut from `main` at
`0432b67`. Publication and merge are recorded only when observed in the pull
request; this section is not updated to guess them.

## Remaining work

- The web has no shared client: each screen repeats the relative-fetch, error-state
  and no-retry logic. Whether to share one is an open choice, not a documented rule.
- A browser mutation has no transport yet. The first one needs a handler with a
  request body cap, which does not exist.
- The API-side counterpart, `docs/reference/backend-api.md`, documents endpoints and
  errors; it does not describe the web hop by design.

## References

- [How the web app reaches the API](../guides/web-api-transport.md)
- [doc14: Clerk middleware proxy loop](doc14-clerk-proxy-loop.md)
- [doc15: Web tooling and sign-in screen](doc15-web-tooling-signin.md)
- [doc18: Mod browser screen](doc18-mod-browser.md)
- [Backend API reference](../reference/backend-api.md)
