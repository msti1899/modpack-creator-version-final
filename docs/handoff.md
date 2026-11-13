# Current handoff

Checkpoint: 2026-11-12. This worktree has three application branches recorded
separately. Milestone 3 lives on `feat/groups-permissions` (rebased onto `main` at
`9219a87`), committed as `71dac1f` and published in
[PR #45](https://github.com/msti1899/modpack-creator-version-final/pull/45) with
Backend CI passing and its authorized test-project migrations applied. Milestone 4
lives on `feat/pack-drafts`, based on that milestone-3 branch. Application baseline
before documentation publication: `main` at
`22318bced38c3011a656ce85bb47509265800d28`; `a7ae8fb` is an ancestor.
Milestone 6 is being implemented on `feat/voting`, created from `main` at `d5d3c40`
and isolated in its own worktree while milestone 5 is developed separately.
Verify the branch and HEAD before resuming; later documentation commits do not
change that application baseline. This is a resume point, not a session history.

## Current work

Milestone 3 is implemented, committed and published; see
[groups tasks](../odd/tasks/groups-permissions.md), [group guide](guides/groups.md)
and [doc02 evidence](delivery/doc02-groups-permissions.md). The Hono API exposes
thirteen authenticated group operations, including two paged reads. Immediate
ownership transfer was confirmed. That branch adds no frontend or voting, and pack
persistence exists only on the separate milestone-4 branch below.

The user explicitly broadened authorization to necessary implementation and
hosted testing on the selected test project via its current Supabase MCP connection.
The exact SQL was applied once; its generated hosted version was reflected by a
local filename-only rename. All tagged hosted fixtures were removed; the parent
read back zero rows in profiles and the four group tables, with the original
profile hash. Existing account/Clerk configuration was not changed.

Native review found and the parent reproduced a PostgreSQL 17 authenticated-COMMIT
failure in the deferred invoker trigger. Applied forward migration `20261112214259`
fixes only that trigger's privilege context, retaining denied direct table/helper
access. Real authenticated create/join/approval/transfer/departure commits then
passed and their fixtures were removed; the original profile hash is unchanged.
The initial migration bytes remain unchanged. Native targeted validation is pending.

Two manual-review 502 cases were fixed by forward migration `20261112222116`:
name normalization now uses one explicit Unicode contract at SQL, constraint and
HTTP boundaries, and embedded member/request collections are capped at 50 with
keyset cursors plus paged endpoints. Hosted probes with 121 members and 60
requests returned a 6324-byte overview, complete member/request pages, normalized
`Café`, rejected NBSP-only/FEFF names, and zero fixture rows. A local API+SQL
integration probe paginated all 2502 members without loss; 16 focused API tests
(275 assertions) passed after the fix.

Current proof: `bun run check` previously passed 71 tests / 1455 assertions;
rerun it after the pagination/name change before treating this checkpoint as
current. Parent differential passed 17 old/current comparisons. Independent API
verification passed 332 probes and 33 differential comparisons without a
reproduced blocker before this fix. Real PostgreSQL SQL checks and two overlapping
admission races passed. Earlier 235-check PGlite harness results apply only to the
earlier draft, not to the current SQL after removing public discovery and the
ASCII restriction.

Missing proof: actual pgTAP (`bun run db:test` cannot connect without a local
stack), Docker-dependent upgrade runner, and a full real-session group flow
through Clerk/Hono/PostgREST. Manually set database claims do not verify JWT
admission. Hosted security/performance advisor findings and their design context
are recorded in doc02; do not claim a clean report or complete end-to-end proof.

Delivery state: commit `71dac1f`, PR #45, Backend CI passed in 41 seconds. No merge
or deployment is authorized. The PR explicitly records the native-review and proof
gaps below.

Next action: the native review is blocked. Its bound recovery produced a
successor `reviewing` state without a negotiated continuation, and one retained
predecessor STATUS reconciliation was rejected because a successor already exists.
Do not resurrect the predecessor, synthesize a next transition, reuse the
predecessor's captured decline, or disable reviews. Resume only through a
published corrected Gentle AI build or a documented supported native recovery, then
assess the corrected candidate afresh. The earlier assessment was unassessable
because untracked paths were undeclared; it is not approval. Candidate review
consent was granted only for the earlier candidate. Do not reset, delete unrelated
data, change Clerk, publish or merge. Resolve delivery slicing before any commit;
publication and deployment are not authorized. Keep the dashboard open while
review/required proof is pending.

## Milestone 4: persisted drafts

Milestone 4 is implemented on `feat/pack-drafts`, based on `feat/groups-permissions`.
The owner decided that changing a draft's Minecraft version or loader requires the
whole selection to remain compatible; an incompatible change is rejected without
clearing or substituting approved versions. One draft per group is created lazily on
first save; members read and export their own group's draft and only the current owner
writes it. See [draft tasks](../odd/tasks/pack-drafts.md),
[doc04](delivery/doc04-pack-drafts.md) and the
[draft guide](guides/pack-drafts.md).

Proof: RED was observed for the draft HTTP and SQL slices before implementation.
`bun run check` passes 86 tests / 1687 assertions with both app typechecks, and the
focused draft suite passes 14 tests. Independent verification reproduced no blocker
(12 HTTP probes, 73 native SQL assertions, 23 public differential cases unchanged).
Under explicit bounded authorization the draft migration was applied once to the
selected test project and verified at md5/sha256 parity; 100 native PostgreSQL
assertions, a committed authenticated flow and two real two-connection races passed,
and every fixture was removed with the baseline empty-set hash restored. Two native
review candidates were approved and acknowledged; the second approval covers the
current source bytes.

Missing proof: actual pgTAP (local PostgreSQL is unavailable), a signed
Clerk->Hono->PostgREST draft request, and HTTP-side Modrinth validation through a
deployed API. Database checks prove authorization, format and atomicity, not remote
catalog validation or JWT signature admission.

Delivery state: merged to `main` through [PR #46](https://github.com/msti1899/modpack-creator-version-final/pull/46)
(merge commit `2ae50e7`), stacked on the milestone-3 PR #45 (`b648c21`). Backend
checks passed on both before merge. No deployment is recorded. Review advisories
still open as later work: group error-map
HTTP coverage, draft 404 and malformed-body precedence, empty/50/51/duplicate
selection coverage through the routes, focused-test gating, the database suite using
native assertions inside pgTAP framing, absent failure-path observability, no
degraded mode when a pinned version disappears, and the approved irreversible
sole-owner deletion.

## Milestone 6: voting

Milestone 6 is implemented locally on `feat/voting`, created from `main` at
`d5d3c40` and isolated in its own worktree so the milestone-5 work stays untouched.
The four lifecycle rules the roadmap required before implementation were decided and
recorded in D7. Votes are owner-created concrete proposals with a chosen 1–720 hour
duration, a frozen electorate that includes the owner, absolute majority with early
approval, owner cancellation, and a separate owner incorporation action. Approval
never edits, publishes or activates a pack version. See
[voting tasks](../odd/tasks/voting.md), [doc05](delivery/doc05-voting.md) and the
[voting guide](guides/voting.md).

Proof on this branch: both typechecks pass; `bun test` passes 108 tests with 1945
assertions. The tracked `votes.test.sql` holds 68 assertions and passed unchanged in
the isolated supplemental PGlite harness with all eight migrations, while the existing
draft SQL suite still passes; without the votes migration the new suite fails. RED for
the HTTP slice was confirmed against a copy of the base revision in external scratch.
Independent verification reproduced no blocker: S1–S5 met, 179 independent SQL checks,
11 HTTP probe tests, and 55 byte-identical comparisons of the existing routes against
the base revision. Its boundary and error-mapping probes are now tracked.

Missing proof for this branch: real pgTAP (`bun run db:test` needs Docker and a local
stack, both absent here), PostgREST, a signed Clerk→Hono→PostgREST vote request, real
two-session concurrency and hosted migration application. No pull request, merge or
hosted change is recorded.

Native assessment over the committed range returned medium risk with
`review_due_reason: under_budget`, so no review transaction started and no consent was
requested; a later commit may reach the budget, and the owner can request the
four-lens pass explicitly.

Next action on this branch: nothing is required to keep the work; publication, merge,
slicing and any review escalation are separate decisions and are not authorized yet.

## Previous documentation delivery

The documentation reorganization starts the numbered delivery record at
[doc01](delivery/doc01-documentation-reorganization.md). Earlier work remains in
its existing records; [the previous handoff](handoff-history-2026-11-12.md)
preserves the original checkpoint and workstation reports in full.
Doc01 is structurally verified; local application checks were not rerun.

That previous delivery changed documentation only. Pre-existing local changes in
`apps/web/next-env.d.ts` and `docs/guides/local-identity.md`, untracked `.atl/`,
and generated `apps/web/AGENTS.md` are unrelated and must be preserved.
Publication uses two sequential PRs to `main`: history preservation, then this
reorganization. See doc01 and the GitHub PR records for CI and merge evidence;
publication does not authorize deployment or external service changes.

## Application checkpoint

The following application results were recorded before this documentation
delivery; they were not rerun during it:

- Clerk owns accounts and sessions. Hono verifies Clerk tokens for `/me` and
  protects profile endpoints; Supabase remains the profile database. Public
  Modrinth search, resolution and `.mrpack` export remain implemented.
- Local `bun run check` passed with 56 tests / 1200 assertions, and the production
  build passed. See the [startup/configuration evidence](handoff-history-2026-11-12.md#local-startup-correction-and-api-configuration).
- Two disposable users completed real Clerk Development password sign-in and
  web/API session checks. Anonymous requests and altered signatures returned
  401; sign-out cleared the web session. Both fixtures were removed. See the
  [identity-test evidence](handoff-history-2026-11-12.md#real-identity-tests-and-remaining-prerequisites-2026-11-12).
- Hosted profiles/RLS were blocked in that earlier checkpoint because tested JWTs
  lacked a signed `role: "authenticated"` and hosted `public.profiles` was absent.
  That block was later removed with explicit authorization: the three repository
  migrations are applied to the selected test project, Clerk Development signs the
  role claim, Supabase trusts the Clerk issuer, and real-session profile lifecycle
  plus cross-user isolation passed. All fixtures were removed and
  `public.profiles` is back to zero rows. Full OAuth and real email delivery remain
  unverified. Offline JWT expiry still limits immediate revocation.

Earlier application merge/review records are historical evidence in the archived
handoff and [feature log](../odd/tasks/clerk-auth-replacement.md). Local ancestry
was checked for this checkpoint; earlier application PR/CI state was not rechecked. No deployment
has been recorded. Services were last recorded as running; liveness is not freshly
verified and must not be inferred from this document.

## Resume

1. Verify the branch, commit and local changes against this snapshot. Preserve
   ignored environment files and unrelated work.
2. For startup, use the [recorded localhost-binding workaround](handoff-history-2026-11-12.md#local-startup-correction-and-api-configuration).
   For current development scope, read [roadmap milestone 3](plans/backend-roadmap.md#delivery-order)
   and [groups tasks](../odd/tasks/groups-permissions.md); milestone 2 proof below is historical.
3. Hosted preparation is done under explicit user authorization: the three
   repository migrations are applied to the selected test project, the Clerk
   Development instance signs `role: "authenticated"`, and the user enabled the
   Clerk provider in Supabase third-party auth. All three were verified by
   readback and by real sessions; see
   [the hosted verification record](../odd/tasks/hosted-profile-verification.md).
4. Hosted Clerk → Supabase trust is now enabled by the user and verified with real
   sessions: profile lifecycle, cross-user isolation, denied delete/column writes,
   anonymous and malformed-token rejection all behaved as specified, and the
   fixture rows/users were removed afterwards.
5. Remaining unverified areas are only those needing separate accounts or mailboxes:
   full Google/Discord OAuth completion and real email delivery. Do not claim them
   from the `+clerk_test` OTP path. See
   [the hosted verification record](../odd/tasks/hosted-profile-verification.md).

Two fixture profile rows and both fixture users were created only for these checks
and then deleted; `public.profiles` is back to zero rows. The earlier fixture-only
authorization does not authorize resets, unrelated hosted settings or
external-provider changes. Full OAuth/email verification additionally needs
controlled provider accounts and a real test inbox. Do not access ambient CLI
sessions or credentials beyond the explicitly authorized test projects.

## Documentation maintenance

Use [the documentation index](README.md) to choose the owning document. Complete
work units get a [numbered delivery record](delivery/README.md); interruptions
update this checkpoint. No retrospective doc numbers are assigned to earlier work.
