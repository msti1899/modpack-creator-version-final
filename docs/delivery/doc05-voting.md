# doc05: Group voting on mod additions

Date: 2026-11-12
Scope: Backend-only mod-addition votes for a group: owner-created concrete
proposals with a chosen duration, a fixed electorate, absolute majority with early
approval, owner cancellation, and binding owner incorporation without publication.
Excludes published versions, activation, sharing, frontend and CD.
Baseline: branch `feat/voting` created from `main` at `d5d3c40` (milestones 1–4
merged). Milestone 5 was being developed on a separate branch and is not a
dependency of this work.

## Objective

Implement the approved roadmap milestone 6 using the existing decision baseline. The
four lifecycle rules that the roadmap required before implementation were decided on
2026-11-12 and recorded in D7: ballot changes until the majority, owner cancellation
while a vote is open, a frozen electorate unaffected by departures, and independent
concurrent votes. Expiry without the majority records rejection. See the
[voting tasks](../../odd/tasks/voting.md) for the specification and the
[decision baseline](../decisions/0001-project-baseline.md).

## Changes and rationale

- New migration `20261112230000_group_votes.sql` adds `group_votes`,
  `group_vote_electorate` and `group_vote_ballots`, with RLS enabled, all direct
  privileges revoked, and access only through `security definer` RPCs that resolve
  the caller from the signed Clerk subject. The electorate is a snapshot table, and a
  composite foreign key keeps every ballot inside the frozen electorate.
- The RPC slice covers opening, casting a ballot, cancelling, incorporating and the
  two paged reads. Opening and incorporating lock the group row first and reuse the
  draft's revision compare-and-swap, so a vote never validates against a draft
  snapshot that changed behind the owner's back.
- The vote stores the pinned addition and a display snapshot of the proposal, so a
  later catalog change cannot rewrite what the group voted on. Approval is persisted
  the moment the majority is reached; a vote past its deadline without the majority
  reads as rejected because no scheduler exists, and every write path refuses it.
- `apps/api/src/modrinth.ts` exports `validateVoteAddition`, which reuses the
  existing catalog, pin and dependency rules and returns the snapshot. The public
  search, resolve and export paths are unchanged.
- `apps/api/src/votes.ts` adds the authenticated vote routes with body caps, strict
  response validation and the established `P0001` message mapping; `index.ts` mounts
  them under `/groups/me/votes`.
- Documentation: [the voting guide](../guides/voting.md), a
  [reference section](../reference/backend-api.md), the roadmap row and change log,
  the handoff checkpoint and the documentation index.

Approval and incorporation never publish, activate or version the pack. Milestone 5
owns published versions and remains untouched here.

## Verification

- `bun run typecheck` passed for both applications on 2026-11-12 in this worktree.
- `bun test apps/api/tests/votes.test.ts` passed 16 tests with 185 assertions;
  `bun test` passed 102 tests with 1895 assertions.
- RED for the HTTP slice was confirmed by running the new test file against a copy of
  the base revision in external scratch: 16 of 16 failed there, and the same copy
  passed the two suites that exercise the changed module (14 tests, 478 assertions)
  with output identical to the current tree.
- The tracked suite `supabase/tests/database/votes.test.sql` holds 68 assertions over
  authorization, electorate freezing, ballot replacement, majority, early approval,
  cancellation, expiry, incorporation, isolation, pagination and cascade deletion.
  It was executed unchanged in the isolated supplemental PGlite harness: the suite
  passes with all eight migrations applied, fails when the votes migration is
  skipped, and the existing draft SQL suite still passes with the new migration.
- Not verified: this environment has no Docker and no local PostgreSQL stack, so
  `bun run db:test` (real pgTAP under `supabase test db`) could not run and the
  tracked SQL suite has not executed under pgTAP. PostgREST, a signed
  Clerk→Hono→PostgREST request, real two-session concurrency, hosted application of
  the migration and HTTP-side Modrinth behaviour through a deployed API are also
  unproven. The PGlite harness proves SQL behaviour in one session, not concurrency
  or transport.
- Independent verification ran later on the same day in fresh external scratch and
  found no blocker: S1–S5 met, 179 independent SQL checks, 11 HTTP probe tests with
  296 assertions, 55 byte-identical comparisons of the existing routes against the
  base revision, and both tracked SQL suites passing under an independently built
  PGlite harness. Its HTTP boundary, error-map and malformed-catalog probes were
  adopted as `apps/api/tests/votes-edge.test.ts` (6 tests, 50 assertions) in a
  follow-up commit that leaves production bytes unchanged. Its advisories: duplicate
  `addVersionIds` are deduplicated before the RPC while SQL rejects duplicates; the
  incorporation sanitizer accepts an impossible `draft: null`; a direct RPC caller may
  reorder proposal rows against the addition or add unused proposal keys; SQL clamps
  page limits rather than rejecting them. Each is reachable only by calling the RPC
  directly or by an impossible upstream response, so none changes the HTTP contract.
  A documentation error about persisting rejection was corrected.

## Delivery state

Implementation and documentation are complete on `feat/voting`: `327867a` holds the
feature, `fbdb9b8` the verification-derived HTTP regression coverage, and later
commits record the review and publication state without touching production bytes.
Independent verification returned no blocker. Native review approved the candidate and
its acknowledgement burned the authority. Published as
[PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48) with Backend
checks passing in 46 seconds. No merge, hosted migration or deployment is recorded, and
no hosted database change was made.

## Remaining work

- Native review ran after the owner asked for the full lens pass. The assessment was
  raised with the named security item (authenticated RPC surface); consent was granted
  for this candidate, the reliability lens approved it, and the acknowledgement burned
  its authority (`gentle-ai review-acknowledged/v1`, action `acknowledged`). No
  correction round opened. Advisories kept as later work:
  - the upstream PostgREST 401 branch is not exercised by a test, so a regression that
    fell through to the generic 502 would stay green;
  - opening a vote with no draft is documented but only proven at the SQL RPC level,
    not through the route;
  - the electorate count and the electorate insert are two statements. Both run while
    holding the group row lock, and every membership mutation (`join_public_group`,
    `approve_join_request`, `leave_group`, `transfer_ownership`) takes that same lock
    first, so the snapshot is atomic by lock discipline; this is an argument from
    code, not a multi-session test;
  - the five-second timeout is asserted only as the presence of an `AbortSignal`;
  - the incorporation sanitizer accepts a `draft: null` that SQL cannot produce;
  - the tracked SQL suite plans a single pgTAP test and has only run in the scratch
    harness, so a failure yields one TAP result without per-assertion diagnostics.
- Real pgTAP and a multi-session concurrency check need a local Supabase stack;
  hosted proof would need its own explicit authorization.
- Milestone 5 remains a separate branch; the two deliveries will need to be sequenced
  or stacked when publication is implemented.

## References

- [Voting guide](../guides/voting.md)
- [Backend API reference](../reference/backend-api.md)
- [Voting tasks](../../odd/tasks/voting.md)
- [Decision baseline: D7](../decisions/0001-project-baseline.md)
- [Backend roadmap](../plans/backend-roadmap.md)
- [doc04: Persisted pack drafts](doc04-pack-drafts.md)
