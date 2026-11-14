# doc15: Web tooling and sign-in screen

Date: 2026-11-14
Scope: the frontend stack, its test harness, the Copper Workshop palette and the
dedicated sign-in screen. No API, database or contract change.
Baseline: `main` at `2ea7af6` (merge of PR #72). Each slice branched from the
updated `main`, so no slice carried the conflicts of the earlier unpublished
`feat/frontend-tooling` branch.

## Objective

Deliver the frontend work that had stayed unpublished, split into reviewable
slices that merge on their own surface. The tooling had been installed and verified
on 2026-11-13 but never published; the sign-in screen was approved in the design
workflow on 2026-11-14. Both now ship as four pull requests plus this record.

## Changes and rationale

- **PR #73, the stack.** shadcn/ui with Radix and Lucide, `react-hook-form` with
  `zod`, TanStack Query, `tailwind-merge`, the Tailwind base layer with neutral
  tokens, the `cn` helper, a Button primitive, the `@/*` alias and the tracked
  generated `apps/web/AGENTS.md`.
- **PR #74, the harness.** Vitest with jsdom and React Testing Library, Playwright
  with axe-core, Lighthouse CI, and `bunfig.toml` with `[test] pathIgnorePatterns`
  for the Vitest and Playwright directories. That exclusion keeps the existing
  `bun test` gate green without editing the CI workflow, which needs a credential
  with the `workflow` scope. `bun run check` now runs both suites.
- **PR #75, the palette.** The approved Copper Workshop values replace the neutral
  palette, and the shell uses theme tokens instead of the zinc palette.
- **PR #76, the sign-in screen.** `/sign-in` and `/sso-callback`, dynamic so the
  public build never renders provider components outside `ClerkProvider`; the home
  account controls link to the screen; password reset sends Clerk's code and
  confirms on screen; account creation stays on the existing modal.

The earlier branch was not merged because it was cut from an older `main` and never
published; its documentation sweep and its duplicate copy of the Clerk proxy fix
were dropped in favour of the records already on `main` and
[doc14](doc14-clerk-proxy-loop.md).

## Verification

Observed on 2026-11-14, each slice before its merge:

| Slice | Checks |
| --- | --- |
| PR #73 | `bun run check` 170 tests, `bun run build`; CI pass in 41 s |
| PR #74 | 170 Bun, 7 Vitest, 3 Playwright tests; `bun run check`; CI pass in 48 s |
| PR #75 | 170 Bun, 7 Vitest; `bun run build`; CI pass in 46 s |
| PR #76 | 172 Bun, 15 Vitest, 4 Playwright tests including an axe scan of `/sign-in`; `bun run build`; CI pass in 48 s |

The Playwright run in PR #74 included an axe scan of `/sign-in` before that route
existed, so it scanned the 404 page; from PR #76 the same case covers the real
route. Not run: authenticated journeys (real password, Google, Discord) and a
Lighthouse run on the new shell.

On 2026-11-14 the configured build was opened in a real browser against the
development Clerk instance: `/sign-in` answered `200` with the Clerk email field and
the Google connection rendered, no "accounts unavailable" fallback and no console
error. That confirms the screen renders with the provider configured; signing in was
not attempted.

## Delivery state

All four slices are merged to `main`: #73 as `d1eb096`, #74 as `d4c7ea4`, #75 as
`8bb9606` and #76 as `6c7aa4a`. This record ships in its own pull request. No
deployment is recorded. The CI gate runs the Vitest suites through
`tests/web-suites.test.ts`; a dedicated workflow step still needs the `workflow`
credential scope, and the bridge should be removed with it.

## Remaining work

- Run the authenticated journeys with a real session, which needs a
  provider-reachable environment.
- Replace the Bun bridge with a `test:web` workflow step when a credential with the
  `workflow` scope is available.
- Re-run Lighthouse on the new shell if the historical numbers matter.
- Decide the fate of the unpublished `feat/frontend-tooling` branch, which now
  duplicates work already on `main`.

## References

- [Frontend tooling guide](../guides/frontend-tooling.md)
- [doc14: Clerk middleware proxy loop](doc14-clerk-proxy-loop.md)
- [Current handoff](../handoff.md)
- [Frontend tooling tasks](../../odd/tasks/frontend-tooling.md)
