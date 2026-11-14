# Frontend tooling and sign-in delivery

Delivery strategy: `ask-on-risk`, sliced into four pull requests so each merges on
its own surface. Test runners: `bun test` for the Bun suites (API, root `tests/`,
`scripts/tests/` and `apps/web/tests`), Vitest for component and hook suites,
Playwright for browser journeys.

Objective: publish the frontend stack that was installed on 2026-11-13, the
approved sign-in screen and their documentation, without carrying the conflicts of
the unpublished branch they originally lived on.

## Specs

- **S1 — Published stack.** `main` carries shadcn/ui with Radix, `lucide-react`,
  `react-hook-form` with `zod`, `@tanstack/react-query`, `tailwind-merge`, the
  `cn` helper and the `@/*` alias. No backend, database or contract change.
- **S2 — Test harness on two runners.** Vitest with jsdom and React Testing Library
  owns `apps/web/tests/ui` and `apps/web/tests/lib`; Playwright with axe-core owns
  `apps/web/e2e`; Bun keeps every existing suite. `bunfig.toml` carries the
  exclusion so bare `bun test` stays green without a CI workflow change.
- **S3 — Check covers both suites.** `bun run check` runs both typechecks, the Bun
  suites and the Vitest suites.
- **S4 — Approved palette.** The Copper Workshop values replace the neutral shadcn
  palette, and the shell uses theme tokens.
- **S5 — Sign-in screen.** `/sign-in` and `/sso-callback` render the approved
  composition, stay dynamic so the public build never renders provider components
  outside `ClerkProvider`, and explain when accounts are unavailable. Account
  creation stays on the existing modal.
- **S6 — Verification is an observed run.** Each slice records its Bun, Vitest,
  Playwright, build and CI results before merge. Authenticated journeys that need a
  provider-reachable environment are recorded as missing, not claimed.
- **S7 — Records.** A guide, this task log, a numbered delivery record and the
  handoff checkpoint describe the configuration, the evidence and the open items.

## Tasks

| ID | Spec | Route | State |
| --- | --- | --- | --- |
| T1 | S1 | inline | Done in PR #73, merge `d1eb096` |
| T2 | S2, S3 | inline | Done in PR #74, merge `d4c7ea4` |
| T3 | S4 | inline | Done in PR #75, merge `8bb9606` |
| T4 | S5 | inline | Done in PR #76, merge `6c7aa4a` |
| T5 | S6, S7 | inline | Done in the delivery-record pull request |

## Log

- **L1, 2026-11-14.** The frontend tooling and the sign-in screen were requested as
  a publishable outcome. The existing `feat/frontend-tooling` branch was 10 commits
  behind `main`, had never been pushed, and merged with conflicts in the handoff,
  the delivery index, the completion plan and the duplicated middleware fix. The
  work was therefore republished in slices cut from the current `main`.
- **L2, 2026-11-14.** `bunfig.toml` was preferred over editing the CI workflow:
  Bun 1.4.4 honours `[test] pathIgnorePatterns`, so the web suites stay out of the
  Bun gate while the workflow file, which needs the `workflow` token scope, stays
  untouched. Adding `test:web` to CI remains open work.
- **L3, 2026-11-14.** The palette slice landed after the stack so its diff contains
  only the approved values; the sign-in slice landed last because it depends on both
  and changes the home account controls, which a pinned shell test follows.
- **L4, 2026-11-14.** The Playwright harness slice shipped an axe case for
  `/sign-in` before that route existed, so the case scanned the 404 page until the
  sign-in slice landed. No result was claimed from it in between.
