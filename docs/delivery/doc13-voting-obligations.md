# doc13: Voting obligations and lifecycle

Date: 2026-11-13
Scope: The completion plan's M7 over the vote interfaces that already exist: the
binding-obligation decision, the conflict rules for pending approved additions, and
the evidence for open, ballot change, cancel, expire, approve, incorporate, a frozen
electorate and concurrent independent proposals. No new endpoint, table, publication
side effect, notification scheduler or frontend work.
Baseline: `origin/main` at `ddd1b8f`; work on `feat/voting-obligations` in an isolated
worktree.

## Objective

M7 asks that "Open/change/cancel/expire/approve/incorporate are exercised, including
fixed electorate and concurrent independent proposals", and that "an explicit decision
explains what 'binding' requires and how conflicting pending additions are handled".
The vote feature shipped in roadmap milestone 6 and is merged, so this slice starts
with the decision and then adds the evidence the completion plan asks for.

Before this slice the database had no answer for an approved addition that was already
in the draft. The only path was a 409, so a vote approved after another vote (or after a
manual save) proposed the same version could stay unincorporable permanently, which
contradicts the duty that approval creates.

## Changes and rationale

- [D7](../decisions/0001-project-baseline.md#d7-voting) records the decision on
  2026-11-13. Binding is an obligation, not a gate: an `approved` vote with
  `incorporatedAt: null` is pending, it is read from the existing vote list, it blocks
  no draft save, publication, activation, membership change or ownership transfer, and
  ordering across several approved votes is the owner's choice with no queue and no
  automatic merge. The obligation belongs to the group, so the current owner is the
  only incorporator. Conflicts are resolved by the draft's atomic contract: a different
  revision, changed settings and a partial overlap are 409 refusals that write nothing,
  while a wholly present addition is satisfied and discharged without touching the
  draft.
- New migration `20261113190000_vote_incorporation_satisfied.sql` replaces
  `incorporate_group_vote` with that branch. A satisfied incorporation records
  `incorporated_at` and returns the unchanged draft and revision; every other route,
  message and status is untouched. It was applied to the selected hosted project on
  2026-11-13 as the only pending migration.
- [votes.test.sql](../../supabase/tests/database/votes.test.sql) gained 26 assertions:
  the obligation read after approval, a draft save that neither discharges it nor
  changes the electorate, two independent votes for one addition (append, stale
  revision, satisfied discharge, already-incorporated refusal), a partially present
  addition that writes nothing and is later discharged after the owner removes the
  overlap, and an ownership transfer where the previous owner is refused and the new
  owner discharges the obligation.
- [votes-obligations.test.sql](../../supabase/tests/database/votes-obligations.test.sql) commits the
  independent verifier's probes as a seventh database suite: a satisfied incorporation
  writes no draft row and no publication row, a partial overlap writes nothing at all,
  settings are checked before satisfaction, a pending obligation blocks no publication,
  activation, membership or transfer, ordering across approved votes is the owner's
  choice, a multi-element addition is satisfied in a different order, and the no-draft
  path still creates revision 1.
- [votes.test.ts](../../apps/api/tests/votes.test.ts) grew from 16 to 19 tests. The new
  cases pin the obligation read from the vote list, the satisfied success shape with an
  unchanged draft, and the whole incorporation refusal map, including the previous
  owner's 403.
- [test-postgrest.ts](../../scripts/test-postgrest.ts) grew from 73 to 97 signed-token
  checks on the real PostgREST surface: open, ballot replacement, early approval, the
  pending obligation, a draft save that does not discharge it, stale revision,
  incorporation, a second incorporation refusal, two approved votes for one addition
  with the satisfied discharge, cancellation, a transfer with the previous owner
  refused, the new owner's discharge, and the departed member's refusal on both vote
  reads. Cleanup verification now also counts votes, electorate rows and ballots.
- [test-concurrency.ts](../../scripts/test-concurrency.ts) grew from eight to fourteen
  real multi-session checks: two independent approved votes incorporated at once (one
  write, one conflict, then a successful retry), two approved votes for the same
  addition (one write, one conflict), and one vote incorporated twice (one discharge,
  one `Vote is already incorporated.`). The observation now asserts every addition is
  stored exactly once and every approved vote is discharged exactly once.
- [test-vote-session.ts](../../scripts/test-vote-session.ts) adds the hosted live check
  with real Clerk sessions and a live Modrinth proposal, and
  [vote-session.test.ts](../../scripts/tests/vote-session.test.ts) pins its refusal
  guards without a provider call.

## Verification

Environment: local disposable Supabase stack with all ten migrations, Bun 1.4.4, and
one authorized hosted run on 2026-11-13.

- Baseline before the change on this branch: `bun run db:test` PASS with six files and
  217 tests, `bun run db:test:postgrest` 73 checks, `bun run check` 161 tests and 2880
  assertions.
- `bun run db:test`: PASS with seven files and 228 tests once the committed verification
  probes are counted; that suite now plans one TAP result per case block instead of one
  for all sixty probes.
- `bun run db:test:postgrest`: 97 of 97 checks passed.
- `bun run db:test:concurrency`: 16 of 16 checks passed after the review fixes, up from
  fourteen; the new race pits a draft save against an incorporation and every expected
  revision is derived from a counter.
- `bun run check`: both application typechecks exit 0, 165 Bun tests and 2962
  assertions pass.
- `bun test apps/api/tests/votes.test.ts`: 19 tests and 257 assertions.
- Sensitivity was observed, not assumed. Making the containment branch always false
  failed the pgTAP suite at the satisfied-incorporation assertion; mapping `A proposed
  version is already in the draft.` to a different status failed the new HTTP refusal
  case. Both mutations were reverted; `bun run db:reset` restored the schema and the
  suite returned to PASS.
- The live script's refusal path was exercised without touching a provider: a missing
  `--live`, a live secret, a live publishable key and a local database URL are all
  rejected with exit 2.
- Hosted live run: `bun scripts/test-vote-session.ts --live` passed 41 checks with three
  real Clerk sessions through a locally running API against the selected test project. The
  fixed script was then run twice more and passed 42 checks each time, adding the proposal
  title assertion. The first post-review run failed one check and printed three cleanup
  notes, exposing two defects in the script itself: the bulk retry edit had dropped an
  expected value, and closing an already-closed group was counted as a failure. Both were
  fixed and the run repeated.
  It covered a live catalog draft, a live concrete addition, ballot replacement, early
  approval, the pending obligation, a draft save that did not discharge it, a stale
  revision refusal, the incorporation, a second incorporation refusal, two approved
  votes for one addition with the satisfied discharge, cancellation, and an ownership
  transfer in both directions with the previous owner refused.
- The first hosted attempt aborted on the catalog read because the script used the wrong
  query parameter; the group and profile rows it created were removed before the
  passing run. Hosted readback after both runs shows zero rows in `groups`,
  `group_members`, `group_votes`, `group_vote_ballots`, `group_vote_electorate`,
  `pack_drafts` and `pack_publications`; one profile row (`m4proof13`, recorded in the
  M4 slice) remains because no deletion endpoint exists.

## Limits

- The live check depends on the public Modrinth catalog and picks its additions from a
  live search page, so a future catalog change can require new candidates rather than a
  new version ID.
- The satisfaction branch is proven for single-version and multi-version additions in
  pgTAP and for a dependency-carrying addition in the hosted run, not for every
  possible pin shape.
- Deadline expiry is still derived at read time and was proven in pgTAP only; a hosted
  expiry proof would need a one-hour wait or a database write. No notification
  scheduler exists and none was added.
- The satisfaction is effect-idempotent, not call-idempotent: a second call for the
  same vote returns 409 `Vote is already incorporated.` by design.
- The hosted check retries only reads, closes its groups through the API in a cleanup
  block that also runs after an abort, and prints a statement that removes groups by owner
  id before profiles. It cannot delete profile rows because no deletion endpoint exists,
  so the printed statement is still needed before the database is empty.
- No deployment, no publication and no merge are recorded by this document.

## Native review

The owner asked for the full lens pass on 2026-11-13 after the slice was published.
Candidate consent was granted for this slice only, and the native plan selected four
lenses over the base-diff projection (`risk`, `resilience`, `readability`,
`reliability`). The readability slot was refused once by the transport with
`reviewer_result_not_admissible`; the bound status reoffered exactly that slot and the
relaunch was admitted. The review approved the candidate and its acknowledgement burned
the authority (`gentle-ai.review-acknowledged/v1`, action `acknowledged`). No correction
round opened.

Sixteen informational advisories were recorded. All but one were then fixed in a
follow-up slice merged through
[PR #68](https://github.com/msti1899/modpack-creator-version-final/pull/68) as `2c8636e`,
rather than left as debt:

- Test determinism and scope: the concurrency observation now counts only the fixture
  group, the unused race winner is gone, every expected revision is derived from a
  counter instead of a literal, and a new race pits a draft save against an
  incorporation, which is the path the satisfaction branch depends on.
- Live-check robustness: reads keep the single 504 retry while writes never retry, since
  the server may have committed before timing out; a run that aborts now closes its
  groups through the API in its cleanup block, and the cleanup statement it prints
  removes groups by owner id before profiles, so it is not limited to a happy-path exit.
- Test honesty: the HTTP cases are named for what they pin, the live check asserts the
  proposal titles it claims to assert, and the retry comment matches its callers.
- Diagnostics and readability: the seventh suite now plans one TAP result per case block
  instead of one for sixty probes, the Clerk JS version is a named constant, and the
  fixed test-address code is explained.
- The only advisory kept is pre-existing and out of scope: the owner refusal map lets an
  authenticated caller distinguish an absent vote from another group's vote, which is the
  documented contract and predates this slice.

Two implementation details the review asked to have written down: the revision guard
rejects the integer maximum because an increment would overflow, and any future change to
`incorporate_group_vote` must ship as a new migration instead of editing this one, because
the hosted project already records this version as applied. Detect drift with
`bunx supabase migration list --remote` plus a readback of the stored function body.

## Delivery state

Implementation and evidence on `feat/voting-obligations`, cut from `origin/main` at
`ddd1b8f` in an isolated worktree, published as
[PR #66](https://github.com/msti1899/modpack-creator-version-final/pull/66) with the
Backend checks passing in 44 seconds on the branch head and again in 36 seconds after the
review record. Merged to `main` through
[PR #66](https://github.com/msti1899/modpack-creator-version-final/pull/66) as `e5246e0`.
No deployment is recorded. The feature log is
[completion-m7-voting-obligations](../../odd/tasks/completion-m7-voting-obligations.md).

## Remaining work

- Re-run `bun scripts/test-vote-session.ts --live` under explicit authorization after any
  change to the vote routes, the incorporation function or the token template, then
  remove the profile rows it lists.
- Re-run the local database suites, including the concurrency suite, after any change to
  the vote RPCs or the group lock order.
- Account deletion (M8) still owns how a profile row is removed, which is why the live
  check only writes its cleanup statement.
- Resume from the [current handoff](../handoff.md).

## References

- [Voting guide](../guides/voting.md)
- [API reference: group votes](../reference/backend-api.md#group-votes)
- [Decision baseline: D7](../decisions/0001-project-baseline.md#d7-voting)
- [doc06: Group voting](doc06-voting.md)
- [doc10: Group lifecycle and access proof](doc10-groups-lifecycle-proof.md)
- [Voting tasks](../../odd/tasks/voting.md)
