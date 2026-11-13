# Catalog discovery contract (completion plan M3)

Objective: turn `GET /mods` into a complete, predictable discovery contract without
adding a client. Scope and delivery order were recorded in
[the completion plan](../../docs/plans/backend-completion.md) on 2026-11-13.
Base: `main` at `6a552bf`. Branch: `feat/catalog-discovery`.
Route: inline. Runner: Bun 1.4.4, `bun run check`.
Delivery: one reviewable slice on the feature branch. Publication and merge are
separate decisions and are not authorized.

## Specs

- S1: Existing search behavior is pinned without change. `GET /mods` sends exactly
  the facets `[["project_type:mod"], ["categories:<loader>"], ["versions:<gameVersion>"]]`,
  a fixed page size of 20, and accepts `offset` only as digits in `0..10000`.
  Missing or invalid `gameVersion`/`loader`, an invalid `offset`, a query longer than
  100 characters or one containing control characters return 400 before any upstream
  request. An upstream 429/5xx or malformed body returns 502, an upstream timeout
  returns 504, and both carry a JSON `error` string. Empty results return
  `{"hits": [], "total": 0, "offset": <offset>}` with status 200.
- S2: An unknown query parameter returns 400 `Invalid query parameter.` instead of
  being silently ignored.
- S3: `sort` accepts `relevance` (default), `downloads`, `follows`, `newest` and
  `updated`, forwarded as the upstream `index` parameter. Any other value returns 400.
- S4: `category` is repeatable or comma-separated, each value matching
  `^[a-z0-9-]{1,64}$`. Requested categories form one facet group (union among
  themselves) and are ANDed with the loader and Minecraft version groups. An invalid
  value returns 400.
- S5: `environment` accepts `client` or `server`. `client` matches
  `client_side:required` OR `client_side:optional`; `server` matches the same pair on
  `server_side`. Any other value returns 400. The filter means "runs on that side",
  not "exclusive to that side"; precise per-side support travels in the payload.
- S6: `author` matches `^[A-Za-z0-9_-]{1,64}$` and is forwarded as the facet
  `author:<value>`. An invalid value returns 400.
- S7: `GET /mods/:idOrSlug` returns the same summary projection as one search hit for
  a single project. An unknown project returns 404 `Mod not found.`; an upstream
  failure returns 502 and is never reported as not-found.
- S8: Each hit also carries `iconUrl`, `downloads`, `follows`, `author`, `categories`,
  `clientSide`, `serverSide` and `latestVersion`. An absent upstream field normalizes
  to `null` (or `[]` for `categories`) rather than failing the request; a present but
  malformed field returns 502. A full page of 20 hits with realistic maximum-length
  values stays under 32 KiB.

Not in scope, per the recorded decision: caller-selected page size, selector data for
Minecraft/loader options, an exact-version picker, and any UI.

## Tasks

- T1 [S1] inline — complete. Pinning tests live in
  `apps/api/tests/catalog-discovery.test.ts`; the page-size and offset-bound pins were
  both shown to fail when the behavior they guard was mutated.
- T2–T6 [S2–S6] inline — complete in one work unit, because the unknown-parameter
  guard and all four filters modify the same validation path in
  `apps/api/src/modrinth.ts`; a per-filter split would have been cosmetic. RED was
  observed for each filter's assertions before the implementation.
  Risk: item 3 (public API query contract).
  Evidence: `bun test` passes 142 tests and 2549 assertions with both typechecks.
- T7 [S7] inline — exact project lookup route.
- T8 [S8] inline — enriched hit payload, response-size measurement, reference and
  guide updates, golden-hash recapture in the public regression test.

## Log

- 2026-11-13: Owner authorized implementing M3. Scope and internal delivery order come
  from the recorded plan decision; no UI, no page-size parameter and no version picker
  are added.
