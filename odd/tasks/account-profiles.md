# Account profiles and usernames
Objective: implement local authenticated username profiles; no frontend or external setup.
Base: `origin/main` at `d9493dc`. Route: inline; runner: Bun 1.4.4 and disposable Supabase/pgTAP.
Delivery: feature-branch-chain (previously chosen); database slice then HTTP slice, no push/PR/merge authorized. Forecast: 650 authored lines across two coherent slices, each targeted below 400; preserve tests and docs rather than compressing to fit.

## Specs

- S1: "Sí, nombre de usuario único"; "Sí, cuentan como el mismo nombre" for `Matias`/`matias`; "Sí, usemos ese formato" for 3–20 ASCII letters, digits, underscore, no spaces/accents; "No, conservar las mayúsculas al mostrarlo". Require one globally case-insensitive unique username per authenticated user; preserve display casing. Acceptance: pgTAP and HTTP format/collision/ownership tests.
- S2: "Sí, podrá cambiarlo"; "Sí, cada 30 días"; "Sí, queda libre"; "No, el primer cambio puede ser inmediato". Initial assignment is not a rename; first rename can be immediate; later renames require 30 days; previous name is released. Acceptance: transactional database tests at 29/30 days, rejected writes unchanged, and concurrent collision/rename probes.
- S3: "bueno ultima pregunta y a seguir con backend". Implement the next local backend slice without more product questions. Implementation choice: own-profile routes separate from existing `/me`, forwarding only a verified user's token to Supabase Data API. Preserve `/me`, health and Modrinth contracts. Acceptance: existing suite, separate profile route tests and disposable live Auth/Data API check. No frontend, dependencies, cloud setup, deployment, or remote publication.
- S4: "No, solo con email"; "Sí, permitir vincularlos"; "Sí, vinculación manual desde ajustes"; "Sí, debe quedar otro método de acceso". Record these account decisions but defer password/provider workflows; do not silently implement automatic account merging or claim the full authentication milestone complete.

## Tasks

- T1 [S1,S2,S4] inline — complete: independently verified and native review approved; database profile schema, RLS/grants, server-side rename guard, pgTAP and guide. Risk: items 1/2/4 (migration, permissions, concurrent username changes). Commit: `86e168a`.
- T2 [S1,S2,S3] inline — pending; own-profile HTTP read/write, safe Data API adapter, tests/reference and live seam verification. Risk: items 2/4 (authenticated writes and concurrent mutations). Commit: pending.
- T3 [S1–S4] independent ODD verification — T1 passed; T2 pending; update handoff, retain distinct test/review/publication states. Commit: pending.

## Log

- L1: User: "bueno ultima pregunta y a seguir con backend"; final answer: "Sí, debe quedar otro método de acceso".
- L2: Read-only ODD explorer mapped identity middleware and local database tooling. Parent spot-checked `identity.ts`, `index.ts`, pgTAP and local runner. Parent implements inline: the units depend on each other, so no parallel writer reason exists. Independent verification required by named security/migration/concurrency risks.
- L3: GitHub confirms PR7 merged; cached `origin/main` at `d9493dc` includes PR8 identity merge and PR7 docs. Created `feat/account-profiles-db` from that base carrying only the approved local documentation clarifications. Preserve untracked `.atl/`, `.gitattributes`, `graphify-out/`.
- L4: Local Bun is available via `/tmp/modpack-bootstrap.h6VoA4/node_modules/.bin/bun`; no test stack is running. Live checks use a disposable external scratch copy, never reset an existing developer database. Database first, then protected HTTP adapter. Native review remains user-owned and enabled.
- L5: T1 RED: disposable stack with baseline migrations failed the new pgTAP test because `public.profiles` did not exist. GREEN: migration replay and both pgTAP files passed (45 checks, including 39 profile checks). Root `bun run check` passed types and 29 tests/531 assertions. Three concurrent-writer probes passed: one case-insensitive assignment winner, one immediate rename winner, and rejected rename leaves winning data unchanged. Independent verification and native review are still pending; HTTP work remains T2.

- L6: Independent T1 verification passed 32 live Auth/Data API/SQL/race probes, matching baseline/candidate root29/531. Its first fresh stack had an unexplained pgTAP plan(integer) lookup failure; a single targeted recheck confirmed byte-identical migration/tests and independently passed45combinedchecks. No outstanding T1 blocker. HTTP T2 remains pending. Native review pending. Rollback: remove the new profile migration/tests/guide before deployment; no existing records were changed. Application sources remain identical to base.

- L7: User granted T1 review. Risk, resilience, readability, and reliability reviews completed without findings; exact acknowledgement succeeded. T1 commit `86e168a` is reviewed. No correction was needed. HTTP T2 remains pending; no remote publication or deployment was performed.
