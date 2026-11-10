# Reconcile Clerk with application profiles

Status: Local implementation and verification complete; publication and hosted setup pending.
Source: "Go ahead with the plan." and "Sí, usar directamente el ID de Clerk".
Current checkpoint: [handoff](../handoff.md); [tasks](../../odd/tasks/clerk-reconciliation.md).

## Outcome and boundaries

Resolve PR16 against main using Clerk as the sole account/session provider and
Supabase for application data. Preserve public Modrinth behavior and application
username rules. Separate imported skills; retain existing rows without guessing
identity links. No force-push, provider provisioning, hosted migration or deployment.

## Milestones

| Milestone | Acceptance criteria | Implementation / verification / delivery |
| --- | --- | --- |
| Scope isolation | Original WIP intact; skill assets preserved outside auth scope; no merge markers. | Tooling retained locally; reconciliation in isolated worktree. |
| Profile cutover | Direct Clerk text owners, own-row RLS, restricted grants and unchanged username behavior; legacy rows intact/unlinked. | HTTP and migration checks pass; independent verification passed. |
| Verification and handoff | Root types/tests, web build, differential checks, independent security verification and applicable native review; separate hosted CI evidence. | Local checks/build and independent verification passed; R1–R6 native reviews acknowledged. Final R7 native review explicitly skipped by the user; hosted CI remains unverified. No merge/deploy. |

## Dependencies and open decisions

[ADR0003](../decisions/0003-clerk-profile-ownership.md) resolves ownership. Supabase
must trust the same Clerk instance, whose tokens require the authenticated role;
provider configuration needs explicit authorization. Offline signatures/disposable
DB probes do not prove hosted integration, live login or real email delivery.

Legacy rows remain reserved and inaccessible to Clerk users until a separately
approved ownership-verification process. Never auto-link by email. Skills are
preserved in a local tooling branch; publication and large imported-asset review
are separate from this auth reconciliation.

## Next action

Use the approved [smaller publication boundaries](clerk-publication-slices.md),
then authorize delivery with the intended repository/session. R7 independent
verification passed; the user explicitly skipped its native review on 2026-11-10.
The final regression slice persists legacy-upgrade and configured-control composition
coverage; SDK doubles and local SQL helpers do not establish real provider flows.

## Change log

- 2026-11-06: Recorded approved reconciliation and direct Clerk ownership scope.

- 2026-11-10: Local chain completed; final native review declined only for R7, without disabling future reviews.
