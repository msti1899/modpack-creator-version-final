# Backend handoff

Snapshot: 2026-11-10. Verify branch/commit before acting.
Preserved review checkpoint: `feat/clerk-review-07-regression` at `990444f`.
Publication reconstruction: `feat/clerk-chain-07c-continuity`; see
[smaller-boundary tasks](../odd/tasks/clerk-publication-slices.md).
Application source and migration reference: `feat/clerk-reconcile` at `e4dc96a`.
Plan: [Clerk reconciliation](plans/clerk-reconciliation.md), backend milestone 2.

## Resume here

Clerk is the sole account/session provider; Supabase stores application data.
Profile owners use Clerk IDs directly. Legacy UUID rows remain retained as text,
unlinked and inaccessible to Clerk users. Never link by email or release their
reserved names without a separately approved ownership-continuity process.
See [tasks](../odd/tasks/clerk-reconciliation.md) and
[ownership decision](decisions/0003-clerk-profile-ownership.md).

The original checkout has unrelated Supabase session-lifecycle work. Preserve it.
All reconciliation work is isolated. The review children are not independently
deployable, and no live migration or external provider setup has been performed.

## Verified checkpoints

R1 `54b326f`, R2 `d95c577`, R3a `0e94233`, R3b `0e39d0d`, R4 `6fa889b`,
R5 `34a1dbc` and R6 `3f6a3d4` native reviews were approved and acknowledged.
Those authorities are spent; never replay them. R1 and R5 had non-blocking
coverage warnings; R7 adds persisted upgrade and configured-control regressions.

R6 independent proof included root 44 tests / 742 assertions, credential-free
build, 30 grouped security/transport probes and 15 public byte/header/status/ZIP
comparisons. Real local RSA→HTTP bridge→Hono was exercised, not real Clerk login.

R7 own root check passed 55 tests / 1195 assertions. The disposable PostgreSQL
upgrade passed; omitting the upgrade failed the negative control. Configured
signed-in/out composition uses isolated SDK doubles, not real provider dialogs.
Independent verification passed install/build, public differentials and source
fidelity. One runner cleanup defect was corrected; targeted positive/failing
upgrade rechecks removed owned containers and volumes without changing prior
resource inventories. No open findings. The user declined the final R7 native
review for this candidate only; no R7 native review record or approval is claimed.
Future reviews remain enabled.
Application source, migrations and lock match the complete `e4dc96a` reference;
regression coverage and continuity records intentionally advance beyond it.

## Next action and missing proof

Local implementation and verification are complete; final native review was
explicitly skipped. Do not reopen it automatically or replay earlier approvals.
Smaller publication boundaries are reconstructed without changing the verified
application, migrations or lock. Every child must stay at or below 400 changed
lines against its immediate parent; independent verification passed, including
a targeted correction of an intermediate documentation link. No exceptions are
needed. See the [publication boundaries](plans/clerk-publication-slices.md). Existing remote PR16 has not been updated by this chain.

Next action: confirm the GitHub session/destination before remote inspection and
publication of the tracker plus 12 children. No remote operation has occurred.

Hosted CI has not run on these local commits. The workflow is configured, not
proven green on GitHub. Hosted Clerk/Supabase trust, actual signup/login/email,
Google/Discord and account linking remain unverified and require authorized
service configuration. No production-readiness claim follows from local tests.
Publication, PR changes, merge and deployment remain separate user decisions.
Use pinned Bun 1.4.4; keep credentials and machine-specific tokens out of docs.
