# Mod browser screen

Date: 2026-11-14. Branch `feat/mod-browser`, cut from `origin/main` at `aad3ae3` in its own
worktree, fast-forwarded to `afea8bf` when `main` moved. Task record:
[mod browser tasks](../../odd/tasks/mod-browser.md).

## Outcome

`/mods` is the first product screen on the web beyond sign-in. It browses the merged
Modrinth catalog API for the pack's locked Minecraft version and loader, with a text
query, category, environment and author facets, five sort orders, 20 results per page
with a total, row selection, and the four states the design calls for: loading, no
results, upstream failure with retry, and end of results with load more. Light and dark
themes render from one root scope.

The approved direction was "Catalog ledger" (round `v1`, variant A), approved as `A1`
with the reference copy frozen read-only before any application code was written. The
screen follows the Copper Workshop design system: one copper action per view, stone
only for status, paired surface/foreground text, hairline borders, one type family.

## What changed

- `apps/web/src/lib/mods.ts` — the `ModSummary` contract with the API's exact field
  names and nullability, a validated builder for the eight accepted query parameters,
  count formatting and null handling.
- `apps/web/src/app/api/mods/route.ts` — a server proxy. The API sends no CORS headers,
  so the browser never calls it directly. The handler follows the `/api/me` idiom:
  `no-store`, a 5-second abort, `{ error }` JSON, 400 for an unknown or invalid
  parameter before anything is forwarded.
- `apps/web/src/app/mods/page.tsx` — the server page. It reads `gameVersion` and
  `loader` from its own search parameters with `1.21.1` and `fabric` as defaults, and
  holds no pack state.
- `apps/web/src/components/mod-browser.tsx` — the client screen: facet rail, ledger,
  selection, sticky footer and the theme toggle.

## What was checked

- `bun run check`: both typechecks, 173 Bun tests and 81 Vitest tests, observed twice —
  once by the implementer and once by the orchestrator.
- `bun run --filter @modpack/web test:e2e`: 29 browser cases, including six
  viewport-and-theme renders, the four states, the theme round trip, the facet sheet at
  390px, three axe runs and six proxy-rejection cases.
- Workflow gates through the CLI at `192f36b`: `impl`, `qa` and `delivery` all PASS with
  their command logs recorded as evidence, then `close` recorded `delivered`.
- Independent verification returned PASS with no blocker. It reproduced the three
  commands, proved the proxy rejects unknown and invalid parameters locally instead of
  forwarding them, confirmed a 504 at 5006 ms on a stalled upstream, confirmed that the
  primary action issues no request and writes no storage, and compared the
  implementation against the frozen reference at three viewports in both themes.
- Observed one correction round: the error copy claimed the existing results were
  unchanged while the rows were already cleared, and the axe assertion sampled a 150 ms
  colour transition and could fail intermittently. Both were fixed at `192f36b`, and the
  mods spec was run three times in a row with its axe cases green each time.

## Accepted differences

Recorded by the implementer and accepted by independent verification:

- No pack name, breadcrumb, back control or "In pack" badge: the web holds no pack
  state. Pack editing is not connected, and the primary action says so.
- No facet totals and a 12-item category list behind "Show all 12", because `GET /mods`
  exposes no facet counts.
- Sort is a styled native select instead of a custom listbox; the control geometry
  differs by a few pixels.
- The eight-column ledger begins at `xl` (1280px) rather than the reference's 1180px,
  because Tailwind breakpoints live in `globals.css`.
- Error and empty copy differ where the web can fail by timeout or transport rather than
  by an upstream payload.

## Remaining work

- The branch is committed but not pushed, and no pull request exists. Publication is an
  owner decision.
- `/mods/:idOrSlug` is proxied by nothing: the screen needs no detail surface, so the
  proxy covers only the search route.
- Pack wiring is absent by design: selecting a mod does not add it to a draft, and no
  draft is read.
- The Minecraft and loader values come from the page's own search parameters with
  defaults. Where the pack's real settings should come from is still undecided.
- The selector data source, the exact-version picker and caller-selected page size
  remain undecided product questions.
- The screen was exercised in Chromium only, against a stubbed `/mods` and against a
  dev-mode smoke run; no real upstream call and no hosted journey was recorded.
- Two advisories were left as recorded: `/mods` with an invalid `gameVersion` silently
  renders the defaults while the API path answers 400, and the reference copy itself
  carries canvas drag offsets.

## Tooling change outside the product

The workflow audit read `<root>/.git/info/exclude`, which does not exist in a linked
worktree because `.git` is a file there. `bin/audit.ts` now resolves the path through
`git rev-parse --git-path info/exclude` and falls back to the previous location, so the
audit and `close` work from a worktree. The audit then passed all five checks.
