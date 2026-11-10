# Repackage Clerk publication slices
Objective: publishable feature-branch-chain boundaries under 400 authored changed lines, without dropping behavior, tests or necessary documentation.
Baseline: preserved `990444f`; coordinator `chore/clerk-publication-slices`; assembly `feat/clerk-chain-*`. Runner: Bun 1.4.4, local Docker upgrade probe. Delivery: feature-branch-chain; local reconstruction before publication.

## Specs

- S1: User: "no se pueden hacer mas chicos?" followed by "Go ahead with the plan." Approved plan: "Reorganizar los bloques grandes"; "Conservar las ramas actuales; mantener cada comportamiento con sus pruebas y documentación necesaria." Preserve all original review branches and the dirty original checkout. Repackage on new branches; do not force-push or rewrite existing references.
- S2: Approved plan: "Validar los nuevos cortes"; "Comprobar tamaños, dependencias, enlaces y tests antes de publicar. Sin omitir contenido para reducir líneas." Every child targets its immediate parent and has at most 400 additions plus deletions. Keep application source, migrations, dependency lock and existing regression fixtures byte-identical to verified `990444f` at the final boundary.
- S3: Preserve the chosen feature-branch-chain, original first four bounded children, and tracker. Split R4 into accepted decisions, API behavior with tests/reference, and operator guides; split R7 into workspace regression/CI, isolated database upgrade and final continuity. These children are review-only, not independently deployable.
- S4: The earlier "push y pr" remains the intended delivery, but no merge, deployment, provider setup, history rewrite, or automatic replay of a declined/spent review is authorized. Keep original native review evidence distinct from new publication boundaries. Do not claim hosted CI or real Clerk flows passed.

## Tasks

- T1 [S1–S3] inline — complete; decisions `1d137e7` (84 lines), API `7e3e8ce` (400 lines), root38tests696assertions passed: preserve baseline; create decision and API boundaries. Route: understood dependent assembly, no parallel writer reason.
- T2 [S1–S3] inline — complete; guides `c0a465d` (316 lines), web `735b137` (112), bridge `946e676` (207): operator guide, web controls and bridge children, with original behavior/own checks.
- T3 [S1–S3] inline — complete; workspace regression `6b8e1d1` (288 lines), SQL upgrade `920982f` (170): independent workspace regression/CI and isolated upgrade children, each with their tests and documentation.
- T4 [S1–S4] independent ODD verifier — complete; full checks and targeted link correction recheck passed: exact final fidelity, per-parent budgets/ancestry, root checks/build, SQL upgrade and documentation links. Risk: item 5 (delivery/CI boundary reconstruction).
- T5 [S1–S4] inline — complete locally; final continuity and mirror recorded; remote publication awaiting explicit session confirmation: final continuity child and recovery mirror; report verified chain and remaining remote authorization/proof.

## Log

- L1: User: "push y pr"; challenged the proposed size exceptions with "pero no entiendo no separaste?" and "no se pueden hacer mas chicos?"; approved the smaller-boundaries plan with "Go ahead with the plan."
- L2: R4 is 763 changed lines. API/env/dependency/test/lock paths are 341 and backend reference is 59, so a coherent API child is exactly 400; its accepted decisions and operator guides can be separate documentation deliverables. R7 final 661 lines contains separable workspace regressions/CI, configured controls, isolated SQL upgrade/cleanup and continuity.
- L3: Preserve `990444f` and all `feat/clerk-review*` branches. Create separate coordinator and assembly worktrees. Keep this live task file on the coordinator while assembling the exact-400 API child; import the final recovery record only in the final continuity child so bookkeeping does not pollute the API boundary. Mirror progress after each task; review consent is not replayed.

- L4: T1 assembled without runtime edits: original source/test bytes restored, with provider decision before the API contract. API child exactly400authoredlines; ownroot38/696passed. This is publication/history reconstruction, not a new auth implementation. Original native evidence remains a reference, never a new approval for these boundaries.

- L5: T2 preserves original behavior and documentation bytes at each checkpoint. Ownroot39/698passedafterweb;root44/742passedafterbridge. All three children are <=400lines; application/migration/lock bytes match their original reviewed checkpoints.

- L6: T3 owns coherent regression behaviors: workspace CI with security/public/configured-control tests (root53/1176), then disposable upgrade runner with fixture, cleanup tests, command, CI step and local guide (root55/1195 andSQLupgradepassed). Original implementation and fixtures are unchanged. No runtimeRED applies to history-only repackaging; existing functional proof is rerun rather than invented.

- L7: Independent final/prefix checks passed (root55/1195, frozen install, build, SQL upgrade, API38/696,web39/698,bridge44/742,regression53/1176,upgrade55/1195). Scratch quota interrupted one redundant install; identical-lock verified dependencies allowed remaining checks. One S2 blocker: the decision linked its source task before the final child added it. Single correction moves that historical source into the decision child (84lines) using new `feat/clerk-chain-*` refs; all initial `feat/clerk-publish-*` attempts and original review refs remain intact and must not be published. No source changes. Targeted links/ancestry/budgets/finality recheck pending.

- L8: Scoped correction recheck passed all12ancestryrelations andbudgets; ADR0002links resolve at every corrected prefix; final non-bookkeeping blobs ANDmodes match990444f. All original review/first-attempt publication references preserved. Parent repeated finalroot55/1195. No open findings. No repeated full verification sweep after correction; prior install/build/DB/prefix proof retained.
- L9: Final publication plan contains12coherentchildren plus the draft/no-merge tracker. Native reviews remain attached to original candidates; repackaging unchanged source/history does not fabricate or replay approvals. No new auth behavior, dependencies, schema edits or CI behavior were introduced. Remote credential/session choice must be explicit before inspecting or using GitHub. Risk:item5, independently verified boundary reconstruction.
