# doc16: Account deletion and retention

Date: 2026-11-14
Scope: The completion plan's M8: decide whether account deletion is in scope, define
ownership, membership, historical-ballot and profile/username retention, and implement the
approved application-owned surface with the evidence the milestone asks for. No provider
API, webhook, service-role credential, automatic ownership succession, administrator route,
new cascade or frontend work.
Baseline: `origin/main` at `afea8bf`; work on `feat/account-deletion` in an isolated
worktree.

## Objective

M8 asks for a decision first: whether deletion is in scope and what happens to ownership,
membership, historical ballots and the profile or username afterwards. If deletion is
approved, the milestone asks that rejected actions preserve data and that provider events
cannot strand inconsistent records. Its delivery note also states that the milestone is
not a request to delete current accounts by hand and not a request to install a webhook.

Before this slice the database had no deletion path at all. Seven foreign keys pointed at
`public.profiles`, six of them with `on delete restrict`, so a member who left a group,
cast a ballot or received an invitation could never delete their account even though no
route existed to try.

## Changes and rationale

- [ADR0004](../decisions/0004-account-deletion.md) records the decision on 2026-11-14.
  Deletion is in scope for one surface: the authenticated holder deleting their own
  application data through `DELETE /profile`. Clerk keeps owning the identity and the
  session, and the slice calls no provider. Ownership and membership reuse D5 without a
  second rule, the profile and its username are deleted and immediately reusable, and
  historical group records keep the Clerk subject as an opaque tombstone. The baseline's
  open deletion question now points at that record, and confirmation UX plus provider
  reconciliation stay open.
- New migration `20261114120000_account_deletion.sql` drops only the four foreign keys
  that tied historical records to a deletable profile: `group_invitations.created_by`,
  `group_join_requests.decided_by`, `group_votes.created_by` and
  `group_vote_electorate.user_id`. `groups.owner_id` and `group_members.user_id` remain
  because the departure step removes those rows first and they still protect ownership.
  The new `delete_my_account` function is one transaction, group-locked in the same order
  as transfer, leave, draft saves and vote writes, refuses an owner with other members with
  the existing `409` message and writes nothing on any refusal, deletes a last owner's
  group, removes a member's membership, and then deletes the profile row. It is
  idempotent: an account without a profile returns `deleted: false` without writing.
- `DELETE /profile` is added to the existing profile routes. It accepts no fields, maps
  the transfer refusal to `409`, keeps every other failure generic, validates the RPC
  payload before answering, and returns `{ account: { deleted, group } }`. GET, POST and
  PATCH keep their exact behavior; only their error handling was extracted into one helper
  with unchanged messages.
- `supabase/tests/database/account-deletion.test.sql` builds its fixtures through the real
  group, draft, publication and vote RPCs. It pins the definer flag, the grants, the two
  remaining keys, the four dropped keys, both departure paths, retained electorates and
  ballots, vote counts that do not move, the released username, invitation and request
  tombstones, the refusal that writes nothing (compared by a fingerprint of every affected
  table), idempotent repetition and the missing-subject rejection.
- `apps/api/tests/account-deletion.test.ts` pins the HTTP contract: authentication and the
  authenticated database role, the one forwarded RPC call, the two response shapes, the
  body rules, the refusal map and every generic failure, including malformed RPC payloads.
  `apps/api/tests/profiles.test.ts` changes one line that asserted `DELETE /profile` was
  absent, because the route now exists; this is the only pre-existing expectation the slice
  changes.
- `scripts/test-postgrest.ts` grows from 97 to 126 signed-token checks over the real
  PostgREST surface: an owner refusal, a member deletion with retained draft, electorate
  and ballot, the ballot page's opaque tombstone on the real database, a released username
  claimed through the real profile insert path, a transferred owner's deletion with the
  vote's creator tombstone, the last member's group deletion, and cleanup that still
  leaves zero fixture rows.
- The independent verifier found one defect this slice caused, now fixed in the ballot
  page: the database left-joins profiles there and returns `username: null` for a retained
  tombstone, while the mapper required 3–20 characters, so a surviving group's ballot page
  answered `502` after a member deleted their account. That combination was unreachable
  before deletion existed. The mapper now reports `null` for that row and still rejects a
  malformed non-null name; the verifier's probe is committed as
  `apps/api/tests/vote-tombstones.test.ts`. The same review pass also tightened the
  deletion payload validation so an impossible `deleted: false` with a group is refused.

## Verification

Observed on 2026-11-14 against the local disposable stack, plus the stub-driven HTTP suite.

