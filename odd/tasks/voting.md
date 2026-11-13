# Voting

Branch: `feat/voting`, based on `main` at `d5d3c40` (milestones 1-4 merged; milestone 5
is being developed on a separate branch). Delivery: ask-on-risk; no pull request or
merge authorized. Forecast: 900-1300 authored changed lines.
Runners: `bun test apps/api/tests/votes.test.ts`, `bun run check`, and `bun run db:test`
when a local Supabase stack is available. The tracked SQL suite cannot substitute for
real pgTAP, PostgREST or multi-session concurrency.

## Specs

- S1: Approved roadmap milestone 6: "Owner-created concrete proposals and chosen
  duration, fixed electorate, absolute majority, early approval, and binding owner
  incorporation without automatic publication."
- S2: Existing D7 (unchanged): "Only the owner starts mod-addition votes and chooses
  each vote's duration." "Resolve the exact mod version and confirm its dependencies
  before opening a vote, so the group votes on a concrete addition." "Fix the
  electorate at vote creation, including the owner. Later joiners do not participate in
  that vote or change its approval threshold." "Approval requires affirmative votes
  from more than half of that electorate." "Approve immediately when that majority is
  reached, without waiting for the deadline." "An approved result is binding: the owner
  must incorporate the addition. Approval does not itself edit, publish, or activate a
  pack version."
- S3: Decisions of 2026-11-12, now recorded in D7: a member may change their own ballot
  while the vote stays open and only the latest ballot counts; reaching the majority
  closes the vote immediately and no later ballot is accepted; the owner may cancel an
  open vote, which is terminal and adds nothing; a departure does not change the frozen
  electorate or the majority threshold, so cast ballots stay counted and a missing
  ballot stays an absence; one group may hold several independent open votes at once;
  a vote that reaches its deadline without the majority ends rejected.
- S4: Boundaries: backend only. Publication, active-version selection and sharing stay
  in milestone 5; approval and incorporation never create, activate or publish a
  version. No frontend or CD. Clerk remains the identity provider and the caller's
  token is forwarded with a publishable key, never a service-role credential.
  Public Modrinth search, resolution and `.mrpack` export behavior is unchanged.
  Hosted database work needs its own explicit authorization.
- S5: Existing D2/D5/D6 constraints that limit this slice: "Only the owner edits the
  group's modpack"; "If the owner is the only member and leaves, delete the group and
  its modpack rather than archiving them"; a draft's Minecraft version and loader may
  change only while the whole explicit selection stays compatible; stored Modrinth
  version IDs stay pinned and are never silently resolved or substituted.

Implementation choices (not additional product requirements): a vote snapshot stores
the pinned addition IDs plus the display labels read at creation, so a later catalog
change cannot rewrite what the group voted on; opening a vote is refused when the
group draft was saved by someone else in between (`revision` compare-and-swap, reusing
the draft convention); incorporation merges the pinned addition into the current draft
under the same revision compare-and-swap and the same compatibility rules as a draft
save, and a conflict rejects the incorporation without changing the draft or the vote;
durations are bounded to 1-720 hours; a vote past its deadline without the majority
reads as rejected and every write path refuses it instead of mutating the row, because
no scheduler exists.

## Tasks

- T1 [S1-S5] Migration and SQL RPCs: vote, frozen electorate and ballot tables with the
  established `revoke all` plus `security definer` RPC pattern, ownership and membership
  enforcement, ballot upsert with early approval, cancellation, deadline rejection,
  incorporation compare-and-swap, and paged reads. Route: inline. Status: complete
  locally (`20261112233000_group_votes.sql`, renumbered after milestone 5 kept
  `20261112230000`); real pgTAP unavailable.
  Risk: items 1, 2, 3, 4 and 6.
- T2 [S1-S5] API: exported addition-validation helper reusing the existing catalog and
  selection rules, vote routes with body caps and error mapping, HTTP tests against the
  fake PostgREST and Clerk fixtures. Route: inline. Status: complete locally; 16
  focused tests / 185 assertions, full suite 102 tests / 1895 assertions, both
  typechecks. Risk: items 1, 2, 3 and 6.
- T3 [S1-S5] Native SQL suite under `supabase/tests/database/` for authorization,
  electorate freeze, majority, early approval, cancellation, deadline rejection,
  incorporation compare-and-swap and rejected-write state. Route: inline. Status: 68
  assertions written; passed unchanged in the isolated supplemental PGlite harness
  with all migrations and failed without the votes migration; real pgTAP, PostgREST
  and real concurrency unproven.
- T4 [S1-S5] Documentation: guide, backend API reference, delivery record, roadmap,
  handoff and index links. Route: inline. Status: complete; doc06 added.
- T5 [S1-S5] Independent verification of the named high-risk items and native candidate
  review under its own consent. Route: delegated verification for named items.
  Status: verification returned no blocker and met S1-S5 across 179 independent SQL
  checks, 11 HTTP probe tests and 55 byte-identical comparisons against the base
  revision; five advisories were recorded and one documentation inconsistency was
  corrected. Native review approved the candidate and burned its acknowledgement;
  no correction round opened. Commit: none.
- T6 [S1-S5] Verification-derived regression coverage: boundary caps, the full error
  mapping, malformed catalog data on the open path. Route: inline. Status: complete;
  `apps/api/tests/votes-edge.test.ts` passes 6 tests / 50 assertions. Production bytes
  are unchanged by this task. Commit: follow-up commit.

## Log

- L1: Work on milestone 6 started on 2026-11-12 in its own worktree and branch so the
  milestone-5 work in the main checkout stays untouched. Scope came from the approved
  roadmap row and the existing decision baseline.
