# doc20: Dedicated CI step for the web component suites

Date: 2026-11-16
Scope: delivery configuration and its documentation. One workflow step, one bridge
test removed, and the records that described the gap. No application, database,
migration or dependency change.
Baseline: `main` at `d6a68fb`, verified against `origin/main` before branching.

## Objective

The CI gate reached the Vitest suites only through `tests/web-suites.test.ts`, a Bun
test that spawned `bun run test:web`. That bridge existed because the workflow file
could not be edited with the credential available at the time
([doc15](doc15-web-tooling-signin.md)). The workaround had two costs: Vitest ran
inside the Bun step, so a component failure reported the wrong step, and keeping a
dedicated step alongside the bridge would have executed the same suites twice.

## Changes and rationale

- `.github/workflows/backend-ci.yml` — a `Test web component suites` step running
  `bun run test:web`, placed after the workspace test step and before the web build.
  The step needs no provider credentials: the suites mock the provider and pass with
  `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` empty.
- `tests/web-suites.test.ts` — removed. It existed only to reach the same command
  from inside the Bun gate, and `bun test` still covers every Bun suite on its own.
- `docs/guides/frontend-tooling.md` — the test-runner section now describes one CI
  step per runner instead of the bridge.
- `odd/tasks/frontend-tooling.md` — spec S8 names the requirement, task T6 records
  it, and the log records why the bridge is gone.
- `docs/delivery/README.md` and `docs/handoff.md` — this record and the new state.

`bunfig.toml` keeps its `[test] pathIgnorePatterns` entries. It exists so Bun's
runner never picks up a file that imports another runner, which stays true whether or
not CI also runs Vitest directly.

## Verification

Local, on the branch, 2026-11-16:

- `CLERK_SECRET_KEY= NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= bun run test:web` — 5 files,
  81 tests passed, exit code 0 in 0.98 s. This is the exact command the new step
  runs, with the provider credentials empty as CI has them.
- `bun run check` after removing the bridge — exit code 0: both typechecks, 196 Bun
  tests across 28 files with 3216 assertions, and 81 Vitest tests in 5 files. The
  Bun count is one lower than the 197 recorded for `main`, which is exactly the
  bridge test that no longer exists; no other suite changed.
- `.github/workflows/backend-ci.yml` was read back to confirm the step order and that
  the file stays valid YAML with the same indentation and permissions.
- Independent verification of the same commit reproduced every claim above and added
  three it had not made: `Bun.YAML.parse` parses the workflow with the new step as the
  eighth of nine in the `backend` job; restoring the deleted bridge in a scratch copy
  yields 197 Bun tests in 29 files, so the delta is exactly that test; and an injected
  failing component test makes `bun run test:web` exit 1 instead of passing silently.

Not observed: a GitHub Actions run of the new workflow. The workflow file is only
executed by GitHub on a push or pull request, so CI evidence arrives with the first
run of this branch or its merge, and this record cannot claim it.

## Delivery state

Implementation and documentation are committed together on `chore/ci-web-suites` as
`2ceac19`. Native candidate review ran over the committed range `d6a68fb..2ceac19`
with the readability and reliability lenses at the high tier, then approved and burned
its acknowledgement on 2026-11-16 (lineage `review-9c307855c5b39bda`).

Recorded gap, not a clean pass: the readability lens was interrupted by a runtime
restart and the fresh status did not re-offer that slot, so the receipt records one
admitted lens, not two.

Not pushed and not merged: publication is a separate owner decision. No deployment is
recorded.

## Remaining work

- Observe one CI run that executes the new step and confirm the Vitest result appears
  under `Test web component suites`.
- The authenticated Playwright journeys and the Lighthouse re-run stay open as
  recorded in [doc15](doc15-web-tooling-signin.md).

## References

- [Frontend tooling guide](../guides/frontend-tooling.md) — current runner commands
  and CI behaviour.
- [doc15](doc15-web-tooling-signin.md) — the delivery that introduced the two-runner
  harness and the bridge.
- [Frontend tooling tasks](../../odd/tasks/frontend-tooling.md) — specs and log.
- [Handoff](../handoff.md) — current checkpoint.