- RED was observed before the implementation. With the route registered under another path,
  `bun test apps/api/tests/account-deletion.test.ts` reported 0 pass and 7 fail. With the
  transfer refusal removed from the database function, `bun run db:test` failed with
  `PROBE FAIL: The refused deletion leaves every row unchanged` and `bun run db:test:postgrest`
  failed five checks starting at `An owner with other members cannot delete the account`.
  With the electorate foreign key re-added, `bun run db:test` failed with
  `update or delete on table "profiles" violates foreign key constraint
  "group_vote_electorate_user_id_fkey" on table "group_vote_electorate"`. Each mutation was
  local only and `bun run db:reset` restored the migrations; the suites returned to PASS.
- `bun run check` passes both typechecks, 182 Bun tests and 3090 assertions across 27 files
  (up from 173 and 2979), plus the web suite's 15 tests. The new HTTP suites are 9 tests:
  7 for the deletion contract and 2 for the retained ballot tombstone.
- `bun run db:test` PASS with eight files and 239 tests, up from seven and 228. The new file
  contributes 11 TAP assertions and 32 internal probes that abort the file with a named
  message when they fail.
- `bun run db:test:postgrest` passes 126 of 126 checks, up from 97, and its cleanup check
  reports no surviving fixture.
- Independent read-only verification ran on 2026-11-14 in a fresh context. It re-ran the
  suite, both database runners and the HTTP RED, and judged S1–S4 and S6–S10 met. It found
  one blocker this slice caused: the ballot page returned `502` for a surviving group after
  a member deleted their account, because the mapper required a username that the retained
  tombstone no longer has. The defect is fixed in `449c8aa`, its probe is committed as
  `apps/api/tests/vote-tombstones.test.ts`, and the RED was reproduced by reverting the
  mapper. A recheck limited to that blocker and the payload advisory confirmed it closed on
  2026-11-14: the same committed test answers `502` against the baseline mapper and `200`
  against the fixed one, the real database emits `username: null`, malformed non-null names
  still map to `502`, and both impossible `deleted: false` payloads are refused while the
  four legitimate shapes still answer `200`. Its payload-combination advisory was fixed in
  the same pass; the zero-byte-body contract and the unexercised deletion-versus-join race
  stay recorded.
- Differential: the 173 pre-existing Bun tests still pass unchanged except the single
  deliberate route-absence assertion described above, and the public-route golden in
  `apps/api/tests/public-regression.test.ts` is unchanged.

## Delivery state

- Implementation and documentation: complete on `feat/account-deletion`, in six work-unit
  commits: `5e5c266` (decision), `995f97b` (database retention and function), `b1bba3b`
  (HTTP route), `449c8aa` (ballot tombstone fix from the verification pass), `23c64c3`
  (signed-token checks) and the documentation commit that carries this record.
- Review: one independent read-only verification pass; its blocker is fixed and its
  remaining advisories are recorded above. No native candidate review ran.
- Publication: published as
  [PR #81](https://github.com/msti1899/modpack-creator-version-final/pull/81) on 2026-11-14
  as seventeen work-unit commits, after the history was regrouped by artifact.
- Merge: merged to `main` as `c8bcaa4`, with the Backend checks passing in 55 seconds on
  the merge commit.
- Deployment: not started. The two migrations were applied to the hosted test project on
  2026-11-14 and its ledger shows 12 of 12; no API deployment is recorded.

The authored diff is above the 400-line planning heuristic. It was published as one slice
with the commits separated by artifact; a chain can still be cut from them without
rewriting anything.

## Remaining work

- No client consumes `DELETE /profile` yet. Confirmation and recovery UX for a destructive
  account action remains undecided.
- Provider-side reconciliation is deliberately absent. An account deleted only in Clerk
  leaves an inaccessible profile whose username stays reserved. Reconciling it needs a
  webhook signing secret, a service-role credential and a rule for a group owner who can no
  longer act; ADR0004 records all three as unanswered.
- A profile deletion that races a fresh join can fail with a generic `502` instead of a
  named conflict. No partial state is written, but the race was not exercised.
- An explicit zero-length request body is refused as invalid input, while no body at all is
  accepted. Both are safe; the asymmetry is recorded rather than pinned as intended behavior.
- No live Clerk session ran against this branch, and the hosted project carries the
  migrations without any deployed API. Deadlines, quotas and deployment remain outside this
  record.

## References

- [ADR0004: account deletion and retention](../decisions/0004-account-deletion.md)
- [Profile guide](../guides/account-profiles.md) and
  [API reference](../reference/backend-api.md)
- [Completion plan M8](../plans/backend-completion.md)
- [Feature log](../../odd/tasks/completion-m8-account-deletion.md)
- [Current handoff](../handoff.md)
