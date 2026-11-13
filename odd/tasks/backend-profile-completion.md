# Backend profile completion (completion plan M2)

Objective: complete the authenticated profile contract so a client can detect a
missing profile, create one, resolve a username collision and rename under the
existing cooldown rules.
Base: `origin/main` at `576ddfd`. Branch: `feat/backend-profile-completion`.
Isolated worktree: `/home/matias/projects/modpack-creator-version-final-worktrees/backend-profile-completion`.
Route: inline. Runner: Bun 1.4.4, `bun run check`.
Delivery: one reviewable slice on the feature branch. Publication and merge are
not authorized.

## Specs

- S1: A client can determine whether an authenticated account needs a profile.
  `GET /profile` returns `200 {"profile": null}` before assignment and the profile
  object after assignment. `GET /me` keeps its current `{ user: { id, email } }`
  shape; no contract change there.
- S2: `POST /profile` creates exactly one profile per account. A second creation
  attempt returns `409` with a distinct message, `Profile already exists.`, so the
  client can continue to rename instead of retrying with another username.
- S3: A username collision returns `409` with `Username is already taken.`, both for
  first assignment (another account owns that name) and for a rename. If the cause
  cannot be classified safely, the existing generic message
  `Profile or username already exists.` is preserved. No database detail, key or
  constraint name is exposed.
- S4: Rename behavior is unchanged: first rename immediate, later changes only after
  30 days, casing preserved, case-insensitive uniqueness, identical writes keep the
  timestamp, previous names released.
- S5: Group creation without a profile stays a predictable rejection: `409`
  `{"error": "Profile required."}` before any group row is written.

## Tasks

- T1 [S1–S5] inline — complete: contract tests first, then the collision
  classification in `apps/api/src/profiles.ts`, plus reference and guide updates.
  Risk: item 3 (public API error contract).
  Evidence: RED observed on the two new conflict assertions before the
  implementation; `bun test apps/api/tests/profiles.test.ts` then passed 13 tests
  and 162 assertions.
- T2 [S1–S5] verification — complete. `bun run check` passes 129 tests and 2376
  assertions with both typechecks. Independent verification reproduced no blocker:
  S1–S5 met, a 34-scenario differential kept every non-conflict response identical
  to the baseline, and failure-path probes never leaked provider details. Its one
  advisory (a malformed single-row lookup body was trusted as proof of ownership)
  was fixed by validating the row shape and pinned by a durable regression test.
  Owner-scope and fail-safe probes confirm one owner-scoped GET and the generic
  conflict message when classification is impossible.
  Native risk assessment: medium, `under_budget`, so no review was due for this
  slice. Publication and merge remain unauthorized.

## Log

- L1: The owner asked to review the backend plan and start the second milestone in
  its delivery table, isolated on its own branch because the first milestone is
  already in progress elsewhere. Scope accepted: completion-plan M2, executed in a
  separate worktree from `origin/main`; nothing is pushed or merged.
- L2: Existing evidence inspected on `origin/main`: `GET /profile` already returns
  `{ profile: null }` for an account without a profile, so S1 needs documentation
  and a regression test rather than a new endpoint. `POST`/`PATCH` both mapped a
  `23505` unique violation to the same `Profile or username already exists.`
  message, which conflates two different recovery paths and leaves S3 unresolved.
  `POST /groups` without a profile was already pinned as `409 Profile required.` in
  `apps/api/tests/groups.test.ts`, so S5 stays a reference test, not new code.
