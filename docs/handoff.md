# Backend handoff

Snapshot: 2026-11-05. Verify Git and this document before acting.
Current plan: [backend roadmap](plans/backend-roadmap.md).

## Resume here

Continue [account profiles](../odd/tasks/account-profiles.md), not a new product
questionnaire. User requested one final question and then backend implementation.
T1 database layer is implemented and independently verified; native review is
pending. T2 authenticated HTTP profile endpoints remain pending. Preserve `/me`
and public Modrinth behavior. No frontend or cloud/provider setup is authorized.

## Verified checkpoint

- Branch: `feat/account-profiles-db`, based on `origin/main` at `d9493dc`.
- That base contains identity PR8 and documentation PR7 merges. GitHub confirmed
  PR7 merged; the old documentation branch is no longer the delivery base.
- Profile migration adds own-row RLS, narrow column grants, a case-insensitive
  unique index, and a database-enforced rename cooldown. See the
  [profile guide](guides/account-profiles.md) and task log for the contract.
- Own RED: profile table absent. GREEN: 45 pgTAP checks, root types and
  29 tests/531 assertions, plus three simultaneous-writer probes.
- Independent fresh baseline/candidate checks match. All 32 live Auth/Data API,
  SQL security and concurrency probes passed. Its first disposable stack had an
  unexplained `plan(integer)` pgTAP lookup failure; a single targeted recheck on
  byte-identical SQL independently passed all 45 checks. No source blocker remains.
- No application source changed in T1. HTTP profile routes are not implemented.
  Native review, publication, hosted CI, and merge of this new slice are not claimed.

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
strategy is feature-branch-chain; no push, PR, deployment, cloud configuration,
or merge is authorized by the current continuation.

Preserve unrelated untracked `.atl/`, `.gitattributes`, and `graphify-out/`.
Git hooks may rebuild Graphify data; inspect fresh status before staging.

## Next action

Finish T1's native review under the user-owned enabled switch, then implement T2
on its dependent branch with RED/GREEN tests. Update task log and this handoff with
actual review/commit/delivery states. Do not claim the full authentication milestone
complete or reconstruct old review tokens from documentation.
