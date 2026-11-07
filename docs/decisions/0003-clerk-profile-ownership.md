# 0003: Direct Clerk profile owners

- Date: 2026-11-06
- Status: Accepted; implementation and verification tracked separately.
- Source: "Sí, usar directamente el ID de Clerk" after approval of PR16 reconciliation.
- Supersedes: ADR0002's initial exclusion of profile schema migration only.

## Decision and consequences

Store the Clerk `user_...` subject directly as text in `profiles.user_id`. Preserve
the profile API and existing username constraints, uniqueness and rename cooldown.
Clerk remains the sole account/session provider; Supabase remains the database.

Use a forward migration, not edits to applied history. Remove the obsolete
`auth.users` foreign key and UUID-only ownership policies. New RLS compares the
signed subject to the row's Clerk owner. Keep restricted column grants and deny
anonymous reads, deletion, ownership changes and forged cooldown timestamps.

Existing UUID-owned rows and names remain intact but unlinked; no email matching,
new-owner guess, data deletion or account import is performed. An explicit future
continuity process must prove ownership before any reassignment. The trade-off is
provider-specific owner IDs and a required migration/trust cutover instead of an
additional UUID-to-Clerk mapping table.

The API separately guards database configuration and accepts only signed tokens
with the authenticated database role for profile access. Hosted Supabase must
trust the same Clerk instance. Setting up that trust, real provider accounts and
rollout/backups are separate operations, not authorized by this decision.

This is a review-only feature-chain slice, not an independently deployable change.
Apply it with the Clerk API cutover in an authorized maintenance/rollout plan:
these policies intentionally stop legacy Supabase Auth subjects accessing profiles.
