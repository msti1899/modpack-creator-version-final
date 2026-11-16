# doc25: Trustworthy database and integration CI

- Date: 2026-11-16
- Scope: completion-plan milestone M10, board item #101.
- State: implemented on `feat/tap-diagnostics`; merge pending at the time of writing.
- Outcome: CI runs the database checks that previously ran only by hand, a race that never
  overlapped fails instead of passing, and the three suites that reported one result now
  report one per check.

## What changed

- `.github/workflows/database-ci.yml` starts the disposable local Supabase stack, runs the
  pgTAP suites, the multi-session concurrency checks and the signed-token PostgREST checks,
  and stops the stack in an always-step.
- `scripts/test-concurrency.ts` records that two transactions were open at once before it
  accepts a race outcome, and fails when a race never overlapped. Every subject and username
  carries a per-run token, a cleanup failure fails the run, and the run verifies that no
  fixture survived.
- `supabase/tests/database/{votes,pack-drafts,pack-publications}.test.sql` call `ok` and
  `throws_ok` directly with their real plans instead of wrapping 189 checks in one assertion
  each.

## What was checked

- `Database checks` passed on pull request #131 in 1m31s, which is the first proof that the
  workflow starts the stack on a GitHub runner.
- `bun run db:test`: 439 TAP results across 9 files, all passing, up from 250. The three
  converted suites report 91, 30 and 71 results.
- A deliberate mutation of one assertion in a scratch copy of `pack-drafts.test.sql` reported
  `Failed test 1: "RLS enabled"` and still ran the remaining 29 checks; the scratch file was
  removed.
- `bun run db:test:concurrency`: all 16 checks pass, each after observing two open
  transactions. `bun run db:test:postgrest` passes its full suite.
- `bun test` 223 tests, `bun run typecheck` and `bun run lint` are clean.

## Not proven

- The workflow's cost on a cold runner is unknown: the observed run reused layers already
  present on the runner image. A run that pulls every image fresh will be slower.
- pgTAP, concurrency and PostgREST now run in CI, but none of the jobs is a required status
  check yet; that is a separate repository setting and a separate decision.
- The concurrency harness still gives the holder a 300 ms start and holds it for 2.5 s. The
  barrier proves overlap when it happens, but it cannot make a slow runner overlap; it turns
  that case into a failure, which is the intended trade.
- Nothing here runs against the hosted project.

## Remaining work

- Required status checks, and whether `Database checks` becomes one of them.
- M9 (abuse limits) and M11 (operations) remain open in the completion plan.
