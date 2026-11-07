# 0002: Clerk identity, Supabase database

- Date: 2026-11-05
- Status: Accepted
- Implementation: Local integration in progress; see [task evidence](../../odd/tasks/clerk-auth.md).
- Source: "ok entonces me parece bien, empezemos a integrar clerk en la estructura actual"
- Supersedes: authentication provider in 0001/D8 and auth-email prerequisite in 0001/D10 only.

## Decision and boundaries

Use Clerk for accounts and sessions, keeping Next.js and Hono independent and
Supabase as PostgreSQL. Add basic Clerk account controls and let a same-origin
web adapter forward the session to the independent Hono `/me` endpoint.
Groups, invitations, ownership and voting remain application-owned; do not
replace them with Clerk Organizations by implication.

The API uses a configured RSA JWT public key, explicit issuer and allowed browser
origins, not decoded unsigned claims or the old Supabase Auth endpoint. Preserve
`{user:{id,email|null}}`, with opaque Clerk IDs and nullable signed-claim email.
No profile synchronization, database migration, provider account or user import
is performed. Deployed installations require an explicit account-continuity and
session-cutover plan before replacement; do not silently abandon existing users.

## Rationale and trade-offs

Clerk provides ready-made account UI and session workflows, reducing integration
work on the frontend. The user reports GitHub Student Developer Pack access;
benefit redemption is not verified and the design must not assume perpetual Pro
features. The trade-offs are another provider, provider-specific IDs, key-rotation
operations and eventual pricing/eligibility constraints. Offline verification
avoids per-request Auth lookup but cannot guarantee immediate logout revocation.

Brevo is not a prerequisite for Clerk-managed authentication. Existing provider
settings are untouched. Google/Discord, email/recovery delivery, production DNS,
student-benefit activation and Supabase third-party RLS setup require separately
authorized setup and live verification. No deployment or publication is approved
by this decision.
