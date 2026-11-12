# Current handoff

Checkpoint: 2026-11-12. Active branch: `feat/groups-permissions` (rebased onto
`main` at `9219a87`). Milestone 3 implementation is committed as `71dac1f` and published
in [PR #45](https://github.com/msti1899/modpack-creator-version-final/pull/45);
Backend CI passed. Its authorized test-project migrations are applied.
Application baseline before documentation publication: `main` at
`22318bced38c3011a656ce85bb47509265800d28`; `a7ae8fb` is an ancestor.
Verify the current branch and HEAD; later documentation commits do not change
that application baseline. This is a resume point, not a session history.

## Current work

Milestone 3 is implemented, committed and published; see
[groups tasks](../odd/tasks/groups-permissions.md), [group guide](guides/groups.md)
and [doc02 evidence](delivery/doc02-groups-permissions.md). The Hono API exposes
thirteen authenticated group operations, including two paged reads. Immediate
ownership transfer was confirmed. No frontend, persisted pack or voting was added.

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
