# Task record: trustworthy database and integration CI

Source: [Backend completion plan, M10](../../docs/plans/backend-completion.md), board item
#101.

## Specs

- S1. CI runs the pgTAP suites, the multi-session concurrency checks and the signed-token
  PostgREST checks against a disposable local stack on every pull request and on `main`.
- S2. The stack stops even when a step fails, so a runner never keeps a database behind.
- S3. A race proves overlap instead of assuming it: the contender's session is observed
  waiting on a lock before the holder is allowed to finish, and a race that never overlapped
  fails the run rather than passing on a timing accident.
- S4. Race fixtures carry a per-run token, so two runs and leftover rows cannot collide, and
  cleanup touches only rows carrying that token. A cleanup failure fails the run, and the run
  verifies that no fixture survived.
- S5. Every SQL suite reports one TAP result per check, with the plan matching the count, so a
  failure names the check that failed instead of the whole file.

## Tasks

- T1, route S1-S2: new Database CI workflow that starts the local stack, runs the three
  runners and stops the stack in an always-step.
- T2, route S3-S4: barrier-based race, per-run fixtures and failing cleanup in
  `scripts/test-concurrency.ts`.
- T3, route S5: convert the three `plan(1)` suites to per-check assertions.
- T4, route S1-S5: delivery record and the reference/handoff updates.

## Log

- 2026-11-16: Local baseline before any change. `bun run db:test` passes 250 assertions across
  9 files, `bun run db:test:concurrency` passes 16 checks and `bun run db:test:postgrest`
  passes its signed-token suite, all against the running local stack. CI runs neither the
  pgTAP suites nor the concurrency and PostgREST runners today: `backend-ci.yml` only runs
  `bun test` and the disposable upgrade test.
- 2026-11-16: T1 and T2 done. `.github/workflows/database-ci.yml` starts the local stack,
  runs `db:test`, `db:test:concurrency` and `db:test:postgrest`, and stops the stack in an
  always-step; it is unproven until the first pull-request run. `scripts/test-concurrency.ts`
  now fails a race that never had two transactions open at once, derives every subject and
  username from a per-run token, and treats a failed cleanup or a surviving fixture as a
  failure. All 16 concurrency checks pass with the overlap barrier in place, and the pgTAP
  and PostgREST suites still pass. T3 (per-check TAP diagnostics in the three `plan(1)`
  suites) is not implemented yet, so #101 stays open.
- 2026-11-16: T1 and T2 merged through PR #131 as `5ae7080`. The new `Database checks` job
  ran on that pull request and passed in 1m31s, so the workflow is observed rather than
  assumed.
- 2026-11-16: T3 done. The three `plan(1)` suites now call `ok` and `throws_ok` directly and
  declare their real plans: votes 91, pack-drafts 30, pack-publications 71. `bun run db:test`
  passes 439 TAP results across 9 files, up from 250, and a deliberate mutation of one check
  reported `Failed test 1: "RLS enabled"` while the remaining 29 checks still ran.
