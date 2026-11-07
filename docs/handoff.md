# Clerk integration handoff

Snapshot: 2026-11-05. Verify branch/commit and fresh Git status before acting.
Plan: [backend roadmap](plans/backend-roadmap.md); specs/evidence: [Clerk task log](../odd/tasks/clerk-auth.md).

## Resume here

Work is local in a feature chain rooted at `feat/clerk-auth`, based on `main` at
`d9493dcbeda0b7d983662cf31d33c4419e9501ea` (identity PR #8 merged).
The former handoff's claim that the identity PR had not been opened is obsolete.
Child 01 `feat/clerk-auth-01-api` is committed at `d5b1536`, locally checked and
native-reviewed/acknowledged. Remaining web/bridge/continuity changes are not
committed. No change is published or merged; no push/PR is authorized.

## Current source and proof

- Hono `/me` verifies Clerk signatures/timing with a configured RSA public key,
  then checks issuer, allowed browser origin and user-session identity. Old
  Supabase Auth tokens are no longer accepted. Public Modrinth routes remain
  unchanged. Email is nullable and only comes from a signed string claim.
- The web conditionally mounts ClerkProvider, includes sign-in/sign-up/account
  controls, and forwards its authenticated session server-side from `/api/me`
  to Hono `/me`. Missing setup leaves the public page usable and fails identity
  closed. No groups, profiles, persistence or database/RLS configuration added.
- Baseline before implementation: types, 29 tests/531 assertions and web build
  passed with Bun 1.4.4. API and web changes each have observed RED then focused
  GREEN. Final root types and 40 tests/1,019 assertions passed on Bun 1.4.4; web build and
  credential-free production smoke passed. Public route status/headers/body/ZIP
  bytes matched the baseline. Independent security verification met S1–S3 with
  no blockers; parent spot-check passed and probes were added as regressions.
- The old Supabase identity review does not cover this new candidate. Native
  assessment reports high/review due for the feature. Child 01's four-lens review
  was granted, completed approved, and acknowledged; no correction opened.
  Two non-blocking advisories are in the task log. Remaining slices are not yet
  reviewed. Hosted CI, cloud setup and real login/email/OAuth remain unverified.

## Configuration and limits

Follow the [identity guide](guides/local-identity.md). Both apps must use the same
Clerk instance. Web secret keys stay server-only; API receives only the JWT
public key, issuer and allowed origins. Do not read/post real env files or tokens.
The production web must be built with its Clerk configuration. No external
account setup, Student Pack redemption, email/OAuth or DNS changes were performed.

Offline JWT validation does not promise immediate logout revocation. Key rotation
requires updating API configuration. Supabase local database tooling is unchanged;
future Clerk-to-Supabase RLS access needs its own explicit setup and policies.

## Environment and next action

Project requires Bun 1.4.4. A temporary pinned runtime was prepared outside the
worktree; resolve its current location from session handoff rather than hardcoding
machine paths here. No system Bun or Docker changes were made. Next prepare child
02 web account controls from child 01, then child 03 session bridge and child 04
continuity records. Each child targets its immediate parent. Check the exact
staged tree, keeping scratch HOME outside the project to avoid Turbopack root
inference failure, then perform its native assessment/review. Do not repeat the
completed independent sweep for unchanged application behavior.

Preserve unrelated untracked `.agents/`, `.atl/`, and `skills-lock.json`. User
authorized only narrow template-edit confirmation exceptions after `.env.example`
was caught by a secret-file deny; actual secret-file protections remain intact.
