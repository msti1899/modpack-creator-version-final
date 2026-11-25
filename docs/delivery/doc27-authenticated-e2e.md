# doc27: Authenticated Playwright suite with a throwaway account

- Date: 2026-11-25
- Scope: Give the browser suite a real signed-in session, on demand and locally, with one
  account created and deleted per run. No deployment, no CI secret, no product screen, no
  API behavior and no database change.
- State: Implemented and checked locally in `6e728a5`. Not reviewed, not pushed, not merged
  when this record was written. No hosted change was made beyond creating and deleting the
  test accounts of the runs described below.
- Outcome: An authenticated journey can be verified against a real Clerk session instead of
  only reviewed, without storing any test credential anywhere.

## What changed

- [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts) gains a second mode,
  selected by `PLAYWRIGHT_AUTH=1`. The default mode is unchanged: the public journeys run
  with the provider credentials cleared. The authenticated mode starts the API, builds and
  starts the web app with the development instance, signs one account in through a setup
  project, and runs the specs under `e2e/authenticated` with the saved browser state.
- [apps/web/e2e/auth.setup.ts](../../apps/web/e2e/auth.setup.ts) creates the account, signs
  in with `@clerk/testing`, and proves once that the captured session reaches `GET /api/me`
  with the same subject.
- [apps/web/e2e/auth.teardown.ts](../../apps/web/e2e/auth.teardown.ts) deletes the account
  after the run, on success and on failure.
- [apps/web/e2e/support/clerk-test-account.ts](../../apps/web/e2e/support/clerk-test-account.ts)
  owns the account lifecycle: a `+clerk_test` address, `privateMetadata.e2eTestUser`, the
  recorded id, and the deletion. A failed provider deletion keeps the record and fails the
  run, the next run deletes the recorded account before creating its own, and test-owned
  accounts older than an hour are swept, so a killed process cannot leave a forgotten
  account.
- [apps/web/tests/lib/playwright-config.test.ts](../../apps/web/tests/lib/playwright-config.test.ts)
  pins both modes: the public project and its cleared credentials, the authenticated
  projects and saved state, and both refusals.
- [apps/web/tests/lib/clerk-test-account.test.ts](../../apps/web/tests/lib/clerk-test-account.test.ts)
  pins the account lifecycle with the provider mocked: create, record, delete, the 404 case,
  the retained record on failure, the credential-free no-op and the stale sweep.
- [apps/web/e2e/support/clerk-env.ts](../../apps/web/e2e/support/clerk-env.ts) reads
  `apps/web/.env` for unset keys, so the runner needs no exported variables, and refuses
  keys that are not development-instance keys before any provider call.
- [apps/web/e2e/authenticated/account-session.spec.ts](../../apps/web/e2e/authenticated/account-session.spec.ts)
  is the first authenticated journey: the signed-in account surface renders no sign-in
  prompt, and `GET /api/me` returns the same subject as an uncached response.
- `test:e2e:auth` is added to the root and web `package.json`. `@clerk/testing` and
  `@clerk/backend` are added to the web development dependencies; the backend version matches
  the one the API already uses.
- [ADR0007](../decisions/0007-authenticated-e2e-account.md) records the decision, including
  why the account is throwaway and why the suite is not a CI gate.
- `apps/web/e2e/.auth/` is ignored by Git: it holds the signed-in state and the account
  record of a run.

## What was checked

Environment: CachyOS Linux, Bun 1.4.4, Node 22, Chromium from the installed Playwright
1.65.0, the repository `.env` files of the main checkout copied into the worktree for the
duration of the run, the configured Clerk development instance, a local API on
`127.0.0.1:3001` and the selected test Supabase project.

- `bun run lint`: clean, 43 files.
- `bun run --filter @modpack/web typecheck`: clean.
- `bun run check`: clean, 228 Bun tests and 92 Vitest tests. The 11 new Vitest cases cover
  the mode selection and the account lifecycle with the provider mocked, including the
  retained record after a failed deletion and the stale sweep.
- `bun run test:e2e`, before adding the new files and again after adding them with the
  `.env` files present: 29 passed both times. The second run is the one that matters: with a
  populated `apps/web/.env`, the public build still renders the sign-in shell that states
  accounts are not configured, so the credential-clearing path still wins over the file.
- `bun run test:e2e:auth`: 2 passed. The setup created the account, completed the sign-in,
  and read `GET /api/me` with the same subject in 5.8 s; the authenticated journey passed in
  0.3 s. The web app was built with the development instance and the API ran on port 3001.
  The run was repeated after the recovery fix described below: 2 passed in 11.0 s, with the
  stale sweep on the start path.
- Cleanup of that run: `apps/web/e2e/.auth/` was gone afterwards, and the Clerk Backend API
  listed five accounts in the instance with zero `modpack.e2e.` accounts left.
- Guards, observed by loading the config with `--list`: without both keys the run refuses
  before any provider call, and with `sk_live_` / `pk_live_` values it refuses with the
  development-instance message.
- The API server entry was exercised directly before wiring it into the config:
  `bun run --filter @modpack/api start` answers `401` on `GET /me` without a token, which is
  what the readiness probe expects.
- An independent verification pass over the uncommitted change found two recovery defects in
  the first version of the cleanup: a failed provider deletion removed the only local record
  of a live account, and an account created by a killed run was never reconciled. Both were
  fixed in `clerk-test-account.ts` and pinned by the new Vitest cases. After the fix:
  `bun run check` passes 228 Bun and 92 Vitest tests; with a synthetic leftover record and
  no provider keys, `bun run test:e2e` passes 29 tests, exits 0, warns once and keeps the
  record; and `bun run test:e2e:auth` still passes 2. That second verification pass over the
  fix was interrupted by the session and not completed independently.

## Not proven

- Nothing here is a CI gate. The authenticated mode has not run in CI and is not intended to
  until a deployed API exists.
- A journey that writes to the database has not been written yet, so the rule that a writing
  journey deletes its own rows is stated in ADR0007 but not exercised by a test.
- The crash recovery is pinned by unit tests with the provider mocked and by a leftover
  record observed in a public run; no authenticated run was actually killed mid-setup to
  watch a later run reconcile it.

## Remaining work

- Move the board item to its accepted state and record the closing commit once the change is
  reviewed and merged.
- The first writing journey (profile completion, F2) must bring its own database cleanup and
  prove it.
- CI coverage of authenticated journeys stays with the Operations milestone: it needs a
  deployed API and a decision about provider state in CI.
- The current handoff is the place to resume from: [handoff](../handoff.md).

## References

- [ADR0007: authenticated Playwright account](../decisions/0007-authenticated-e2e-account.md)
- [Frontend roadmap, D-F5](../plans/frontend-roadmap.md#dependencies-and-open-decisions)
- [doc08: account and session runtime proof](doc08-account-session-proof.md)
