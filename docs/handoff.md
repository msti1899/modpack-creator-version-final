# Backend handoff

Snapshot: 2026-11-05. Verify Git and this document before acting.
Current plan: [backend roadmap](plans/backend-roadmap.md).

## Resume here

Continue [local email/password access](../odd/tasks/email-password-auth.md).
Registration and login are implemented, independently verified, and native review
approved without findings; acknowledgement completed. Publication remains pending. Username assignment stays a separate authenticated
profile request. No frontend, provider setup or deployment is authorized.

## Verified checkpoint

- Working branch: `feat/email-password-auth`, based on merged `main` at `a71e8ff`.
  Reviewed Auth implementation: `8652e95`; resolve passive documentation HEAD from Git.
- User merged final profile integration PR12: database and profile HTTP code are
  now in main. The previous integration gap is resolved; no agent merge occurred.
- Current Auth proof: types and 41 tests/730 assertions passed, 10 real local
  registration/login/profile flows and 42 prior-route byte comparisons passed.
  Independent verification passed 140 assertions, 36 differentials and five
  confirmation-enabled assertions. Parent spot check passed. Native risk/resilience/
  readability/reliability review approved without findings and was acknowledged.
- Reviewed T1 implementation: `86e168a`; no database bytes changed in T2.
- GET `/profile` reads the caller's username or null; POST assigns it initially;
  PATCH renames an existing profile. User identity and RLS constrain every write.
  See [API reference](reference/backend-api.md) and [profile guide](guides/account-profiles.md).
- Own T2 RED/GREEN covered routes, validation, conflicts and unchanged unknown
  404 behavior. Root types and 35 tests/627 assertions passed; 14 live local
  Hono/Auth/Data API scenarios passed. Twenty-four differential cases matched
  baseline status, headers and exact bytes, including `.mrpack` ZIP output.
- Independent fresh baseline/candidate checks passed (29/531 vs 35/627), plus
  50 live/security/concurrency assertions and 45 pgTAP checks. Real stalled HTTP
  response bodies timed out at five seconds; redirects did not forward tokens.
  Eleven additional differential cases matched. Parent spot check passed.
- No new dependencies, migrations, configured Auth defaults or frontend changes.
  Earlier profile T1/T2 and the credential-route reviews are approved. Confirmation callbacks, recovery and providers remain deferred.
  Credential-route publication, hosted CI and deployment are not claimed.

## Accepted account rules

Baseline [D3](decisions/0001-project-baseline.md) is authoritative: a unique username
for every provider, 3–20 ASCII letters/digits/underscores, preserved display casing
and case-insensitive uniqueness. First rename is immediate; later changes require
30 days; the old name is freed. Password sign-in uses email only. Google/Discord
linking is manual from settings while signed in, never automatic email merging;
unlinking requires another configured access method. Basic email/password access
is now implemented; confirmation/recovery/provider workflows remain unimplemented,
so milestone 2 is not complete.

## Environment and delivery

Use pinned commands in `package.json`; check Bun availability. Supabase CLI is
project-local; Docker is required for live database checks. Proof uses disposable
external scratch stacks only; do not reset an existing developer database.

User preference: Gentle AI ODD roles. Explorer `gpt-6-luna`/high; verifier
`gpt-6.1-sol`/medium. Parent writes dependent units inline. The approved chain
strategy is feature-branch-chain when needed. Prior profile PRs are merged. The
current email/password continuation is local only; push/PR, cloud configuration,
merge and deployment require separate authorization.

Preserve unrelated untracked `.atl/`, `.gitattributes`, and `graphify-out/`.
Git hooks may rebuild Graphify data; inspect fresh status before staging.

## Next action

The local registration/login slice is complete and reviewed. Publish only after
an explicit user request; no remaining review step exists for unchanged `8652e95`.
Confirmation callbacks and password recovery are later work. Do not replay spent
profile/Auth reviews or claim full authentication or production readiness.