- L2: The four lifecycle rules the roadmap required before implementation were decided
  on 2026-11-12: ballot changes until the majority, owner cancellation while open, a
  frozen electorate unaffected by departures, and several independent open votes per
  group. Recorded in D7; expiry without majority is recorded as rejection.
- L3: A read-only explorer mapped the existing vertical slice. Findings used for these
  tasks: all client access goes through `security definer` RPCs after an explicit
  `revoke all`; the API derives the caller from the verified Clerk subject and forwards
  the unchanged bearer token; SQL raises `P0001` with stable English messages that each
  router maps to HTTP statuses; pagination is inline keyset with a `<micros>.<userId>`
  cursor; the catalog and selection helpers in `apps/api/src/modrinth.ts` are module
  private except `validateDraftSelection` and `exportPack`.
- L4: Because no single-version seam is exported, the parent will add one narrow
  exported validation helper instead of duplicating the compatibility rules, and will
  keep the public resolution and export paths untouched.
- L5: The explorer also recorded documentation maintenance points: a new guide plus a
  `docs/README.md` link, a reference section, a delivery record after doc04, the
  handoff checkpoint, the roadmap row and change log, and two stale status sentences
  that mention voting as unplanned.
- L6: The schema stores the pinned addition plus a display snapshot, keeps the
  electorate in its own snapshot table with a composite foreign key on ballots, and
  derives rejection from `closes_at` because no scheduler exists. Opening and
  incorporating lock the group row first and reuse the draft revision compare-and-swap;
  ballots lock only the vote row, so no lock cycle exists with draft saves.
- L7: The HTTP slice was implemented before its test file was written, so RED was not
  observed live. RED was verified afterwards against a copy of the base revision in
  external scratch: 16 of 16 new tests failed there, and the two suites covering the
  changed module produced identical results in both trees (14 tests / 478 assertions).
- L8: The SQL slice has real RED/GREEN evidence: the tracked suite passes unchanged in
  the isolated supplemental PGlite harness with all eight migrations, fails when the
  votes migration is skipped, and the existing draft suite still passes with the new
  migration applied. This harness is external scratch and is not committed.
- L9: Limitation: this environment has no Docker and no local PostgreSQL, so
  `bun run db:test` could not run. The tracked suite is written for pgTAP framing but
  has only executed in the scratch harness. PostgREST, signed-session transport, real
  concurrency and hosted application remain unproven.
- L10: Independent verification ran in fresh external scratch on the committed
  candidate and reproduced no blocker: S1-S5 met, 179 independent SQL checks, 11 HTTP
  probe tests with 296 assertions, 55 byte-identical comparisons of the existing
  routes against the base revision, and both the tracked vote and draft SQL suites
  passing under an independently built PGlite harness. Real pgTAP, PostgREST,
  multi-session concurrency and hosted application stayed unverified there too.
- L11: Advisories from verification: duplicate `addVersionIds` are deduplicated before
  the RPC while SQL rejects duplicates; the incorporation response sanitizer accepts
  an impossible `draft: null`; a direct RPC caller can send proposal and addition in a
  different order or add unused proposal keys; SQL clamps page limits instead of
  rejecting them; and the task document wrongly described write paths as persisting
  rejection. Only the documentation wording was corrected; the rest are direct-RPC
  hardening notes, not behavior the HTTP contract exposes.
- L12: The verification report supplied runnable probes. The HTTP boundary, error-map
  and malformed-catalog cases were adopted as `votes-edge.test.ts` in a follow-up
  commit that does not change production bytes; the overlapping SQL probes were not
  duplicated.
- L13: Native assessment over `d5d3c40..fbdb9b8` (committed only, untracked tooling
  excluded) returned medium risk with reason `executable_change` and
  `review_due: false`, `review_due_reason: under_budget`.
- L14: The owner asked for the full lens pass. The assessment was raised with the named
  security item, consent was granted for this candidate, the native plan selected one
  lens (`review-reliability`), and that lens approved the candidate with six
  non-blocking advisories. The acknowledgement burned the authority
  (`gentle-ai.review-acknowledged/v1`, action `acknowledged`); no correction round
  opened and no later re-review of these bytes is warranted.
- L15: Advisory analysis: the electorate snapshot advisory holds by lock discipline,
  not by test. `open_group_vote` counts members and inserts electorate rows while
  holding the group row lock, and every membership mutation takes that same lock
  first, so no membership change can interleave; real multi-session concurrency is
  still unproven. The other advisories are test-coverage gaps (upstream 401, no-draft
  route, timeout value, single-plan TAP output) and one impossible upstream shape
  (`draft: null` on incorporation). All are recorded as later work.
- L16: The owner authorized publication. The branch was pushed and published as PR #48
  against `main` with Backend checks passing in 46 seconds. Merge, deployment and any
  hosted migration remain separate unauthorized decisions.

- L17: Milestone 5 merged to `main` first (PR #49, `e60a816`), so this branch merged
  `main` and renumbered its two colliding identifiers: the votes migration became
  `20261112233000_group_votes.sql` and the delivery record became `doc06-voting.md`.
  Conflicts in `apps/api/src/index.ts` and five documents were resolved by keeping both
  features: both routers mounted, both API sections, both guides and both delivery
  records, and one handoff checkpoint. After the merge `bun run check` passes 125 tests
  / 2310 assertions, and all nine migrations plus the publication, votes and draft SQL
  suites pass in one isolated PGlite session. Backend checks passed in 45 seconds on
  the merged head.
- L18: Merged to `main` through PR #48 as `ea2c43f` after the branch-integrated head
  passed Backend checks. The pre-merge verification ran with `main` already merged in,
  so the merged tree is the tree that was tested. Hosted migration application and
  deployment remain separate authorization.
