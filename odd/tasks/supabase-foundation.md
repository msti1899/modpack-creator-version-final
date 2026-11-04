# Reproducible local Supabase foundation
First delivery of the approved backend roadmap; branch: feat/supabase-foundation. Runner: pinned Supabase CLI, Docker, Bun tests and SQL tests.
Delivery: ask-on-risk; forecast about 300 authored lines plus generated CLI configuration and lockfile. No cloud provisioning, frontend, CD, or publication.

## Specs
- S1: User approval: "Go ahead with the plan." This delivery covers the approved first step, "Base de datos reproducible": local Supabase setup, versioned migration workflow, configuration example and setup documentation. Acceptance: start and reconstruct a disposable local database from scratch without repository secrets.
- S2: "despliega solo sub agentes de gentle-ai"; confirmed ODD roles only. "odd explorer usa gpt 6 luna" overrides the explorer model to gpt-6-luna/high. Parent implements inline; an odd-verify uses gpt-6.1-sol/medium for environment/security checks.
- S3: Preserve the independent Hono/Bun API, existing Modrinth behavior and user-owned untracked files. Later roadmap steps (auth, groups, persistence, versions, votes) remain separate deliveries; do not invent domain tables in the foundation.
- Checks: exact CLI version; start/status; migration replay on a new disposable local project; baseline database tests; frozen dependency install; existing backend tests/typecheck; local-only binding and ignored runtime artifacts; independent verifier. Report image/network/runtime failures honestly.

## Tasks
- T1 [S1-S3] Pinned local tooling, loopback-only Docker startup and CLI configuration with tests — inline, one cohesive setup unit with no writer-delegation trigger; own and independent checks passed, commit pending.
- T2 [S1,S3] Disposable database lifecycle/migration checks, setup guide and reference links — inline; own and independent live checks passed, commit pending.
- T3 [S1-S3] Independent verification for risk items 2/5 and native review applicability — odd-verify plus parent orchestration; independent verification passed, native review applicability pending, commit pending.

## Log
- L1: User approved the six-step backend proposal: "Go ahead with the plan." Current delivery is the local database foundation; no external account setup has been authorized.
- L2: User delegation corrections: "despliega solo sub agentes de gentle-ai", "si", "odd explorer usa gpt 6 luna". Generic explorer stopped; configured gpt-6.1-luna rejected as unavailable; odd-explorer successfully used the explicit gpt-6-luna override. Worker override remains unspecified if later needed.
- L3: Docker29.9.2 is running and standard local ports are free. Supabase CLI absent. Official explorer verified stable CLI3.0.0 and Bun devDependency installation. Current CLI config exposure defaults must be inspected directly; no speculative global privilege migration will be added.
- L4: A real security-default migration establishes the workflow; real domain migrations will accompany their features. Verify replay with a scratch-only migration probe rather than committing fabricated app tables. Local test resets affect only databases created for this verification. No destructive operations on existing user data.
- L5: Risk: item5 (CLI dependency and local environment setup), item2 (network binding and secret handling). Retain existing fixture API tests and frozen lockfile behavior.

- L6: Pinned CLI3.0.0 was installed through the root Bun devDependency and its generated configuration inspected. Explicitly disabled unnecessary services and auto_expose_new_tables; wrapper ensures127.0.0.1 bridge binding and rejects extra remote/all flags. Wrapper tests observed RED before implementation and GREEN afterward.
- L7: Fresh disposable stack started; five project containers, three published ports all127.0.0.1. CLI test-db initially failed because its probe container used a default nonexistent network; forwarding the selected network to lifecycle commands fixed it, with dedicated regression RED/GREEN.
- L8: Live SQL privilege probe initially failed for routine EXECUTE inherited from PUBLIC despite api.auto_expose_new_tables=false. Official PostgreSQL17 docs establish global default revocation cannot be scoped per-schema. First migration narrowly changes future postgres-owned routine defaults; existing functions/other roles untouched. Live SQL suite6PASS after reset; no app-domain schema fabricated.
- L9: Frozen dependency install and root check passed19tests448assertions (including new launcher tests), API typechecks unchanged; TOML, local doc links and diff whitespace checks passed. Further replay/stop-persistence/independent validation pending.

- L10: Two disposable local resets replayed the real security migration plus scratch-only table/seed probe; inserted extra data disappeared and expected migration history remained2entries. Six SQL tests passed. Normal stop/start preserved the probe row; final raw stop --no-backup targeted only this newly created disposable project and removed its volumes successfully. Local stack is stopped; downloaded images and loopback network remain reusable. Independent verification pending.

- L11: odd-verify (gpt-6.1-sol/medium) independently installed frozen dependencies in fresh scratch and reproduced start/status, two migration resets, SQL6PASS, stop/start persistence, localhost-only bindings and rejected remote/all arguments with unchanged container inventory. Existing functions and other owners remained unaffected by the default-privilege migration. Root check19tests448assertions, baseline API15tests420assertions and health/404 differential PASS. Official actionlint1.7.12 PASS. No blockers; no cloud/hosted CI claims. Parent spot-check repeated root check successfully.
