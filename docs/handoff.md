# Current handoff

Checkpoint: 2026-11-12. Application baseline before documentation publication: `main` at
`22318bced38c3011a656ce85bb47509265800d28`; `a7ae8fb` is an ancestor.
Verify the current branch and HEAD; later documentation commits do not change
that application baseline. This is a resume point, not a session history.

## Current work

The documentation reorganization starts the numbered delivery record at
[doc01](delivery/doc01-documentation-reorganization.md). Earlier work remains in
its existing records; [the previous handoff](handoff-history-2026-11-12.md)
preserves the original checkpoint and workstation reports in full.
Doc01 is structurally verified; local application checks were not rerun.

The current delivery changes documentation only. Pre-existing local changes in
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
   For development scope, read [roadmap milestone 2](plans/backend-roadmap.md#delivery-order).
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
