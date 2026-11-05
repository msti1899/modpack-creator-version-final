# Backend handoff

Snapshot: 2026-11-05. Verify Git and this document before acting.
Current plan: [backend roadmap](plans/backend-roadmap.md).

## Resume here

Continue [account profiles](../odd/tasks/account-profiles.md), not a new product
questionnaire. User requested one final question and then backend implementation.
T1 database layer is complete and reviewed. T2 authenticated HTTP endpoints are
implemented, independently verified, and native review approved without findings;
acknowledgement completed. HTTP PR11 merged into `feat/account-profiles`.
Final [integration PR12](https://github.com/msti1899/modpack-creator-version-final/pull/12)
is open in draft against `main`; no merge or deployment is authorized.
Preserve `/me` and public Modrinth behavior. No frontend or cloud/provider setup
is authorized.

## Verified checkpoint

- Integration branch: `feat/account-profiles`, containing merged DB PR10 and HTTP
  PR11 (`d505cc0`). Reviewed HTTP implementation: `f0346fe`; resolve passive
  documentation HEAD from Git.
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
  HTTP PR11 is merged into the feature branch; draft integration PR12 targets main. Hosted CI and merge are separate
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
PR11 merged into the feature branch. The user then authorized opening integration
PR12 toward main without merging it. Deployment, cloud configuration,
and merge remain unauthorized.

Preserve unrelated untracked `.atl/`, `.gitattributes`, and `graphify-out/`.
Git hooks may rebuild Graphify data; inspect fresh status before staging.

## Next action

Both profile slices are implemented and reviewed; no review step remains for
their unchanged code. Review draft integration PR12 toward main. The aggregate
combines two separately reviewed slices and exceeds 400 changed lines; the PR
recommends a maintainer size exception, not an approved exception. Keep merge
and deployment as separate explicit decisions. Do not claim the full authentication milestone
complete or reconstruct old review tokens from documentation.
