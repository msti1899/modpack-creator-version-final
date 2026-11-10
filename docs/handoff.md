# Backend handoff

Snapshot: 2026-11-07. Verify branch and commit before acting.
Local review chain: `feat/clerk-review-04-api`, based on approved `0e39d0d`.
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
- R4 API cutover: own typechecks and 38 tests / 696 assertions passed;
  15 public-route comparisons matched status, headers and complete body/ZIP bytes.
  Independent verification passed 26 grouped checks and 56 public/profile
  comparisons; frozen offline install preserved the lockfile. Parent repeated
  the root check. Commit/native review are the next local steps.
- The complete `e4dc96a` reference previously passed independent API/database
  integration and credential-free web-build checks. This is not proof of hosted
  provider configuration, current hosted CI or a merged/published result.

## Next action

Finish R4 independent verification, record its result, commit the API work unit,
then assess that exact range against `0e39d0d`. Request fresh native consent if
required; previous grants cover only their own candidates. Continue R5 web account
controls, R6 identity bridge and R7 regression/CI/continuity afterward.

Publication, PR updates, merge, external account configuration and deployment
remain separate user decisions. No remote publication is claimed for this chain.
Use pinned Bun 1.4.4. Never commit credentials or machine-specific review tokens.
