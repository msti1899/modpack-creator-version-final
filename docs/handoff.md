# Backend handoff

Snapshot: 2026-11-05. Verify current Git/PR state before acting.
Application checkpoint: `main` at `d9e72d8`, after merged [PR13](https://github.com/msti1899/modpack-creator-version-final/pull/13).
Plan: [backend roadmap](plans/backend-roadmap.md), milestone 2.

## Resume here

Profiles and local email/password registration/login are merged into main.
Email confirmation and password recovery are implemented locally on
`feat/email-confirmation-recovery` at `bda4665`: functional and independent checks
passed; native review approved and acknowledged. Publication remains pending;
this feature is not merged.
Frontend, real email/provider setup and deployment remain out of scope.

## Current backend

- Public Modrinth search, dependency resolution and `.mrpack` export are stateless.
- `/me` validates Supabase user sessions. GET/POST/PATCH `/profile` read, assign
  and rename the caller's username under database RLS and restricted grants.
- POST `/auth/register` and `/auth/login` delegate email/password access to
  Supabase Auth. Username assignment remains a separate authenticated step.
- Profile integration [PR12](https://github.com/msti1899/modpack-creator-version-final/pull/12)
  and credential [PR13](https://github.com/msti1899/modpack-creator-version-final/pull/13)
  are merged. The earlier tracker-order integration gap is resolved.

- POST `/auth/verify` exchanges signup/recovery email hashes for JSON sessions;
  POST `/auth/recover` acknowledges requests generically; PATCH `/auth/password`
  updates only the authenticated user's password. No callback redirects or GET
  token consumption. See [current feature tasks](../odd/tasks/email-confirmation-recovery.md).

Contracts and limits: [API reference](reference/backend-api.md).
Local flow: [account access](guides/local-account-access.md) and [profiles](guides/account-profiles.md).
Accepted product rules: [baseline D3](decisions/0001-project-baseline.md).

## Verified evidence

- Current candidate: typechecks and 46 tests / 919 assertions passed.
- Own 54 baseline comparisons matched status, headers and full bytes, including
  credential inputs and `.mrpack` ZIP. Parent repeated the five new route tests.
- Independent verification: 46 probes passed in fresh scratch state with a
  disposable confirmation-enabled Supabase stack, including real email-token
  verification, expiry/replay rejection, password recovery, account isolation,
  unchanged state after rejection and streamed-response timeout. Four independent
  baseline comparisons matched. No production email delivery was tested.
- Earlier profile and registration/login native reviews were approved and spent;
  do not replay them. Confirmation/recovery review also approved all four lenses
  without findings; terminal acknowledgement completed. Do not replay this review.

## Remaining work and working rules

Next action: publish the completed local feature only after explicit user authorization.
Refresh/logout and Google/Discord linking remain unimplemented. Groups, saved
packs, publications and votes are later roadmap milestones. Local success does not establish complete authentication or production readiness.

Use pinned commands in `package.json` and the local guides; verify Bun availability.
Live database tests require disposable local Supabase/Docker state. Do not reset
an existing developer database or configure external accounts without authorization.
Preserve unrelated `.atl/`, `.gitattributes` and `graphify-out/`; hooks may rebuild
Graphify data. Use Gentle AI ODD roles: explorer `gpt-6-luna`/high, verifier
`gpt-6.1-sol`/medium; parent writes dependent work inline. Use feature-branch-chain
when a feature needs review slices. Publication, merge and deployment permissions
are scoped to each user request, not blanket approval for future work.
