# Backend handoff

Snapshot: 2026-11-05. Verify Git and this document before acting.
Current plan: [backend roadmap](plans/backend-roadmap.md).

## Resume here

Continue [account profiles](../odd/tasks/account-profiles.md), not a new product
questionnaire. User requested one final question and then backend implementation.
T1 database layer is complete and reviewed. T2 authenticated HTTP endpoints are
implemented, independently verified, and native review approved without findings;
acknowledgement completed. Published as [PR11](https://github.com/msti1899/modpack-creator-version-final/pull/11)
against `feat/account-profiles`; integration into main remains pending.
Preserve `/me` and public Modrinth behavior. No frontend or cloud/provider setup
is authorized.

## Verified checkpoint

- Branch: `feat/account-profiles-api`, based on `origin/feat/account-profiles`
  at `cd5465d` (merged database PR10). Reviewed HTTP implementation: `f0346fe`;
  resolve passive documentation HEAD from Git.
- Tracker PR9 merged before database PR10. `origin/main` at `422326a` contains the
  earlier plan only; the database implementation is on the feature branch, not
  main. Do not treat the old tracker as draft or assume DB code landed in main.
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
- No new dependencies, migrations, login/provider workflows, or frontend changes.
  T1 and T2 native reviews are approved without findings and acknowledged.
  HTTP PR11 is open against the feature branch. Hosted CI and merge are separate
  from the local evidence above; no merge or deployment was performed.

## Accepted account rules

Baseline [D3](decisions/0001-project-baseline.md) is authoritative: a unique username
for every provider, 3–20 ASCII letters/digits/underscores, preserved display casing
and case-insensitive uniqueness. First rename is immediate; later changes require
30 days; the old name is freed. Password sign-in uses email only. Google/Discord
linking is manual from settings while signed in, never automatic email merging;
unlinking requires another configured access method. Provider/password workflows
remain separate unimplemented work, not evidence of complete milestone 2.

## Environment and delivery

Use pinned commands in `package.json`; check Bun availability. Supabase CLI is
project-local; Docker is required for live database checks. Proof uses disposable
external scratch stacks only; do not reset an existing developer database.

User preference: Gentle AI ODD roles. Explorer `gpt-6-luna`/high; verifier
`gpt-6.1-sol`/medium. Parent writes dependent units inline. The approved chain
strategy is feature-branch-chain. User authorized the earlier database publication; tracker9 and database10
are now merged. User authorized the HTTP push/PR with "push y pr ya a laburar";
PR11 is open against the feature branch. Deployment, cloud configuration,
and merge remain unauthorized.

Preserve unrelated untracked `.atl/`, `.gitattributes`, and `graphify-out/`.
Git hooks may rebuild Graphify data; inspect fresh status before staging.

## Next action

Both profile slices are implemented and reviewed; no review step remains for
their unchanged code. Review HTTP PR11 against `feat/account-profiles`. Final
integration into main requires a separate explicit decision; merging PR11 alone
does not deliver either implementation slice to main. Do not claim the full authentication milestone
complete or reconstruct old review tokens from documentation.
