# Replace Supabase Auth with Clerk
Objective: complete the Clerk-only authentication cutover while retaining Supabase Postgres and existing profile rules.
Branch: `feat/clerk-auth-replacement`, baseline `ad4056e`; implementation `00f3e88`. Delivery: feature-branch chain from `feat/clerk-auth-tracker` (tracker PR #30, children #31-#38), review-only sequence `feat/clerk-review-slices` at `b1a237a`. No merge or deployment. Runner: pinned Bun 1.4.4 and isolated database fixtures.

## Specs

- S1: User: "saca todo lo de supabase auth y deja lo de clerk reemplaza todo por clerk". Replace application Supabase authentication, credential/recovery proxies, identity defaults and active setup documentation with Clerk. Keep Supabase as the database; preserve public Modrinth behavior and profile/username rules. Check retired auth routes, signed Clerk identities, profile isolation, web session bridging and configuration.
- S2: Existing confirmed user decision: "Sí, usar directamente el ID de Clerk". Preserve legacy profile rows without deletion, reassignment or automatic account/email linking; use a forward migration for direct Clerk subjects. Preserve username format, uniqueness, casing and rename cooldown. Verify upgrade retention and RLS on disposable state only.
- S3: User: "y que haria con el pr ese entonces lo dejo ahi?"; continuation: "sigue". Keep PR16 open; prepare the local replacement without push, PR changes, merge, deployment, external configuration or modifying an existing developer database. Current native review consent is not inherited from historical candidates.
- S4: User: "dividir en mas chico", then "Continuar sin reportar". Split review ranges, not functionality; preserve the full implementation and perform no provider-defect report.

## Tasks

- T1 [S1-S3] inline, complete — Clerk-only application authentication and retained profiles; observed RED/GREEN, types and 56 tests / 1200 assertions passed; independent verification passed. Risk: persisted owner format, authentication/RLS, API contracts and dependencies. Commit: `00f3e88`.
- T2 [S1,S3] inline, complete — local email/SMS/signup and email capture disabled; configuration RED/GREEN and pinned CLI acceptance passed. Four passive stale paragraphs corrected and independently rechecked. Risk: authentication configuration and local services. Commit: `00f3e88`.
- T3 [S1-S3] independent verification, complete — 56 tests / 1200 assertions, 68 API probes, 24 bridge probes, 22 public baseline comparisons and 8 SQL groups passed; own frozen install, build and upgrade passed. No hosted setup/proof claimed. Commit: `00f3e88`.
- T4 [S1-S4] inline native orchestration, complete — 13 immutable review ranges reconstructed without changing the final tree; 11 approved/acknowledged reviews and 2 passive checks. Original full candidate declined after context-limit refusal; no report or review-mode toggle. Commits: `2aa1854` through `b1a237a` (below).
- T5 [S1-S4] inline, complete — published the verified replacement as a feature-branch chain: draft tracker #30 plus child PRs #31-#38, each at or under 400 changed lines. Every boundary passes typecheck and the full suite. PR #16 closed as replaced; its fork branch is untouched. Merge and deployment remain unperformed. Commits: `6d6d287` through `d1b9178`.

| Review part | Commit | Outcome |
| --- | --- | --- |
| 1 | `2aa1854` | Approved and acknowledged |
| 2 | `fee7164` | Approved and acknowledged |
| 3 | `43bd8ba` | Approved and acknowledged |
| 4 | `7a61109` | Approved and acknowledged |
| 5 | `70062e2` | Passive structural check |
| 6 | `d2df13c` | Approved and acknowledged |
| 7 | `9193d18` | Passive structural check |
| 8 | `51b8c88` | Approved and acknowledged; severe claim refuted |
| 9 | `ffd5429` | Approved and acknowledged |
| 10 | `e2ea8c4` | Approved and acknowledged |
| 11 | `50b38b6` | Approved and acknowledged |
| 12 | `18fc6a5` | Approved and acknowledged |
| 13 | `b1a237a` | Approved and acknowledged |

## Delivery chain

Feature-branch chain: children integrate into the tracker branch and `main` receives the
chain only once the tracker is accepted.

| PR | Branch | Commit | Content | Changed lines |
| --- | --- | --- | --- | --- |
| #30 (draft) | `feat/clerk-auth-tracker` | `6d6d287` | Profile owners, RLS and API scoping | 210 |
| #31 | `feat/clerk-02-retire-recovery` | `18e4c65` | Retire Supabase recovery proxies | 312 |
| #32 | `feat/clerk-03-retire-credentials` | `5f4fe86` | Remove credential sign-in and record the decision | 375 |
| #33 | `feat/clerk-04-api-session` | `8c0a80b` | Verify Clerk sessions in the API | 400 |
| #34 | `feat/clerk-05-guides` | `3f90dd5` | Local identity and access guides | 213 |
| #35 | `feat/clerk-06-web` | `feb7725` | Web account controls and session bridge | 254 |
| #36 | `feat/clerk-07-regression` | `14fd010` | Security, public regression and CI checks | 288 |
| #37 | `feat/clerk-08-upgrade` | `241cc89` | Disposable upgrade and local provider config | 197 |
| #38 | `feat/clerk-09-docs` | `d1b9178` | Closure documentation and handoff | 244 |

Slices stay under the 400-line review budget without `size:exception`. Intermediate
boundaries are coherent but not independently deployable; only the tracker merge is
intended for `main`.

## Log

- L1: User: "saca todo lo de supabase auth y deja lo de clerk reemplaza todo por clerk". Later: "y que haria con el pr ese entonces lo dejo ahi?" and "sigue".
- L2: Main is `ad4056e`; PR16 head `2818357` still conflicts. Working branch created from main. Pre-existing untracked `.atl/` is not part of this change and must be preserved. Existing committed candidate `a6ae3d1` provides coherent source/tests/migration without `.agents` noise. Historical verification is context, not current proof.
- L3: Route is direct inline: one dependent auth replacement, no independent parallel writer units. Mapping was delegated to decide reuse; long runner/build/database actions may use per-action workers. Estimated functional diff is approximately 2,440 changed lines before current configuration/doc adjustments; do not omit tests or compress code to meet a heuristic. Keep local units coherent; publication/slicing of PR16 remains a separate decision.
- L4: Bun 1.4.4 is absent from PATH. Preparing the pinned runner and disposable verification is necessary; never lower the version or claim prior tests as current. Source writes have not started.
- L5: Official Supabase Clerk integration requires third-party trust and the signed `role: authenticated` claim. Retain database JWT helper/schema infrastructure, not Supabase user authentication. Verify the pinned CLI provider-disable settings before use. No hosted integration setup is authorized.
- L6: Baseline on main passed types and 46 tests / 919 assertions. New retirement probes observed RED (live routes and provider calls), signed Clerk `/me` RED503 versus expected200. Both probes now pass (3 tests / 9 assertions); local provider-disable test observed RED before configuration and now passes all5assertions.
- L7: Frozen install preserved lock hash; own typecheck/build, disposable profile upgrade and identical public regression golden passed. Initial focused/full suites were49tests831assertions without the required root security file: Bun silently ignored its missing command argument. Parent restored the candidate file; scoped correction8tests374assertions passed. Final full suite and independent verification remain pending; no false complete result is claimed.
- L8: Pinned Supabase CLI3.0.0 accepted the local config through read-only scratch status; invalid variants produced field-specific config errors. This establishes schema acceptance, not running/hosted provider behavior. No developer database was started, reset or migrated. The application credential-recovery helper and its tests are deliberately removed; historical migrations/records remain for retention and replay.
- L9: Post-correction parent typecheck and complete suite passed56tests1200assertions across12files; git diff whitespace check passed. Public-regression test bytes equal the candidate used for baseline proof. Build, upgrade and lock results remain valid because only the omitted regression test and passive docs changed after those checks. Next: independent S1-S3 verification in fresh scratch, then native review. No source-mutating formatter is configured or needed.
- L10: Independent verifier passed S1-S3 on frozen tree `ea3bcd8` in fresh scratch: types56tests1200assertions,68APIprobes,24bridgeprobes,22exactpublicbaselinecomparisons,officialupgrade and8independentSQLgroups including unchanged state hashes after rejection. Parent repeated config1test5assertions. Four stale passive documentation paragraphs were corrected in one bounded batch; no application source changed. The full Supabase pgTAP stack and real hosted login/email/trust were not run; isolated SQL and prior own build are the applicable proof here.
- L11: Keep this dependent provider cutover one coherent local work unit (approximately2234changedlines before passive closure), rather than creating deployable intermediate states with mixed authentication. The400line figure is advisory; tests and retention proof are not omitted. PR16 remains the intended existing review container, but no publication or oversized-PR approval is inferred. Native assessment/review still applies to the exact final candidate.
- L12: Independent targeted recheck resolved all four documentation findings on tree `1919c51`; no new findings and no functional bytes changed. Native assessment with an explicit untracked-exclusion flag refused because it requires a canonical inventory digest; no review started or authority created. Re-enter through canonical native status/assessment, never infer approval or low risk. Preserve unrelated `.atl/` outside the candidate.
- L13: User authorized smaller reviews with "dividir en mas chico" and selected "Continuar sin reportar". The exact full-candidate decline was validated; no GitHub report was performed. Reconstructed 13 review-only commits in a separate worktree; no intermediate state is independently deployable. Final `b1a237a` and `00f3e88` trees are identical (`6a4bf48`); the largest individual range is 400 changed lines. Original full diff: 52 files, 1376 additions and 876 deletions. Earlier size estimates in this log are historical forecasts, not final counts.
- L14: All 13 parts completed: 11 native approvals were acknowledged and their authority consumed, with 2 passive documentation checks. Invalid reviewer responses were retried only when the same bound slot was reoffered. Part 8's severe middleware claim was refuted; remaining findings are non-blocking follow-ups, not corrections or reasons to reopen spent reviews. No runtime source was changed during review. This passive closure records observed outcomes only.
- L15: Hosted CI, real Clerk sign-in/email/OAuth, Supabase third-party trust, publication, merge and deployment remain unperformed. Next action requires a user decision about updating the existing PR16; do not force-push, create additional PRs or configure providers automatically.
- L16: User authorized publication. Rebuilt the verified tree as nine squashed work units on `ad4056e`; every boundary passes typecheck and the full suite (48, 45, 39, 38, 38, 44, 53, 56, 56 tests, zero failures), which the thirteen review ranges could not claim individually. Opened draft tracker #30 and child PRs #31-#38, closed #16 as replaced, left the fork branch at `2818357` untouched, and performed no merge, deployment or hosted configuration.
