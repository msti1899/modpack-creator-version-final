# Backend completion M5: Group lifecycle and access

Branch: `feat/group-lifecycle`, cut from `origin/main` at `bce2fb7`; isolated worktree
`../modpack-creator-version-final-worktrees/group-lifecycle`. Not merged.
Runner: `bun run check`, `bun run db:test`, `bun run db:test:postgrest`.
Delivery strategy: ask-on-risk; forecast is small (tests and documentation only).

## Specs

- S1: Public direct admission works on the real signed-token surface: a registered user with a profile joins a public group directly and reads the member role immediately. A repeated join is idempotent and adds no membership.
- S2: Private admission works on the real signed-token surface: the owner creates an invitation for a private group, a token holder resolves the group name and owner username without gaining membership, requests to join with a pending request, and the owner approval adds exactly that member.
- S3: Rejection grants no membership: the owner rejects a pending request, the request is recorded as rejected, and the rejected user has no group.
- S4: Revocation and rotation invalidate the previous token: a rotated or revoked token can neither resolve the group nor create a join request.
- S5: Member and pending-request pages are bounded, cross pages with opaque cursors, clamp the requested limit into 1..100, and return an empty final page with a null cursor.
- S6: Ownership transfer takes effect immediately without acceptance: the new owner reads the owner role and the previous owner reads the member role in the next read. An owner with other members cannot leave; a member can leave and loses access immediately; the sole owner leaving deletes the group and its dependent rows.
- S7: Non-owner refusals hold on the real surface: a member cannot create or revoke an invitation, read the pending-request page, approve or reject a request, or transfer ownership. Direct table reads stay closed even with a valid token.
- S8: Evidence ships with the behavior: pgTAP, the signed-token PostgREST lifecycle suite and the API suite stay green, and a delivery record records what each proves and what still requires a hosted real session. No new endpoint, migration or product rule is added; group directory/discovery and expulsion stay out of scope.

## Tasks

- T1 [S4, S5] pgTAP additions: request-page cursor crossing, limit clamping, final empty page, and refused requests with rotated or revoked tokens. Route: inline. Status: done; 24 assertions, suite 217 tests; commit `9682c49`.
- T2 [S1, S2, S3, S4, S5, S6, S7] Extend `scripts/test-postgrest.ts` to a multi-subject lifecycle suite over the local PostgREST surface. Route: inline. Status: done; 58 checks passed; commit `d85f7e1`.
- T3 [S8] Delivery record, feature log, handoff and plan state. Route: inline. Status: done; [doc10](../../docs/delivery/doc10-groups-lifecycle-proof.md).
- T4 [S1-S7] Hosted live check with real Clerk sessions: three disposable accounts, the full lifecycle through a local API against the selected test project, and fixture removal. Route: inline. Status: done; 30 checks passed, exact-id profile cleanup, hosted readback zero rows; commit `4f716a1`; see [doc10](../../docs/delivery/doc10-groups-lifecycle-proof.md).

## Log

- L1: The owner requested continuing the completion plan at M5, isolated on its own branch and worktree (2026-11-13).
- L2: Baseline evidence read: M5 acceptance from the completion plan, D4/D5 rules, `odd/tasks/groups-permissions.md`, `docs/delivery/doc02-groups-permissions.md`, the groups pgTAP suite, the API groups routes and tests, and the local database proof in doc07.
- L3: Gap analysis. Database pgTAP already covers admission, invitation, approval, rotation/revocation, member and request pages, transfer and departure. The uncovered M5 items are: the request-page cursor crossing and limit clamping, the refusal of a rotated/revoked token when creating a request, and every lifecycle step over the real signed-token PostgREST surface, which today only checks one group creation, one read and the closed tables.
- L4: Baseline observed green on 2026-11-13 with the local stack: `bun run db:test` PASS (6 files, 193 tests), `bun run db:test:postgrest` 5/5 checks passed.
- L5: T1 committed as `9682c49` and T2 as `d85f7e1`. RED was not achievable for most assertions because they pin existing behavior; instead two local-only database mutations were applied and observed to fail nine pgTAP subtests and six PostgREST checks, then `bun run db:reset` restored the migrations and both suites returned to PASS.
- L6: One authored expectation was wrong and was corrected against the approved rule, not the code: a repeated join of the same public group is idempotent per S3, so the second group-membership refusal is pinned with a separate user who already owns another group. The database behavior was already correct.
- L7: `bun run check` on the branch: 153 tests, 2655 assertions, both typechecks. Doc10 records that the local PostgREST token is symmetric while Hono verifies RSA, so the hosted Clerk half stays unproven and no hosted project was touched.
- L8: Native candidate assessment over the slice (`bce2fb7..HEAD`, committed only) returned medium risk via `executable_change` on `scripts/test-postgrest.ts`, 7 changed paths and 580 changed lines, with `review_due` false and reason `under_budget`. No candidate review started; the slice stays pending in that budget until a later commit reaches it.
- L9: The owner authorized the hosted real-session proof and pointed to the installed Clerk CLI and skills. Scope kept bounded: three disposable `+clerk_test` accounts, the already selected test project, groups closed through the API, and one exact-id profile delete. No provider setting, plan or production instance was touched.
- L10: First live attempt aborted at the second account: one development-instance browser token does not serve a second sign-in flow. The probe confirmed a fresh token per account reaches the password factor. The failed attempt also left one orphan test account, because the id was registered only after sign-in; ids are now registered immediately after creation, the orphan was deleted with the Clerk CLI, and a readback showed the owner account alone.
- L11: Second live run passed all 30 checks: profiles through the real route, public admission, bounded member page, owner-only refusals, immediate ownership transfer, both departure paths, private invitation with approval, rejection refusal, rotation and revocation, and closed tables for a valid token. Every group was closed through the API, so one exact-id delete removed the three profiles; hosted readback showed zero rows in profiles, groups, members, invitations and requests.
- L12: `bun run check` after adding the live script: 153 tests, 2655 assertions, both typechecks. The live script is not part of CI and needs the repository environment files plus a running API on `127.0.0.1:3001`.
- L13: History was rebuilt before publication into one commit per artifact, and the branch was assessed as a whole (`bce2fb7..HEAD`, committed only): medium risk via `executable_change` on `scripts/test-group-session.ts`, 8 changed paths and 910 changed lines, `review_due` false with reason `under_budget`. No native review started.
