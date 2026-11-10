# Backend handoff

Snapshot: 2026-11-07. Verify branch and commit before acting.
Local review chain: `feat/clerk-review-05-web-accounts`, based on approved `6fa889b`.
Complete reconciled application reference: `feat/clerk-reconcile` at `e4dc96a`.
Plan: [backend roadmap](plans/backend-roadmap.md), milestone 2.

## Resume here

Clerk replaces Supabase Auth; Supabase remains the application database.
Profile owners use Clerk IDs directly. Legacy UUID-owned rows remain unchanged
as text, unlinked and inaccessible to Clerk sessions; do not link by email.
Read [reconciliation tasks](../odd/tasks/clerk-reconciliation.md) for specs,
review boundaries and exact remaining work, and [ADR0002](decisions/0002-clerk-identity.md)
for the provider decision.

The original checkout has unrelated Supabase session-lifecycle work. Preserve it.
Continue only in the isolated Clerk worktree. Review children are not independent
deployment candidates. Do not apply the partial chain to a live database.

## Verified local checkpoints

- R1 `54b326f`: profile owner migration and policies reviewed and acknowledged.
  Its legacy-upgrade regression coverage warning remains assigned to R7.
- R2 `d95c577`: independent guarded database configuration reviewed and acknowledged.
- R3a `0e94233` and R3b `0e39d0d`: obsolete Supabase account proxies retired,
  reviewed and acknowledged. These review authorities are spent; do not replay.
- R4 `6fa889b`: API Clerk identity/profile cutover independently verified,
  then native four-lens review approved without findings and acknowledged.
- R5 web controls: typechecks and 39 tests / 698 assertions, offline frozen
  install and credential-free production build passed independently. Local
  fallback-page browser QA passed with no JavaScript errors or axe violations.
  Configured Clerk dialogs and real provider flows were not exercised.
- The complete `e4dc96a` reference previously passed independent API/database
  integration and credential-free web-build checks. This is not proof of hosted
  provider configuration, current hosted CI or a merged/published result.

## Next action

Commit R5 and assess its exact range against `6fa889b`; request fresh consent
when required. Continue R6 same-origin identity bridge and R7 regression/CI/
continuity. The current `/api/me` link deliberately awaits R6; this partial chain
is not independently deployable. Prior review grants cover only their candidates.

Publication, PR updates, merge, external account configuration and deployment
remain separate user decisions. No remote publication is claimed for this chain.
Use pinned Bun 1.4.4. Never commit credentials or machine-specific review tokens.
