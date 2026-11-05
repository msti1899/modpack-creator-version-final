# Backend handoff

Snapshot: 2026-11-05. Verify current Git/PR state before acting.
Application checkpoint: `main` at `d9e72d8`, after merged [PR13](https://github.com/msti1899/modpack-creator-version-final/pull/13).
Plan: [backend roadmap](plans/backend-roadmap.md), milestone 2.

## Resume here

Profiles and local email/password registration/login are implemented, verified,
reviewed and merged into main. No implementation or review remains pending for
those unchanged slices. The next unfinished scope is local email confirmation
callbacks and password recovery; it is not implemented by this documentation update.
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

Contracts and limits: [API reference](reference/backend-api.md).
Local flow: [account access](guides/local-account-access.md) and [profiles](guides/account-profiles.md).
Accepted product rules: [baseline D3](decisions/0001-project-baseline.md).

## Verified evidence

- Latest implementation checks: types and 41 tests / 730 assertions passed.
- Registration/access: 10 own real local flows and 42 prior-route byte comparisons;
  independent verification passed 140 assertions, 36 differentials and five
  confirmation-enabled assertions. These are observed slice checks, not a new run
  performed for this documentation refresh or proof of real email delivery.
- Native risk/resilience/readability/reliability reviews approved profiles and
  credential routes without findings; acknowledgements completed. Do not replay
  those spent reviews. Detailed history: [profile tasks](../odd/tasks/account-profiles.md)
  and [credential tasks](../odd/tasks/email-password-auth.md).

## Remaining work and working rules

Confirmation callbacks, recovery, refresh/logout and Google/Discord linking flows
remain unimplemented. Groups, saved packs, publications and votes are later roadmap
milestones. Local success does not establish complete authentication or production readiness.

Use pinned commands in `package.json` and the local guides; verify Bun availability.
Live database tests require disposable local Supabase/Docker state. Do not reset
an existing developer database or configure external accounts without authorization.
Preserve unrelated `.atl/`, `.gitattributes` and `graphify-out/`; hooks may rebuild
Graphify data. Use Gentle AI ODD roles: explorer `gpt-6-luna`/high, verifier
`gpt-6.1-sol`/medium; parent writes dependent work inline. Use feature-branch-chain
when a feature needs review slices. Publication, merge and deployment permissions
are scoped to each user request, not blanket approval for future work.
