# Modrinth pack builder
Implement the backend for the stateless search, resolution, and export flow. Frontend is explicitly deferred. Base: eb0668e; integration branch: feat/modrinth-builder; runner: Bun tests and API TypeScript checks.
Delivery: auto-chain; chain strategy: feature-branch-chain. Remote PR creation is not yet authorized. Backend forecast: approximately 550 authored changed lines; frontend deferred. Cohesive API unit exceeds 400; recommend size:exception before any PR creation, with no artificial splitting of tests from behavior.

## Specs
- S1: "Implementemos buscar mods en Modrinth, armar un pack y descargar el .mrpack, sin cuentas ni persistencia todavía." Search the mod catalog with Minecraft version and loader filters; keep selection in memory; download an actual ZIP containing a valid modrinth.index.json. No accounts, database, or remote publication.
- S2: "Sí, Fabric, Forge, NeoForge y Quilt". Let the user select the loader and Minecraft version and enter an exact loader version for export; do not invent a loader version.
- S3: "Pedir confirmación antes de agregarlas" and "Sí, cancelar la incorporación del mod". Resolve required dependencies before committing a selection; rejecting confirmation leaves the prior selection unchanged. Retain exact selected versions and reject incompatible closures.
- S4: "Solo mods por ahora". Exclude other project types. Preserve the existing health endpoint and unknown-route behavior.
- Checks: deterministic public API fixtures, ZIP validation with an independent reader, API typecheck, complete tests, and independent backend verification. UI/browser/build work is deferred with T2. External availability failures are reported separately.

- S5: "no hagamos nada de front todavia enfoquemonos en backend". Implement and verify the backend only; do not modify frontend files or add forwarding configuration.

## Tasks
- T1 [S1-S4] API catalog, dependency resolution, validated ZIP export and tests — delegated; launched for parallel API/UI units before user deferred frontend; backend writer retained within narrowed scope; complete; implementation and functional/independent checks passed; commit a3a8500.
- T2 [S1-S3] Frontend builder and forwarding — deferred by explicit user scope correction; no writer launched and no frontend edits authorized.
- T3 [S1-S4] Backend documentation, API/ZIP checks and independent risk verification — inline orchestration plus independent verifier for risk item 2; complete; checks passed; additional native review explicitly declined for this candidate; implementation/documentation commit a3a8500.

## Log
- L1: User request: "Implementemos buscar mods en Modrinth, armar un pack y descargar el .mrpack, sin cuentas ni persistencia todavía."
- L2: Read-only explorer mapped the scaffold and verified official Modrinth API and mrpack specifications. No existing domain helpers. Required invariants: one version per project, exact pins, atomic dependency cancellation, configuration changes clear selections, stale responses cannot restore obsolete selections. Source: https://docs.modrinth.com/api/ and https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack.
- L3: Proposed seam: GET /mods; POST /packs/resolve returns full candidate selection and added dependency IDs; POST /packs/export validates exact approved selection and emits ZIP. Independent Hono API remains authoritative; Next rewrites forward browser requests. Freeze detailed response types before starting writers.
- L4: Current backend Risk: item 2 (safe archive paths and download URLs are security guards for installer-consumed upstream metadata). Original frontend risks are deferred. Independent verifier required after own checks. No new dependencies; stored ZIP independently validated.
- L5: Initial delivery strategy question resolved by L6. No product source changes at that point. `.atl/` and `graphify-out/` remain user-owned untracked data.

- L6: User decision: "Usá feature-branch-chain para este flujo." Local branches/slices will be prepared; no remote publication without authorization.
- L7: Frozen API contract: GET /mods?query=&gameVersion=&loader=&offset=0 returns {hits:[{projectId,title,description,slug}],total,offset}. POST /packs/resolve {projectId,gameVersion,loader,versionIds:string[]} returns {versions:[{id,projectId,name,versionNumber}],addedDependencies:string[]}. POST /packs/export {name,version,gameVersion,loader,loaderVersion,versionIds:string[]} returns application/x-modrinth-modpack+zip attachment or {error:string}. Errors: 400 invalid input, 409 incompatible/unresolvable, 502 upstream failure, 504 timeout. UI requests /api/*, rewritten to independent API; use server-only API_URL (default http://127.0.0.1:3001). Explicit game-version input avoids unrequested release policy; exact loader-version input required. Limits: 50 selected projects, 100 upstream requests per operation, bounded text fields and request sizes.

- L8: User scope correction: "no hagamos nada de front todavia enfoquemonos en backend". T2 deferred; T1 remains authorized and its writer notified. No frontend writer was launched and no frontend source changes were made. T3 now verifies backend only.

- L9: T1 RED observed (missing createApp export), then GREEN: API 15 tests/420 assertions; full suite 16 tests/423 assertions; API typecheck exit 0. Independent verifier PASS S1-S5, no blockers, Python zipfile CRC/manifest validation for all four loaders. Baseline health/404 differential identical. Live search for Sodium on Fabric/Minecraft 1.21.1 and subsequent resolve both HTTP 200.
- L10: Local chain planned: feat/modrinth-builder (tracking baseline) <- feat/modrinth-builder-api (backend + tests/docs). Frontend deferred. No PRs or remote branches created. No source-mutating normalizer configured or run. Backend is a cohesive approximately 550-line unit including tests/docs; recommend PR size:exception rather than splitting tests from behavior. Native review remains additional and requires candidate consent.

- L11: Commits observed: 13b0be6 tracking baseline on feat/modrinth-builder; a3a8500 backend implementation, tests and API guide on feat/modrinth-builder-api. Actual backend diff: 522 additions + 6 deletions (528 authored lines). No frontend edits, push or PR.
- L12: User answered "declined" to additional native review. Exact captured decline invocation returned action=declined, consent=declined_this_candidate and matching target sha256:4d9d30c7ba3440ede0521957b5d2c05837ccdabd774280e1d38e9d0f7d7bf91d. No review was run and future reviews remain enabled. All functional and independent checks stand. Backend authorized scope is complete; frontend remains deferred.
