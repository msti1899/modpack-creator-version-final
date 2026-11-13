# Backend proof completion

Branch: `feat/backend-proof-completion`, cut from `main` at `5c83c5c` (milestones 1-6
merged). Delivery: ask-on-risk; no pull request, merge or deployment authorized.
Forecast: 400-700 authored changed lines.
Runners: `bun run check`, `bun run db:test`, `bun run db:test:upgrade`, plus the new
concurrency and PostgREST checks added by this document. A local Supabase stack on
Docker is now available; the hosted project is not touched.

## Specs

- S1: The roadmap evidence gaps recorded in the [handoff](../../docs/handoff.md#missing-proof)
  are the scope. Milestones 1-6 are implemented, reviewed and merged; no product
  behavior changes, no new endpoint and no migration is added by this work unit.
- S2: Actual pgTAP must run through the repository command `bun run db:test` against a
  real local Postgres and pass for every pgTAP suite under `supabase/tests/database`.
  A script that is not a pgTAP test must not be discovered by `supabase test db`, and
  must not be able to make the whole command fail.
- S3: The Docker-dependent upgrade runner `bun run db:test:upgrade` must run the
  profile-owner upgrade regression in its disposable container and pass.
- S4: Real multi-session concurrency must be exercised against the local stack for the
  three rules that were previously argued from code only: public admission of one
  person into one group, publication/activation of one group's pack, and concurrent
  ballots on one vote. Each check must assert the observable outcome, not a lock name.
- S5: A signed-token request must travel the documented chain Clerk-shaped token →
  Hono → PostgREST against the local stack, so the PostgREST authorization branch is
  exercised instead of only the Hono fallback. A locally minted token is not hosted
  Clerk proof and the record must say so. Observed constraint: Hono accepts only an RSA
  public key and the local PostgREST only the stack's symmetric secret, so no single
  token crosses both validators locally; the deliverable is the PostgREST half plus a
  recorded seam, not a simulated full chain.
- S6: Existing behavior stays unchanged: `bun run check` remains green, the nine
  migrations still apply in order, and no existing route changes its response.
- S7: Documentation owns the result: roadmap milestone state is corrected where it
  contradicts merged history, the handoff's missing-proof list is rewritten to the
  observed state, and one delivery record carries the evidence.

## Tasks

- T1 (S2) Move the non-pgTAP upgrade script out of the `supabase test db` discovery
  path, update the runner and its relative includes, and show `bun run db:test` green
  against the local stack. Route: inline. Done; `7ad8f98`.
- T2 (S3) Run `bun run db:test:upgrade` and capture the result. Route: inline. Done;
  `Profile upgrade regression passed.`
- T3 (S4) Add multi-session concurrency checks for admission, publication and voting.
  Route: inline. Done; `db263f2`, eight checks pass.
- T4 (S5) Add the signed-token Hono to PostgREST check. Route: inline. Done in part;
  `db263f2`. The PostgREST half is proven, the single-token Clerk chain is not possible
  locally and S5 is narrowed accordingly in doc07.
- T5 (S7) Correct the roadmap row, rewrite the handoff missing-proof list, add the
  delivery record. Route: inline. Done; `doc07-local-database-proof.md`.

## Log

- L1: The owner asked how much of the backend roadmap remained and to complete it.
  Investigation showed milestones 1-6 implemented and merged, with only evidence gaps
  left, almost all blocked by the absence of Docker. The owner authorized installing
  Docker. Docker, the compose plugin and buildx are now installed, the `docker` group
  exists, and `bun run db:start` applied the nine migrations on a real local stack.
- L2: First real `bun run db:test` run: all six pgTAP suites passed (193 tests) and the
  run still failed because `supabase test db` also discovered
  `supabase/tests/upgrades/clerk-profile-owners.sql`, an upgrade script that expects a
  bare database and dies on `role "anon" already exists`. The failure is a discovery
  defect, not a schema defect, and it stayed hidden because pgTAP had never run.
- L3: Moving the upgrade script to `supabase/upgrade-tests/` and updating its relative
  includes and the runner path made `bun run db:test` report `Result: PASS`, six files
  and 193 tests, and `bun run db:test:upgrade` report `Profile upgrade regression
  passed.` in its disposable container.
- L4: The concurrency harness opens two sessions through the stack's own container and
  holds the first transaction open after its lock, so the second arrives uncommitted.
  First attempt failed on two real mistakes: fixture subjects must match
  `^user_[A-Za-z0-9]+$` or `current_clerk_sub()` refuses them, and identifier lookups
  inside a session run as `authenticated`, which has no table privileges. Resolving the
  identifiers as the database owner and using Clerk-shaped subjects made all eight
  checks pass.
- L5: The PostgREST script signs an HS256 token with the stack secret reported by
  `supabase status`. Five checks pass: the token reaches the group RPC, a tokenless
  request is rejected, a token signed elsewhere is rejected, direct table reads stay
  closed, and the same token reads its group back. Hono accepts only an RSA public key,
  so one token cannot cross both validators locally; that seam is recorded instead of
  hidden.
- L6: `bun run check` still passes 125 tests / 2310 assertions. The slice is committed as
  `7ad8f98` and `db263f2` on `feat/backend-proof-completion`; publication, merge and
  review remain separate decisions.
