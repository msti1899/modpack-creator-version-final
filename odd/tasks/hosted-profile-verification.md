# Hosted profile verification
Objective: prepare only the selected test services with existing migrations and JWT configuration, then rerun blocked profile/RLS checks.
Branch: `main` at `22318bc`; delivery: hosted test setup only, no commits or publication; checks: native migration/config readback and real disposable-user HTTP/RLS probes.

## Specs

### S1 — Explicit hosted preparation authorization

User response, verbatim: "autorizo".

Accepted question, verbatim: "¿Autorizás aplicar las migraciones existentes y configurar `role: authenticated` y la integración JWT Clerk–Supabase **solo en el proyecto de pruebas**, sin resetear ni borrar datos existentes, para completar las pruebas RLS?"

Apply only the three existing reviewed migrations to Supabase project `zzzvbvhiyvtaenzpycqg`. Configure only the necessary claim/trust for Clerk application `app_3LwV8fF7rZ2uUICwbp0ISFd71Xl`, Development instance. Preserve unrelated configuration and existing data. Native CLI labels the selected primary database branch "production"; the exact project, not another branch/project, was selected and authorized by the user for testing.

### S2 — Complete the remaining applicable tests

User request, verbatim: "hace todas las pruebas vos".

Rerun the blocked profile and RLS checks with uniquely tagged disposable users and rows. Keep the already-verified identity checks as prior evidence, refreshing real sessions as needed. Remove only receipt-bound fixtures. Do not claim full OAuth or real mailbox delivery without the required provider accounts/inbox.

### S3 — Preserve the original safety boundaries

User constraints, verbatim:

- "No imprimas claves, tokens ni el contenido de mis archivos .env."
- "Usa la clave pública JWT de Clerk para CLERK_JWT_KEY y la clave publishable de Supabase; nunca service_role."
- "No despliegues, publiques, hagas commits, configures servicios externos ni apliques migraciones o reseteos sin mi autorización explícita."

S1 authorizes only the specified test migrations/JWT configuration; it does not authorize resets, deployments, publishing, commits, unrelated configuration or deletion of existing data. Use the previously authorized CLI sessions without extracting their credentials. Stop affected work when native capability or required proof is unavailable.

### S4 — Follow current Supabase guidance

User instruction, verbatim: "Use the supabase skill."

Review the current changelog, explicit hosted targeting/consent, table grants and RLS. Existing migration files remain unchanged. Use no seed/custom-role/vault updates, and never infer schema or integration success from health alone.

## Tasks

- [x] T1 — S1,S3,S4 — inline; applied and read back; commit: not authorized. Risk: items 1 and 2 (stored owner format and function/table privileges).
- [x] T2 — S1,S3,S4 — inline; role claim applied and read back; third-party trust blocked on a hosted setting with no native CLI/SQL route. Commit: not authorized. Risk: item 2 (signed authorization claim and issuer trust).
- [x] T3 — S2,S3,S4 — inline orchestration with one bounded browser/HTTP worker; all applicable checks observed, fixtures removed; commit: not authorized. Risk: items 1 and 2 (fixture preservation and cross-user isolation).

## Log

L1 — User request, verbatim: "hace todas las pruebas vos".

L2 — The user consented to two disposable Clerk users and their profiles, with cleanup restricted to those fixtures. Both original users completed real identity tests and were deleted; no profile rows were created. The hosted schema and signed role claim were missing.

L3 — User response to the S1 question, verbatim: "autorizo". Later instruction, verbatim: "Use the supabase skill."

L4 — Route: parent inline, no parallel-writer or context writer unit; read-only exploration compressed migration/CLI context. A bounded preflight worker ran native reads/dry-run without mutations. User prohibition overrides automatic work-unit commits.

L5 — Preflight: PostgreSQL 17.11; zero public tables, rows, views, functions, sequences, policies, triggers and constraints. The migration ledger relation is absent before and after dry-run. Pending versions are exactly `20261104000000`, `20261105000000`, `20261107000000`; seed/roles plan is empty and vault updates are skipped. Existing SQL has no DELETE/TRUNCATE/DROP TABLE; the UUID-to-text conversion will apply to a newly created empty table. Native metadata/ACL snapshots and SQL hashes are private under `~/.local/state/modpack-creator-version-final/hosted-profiles-preflight-20261112/`.

L6 — Backup limitation: `pg_dump` and Docker are unavailable. The snapshot is not a restorable dump. Because the affected public schema is empty, no existing application rows need copying; preserve the metadata/ACL baseline and require unchanged pre-existing objects/data. If that baseline changes before application, stop rather than apply under this assumption.

L7 — Clerk schema confirms `session.claims` is an object; current `session` is null. A minimal role addition has no existing custom claims to overwrite. Supabase CLI exposes no native hosted third-party-auth operation; do not use broad config push or extract a Management token. Confirm existing trust through real tokens if possible; otherwise request the supported credential/user-owned route.

L8 — Current documentation was reorganized by other work. Preserve README/docs/delivery records, `.agents/`, `.atl/`, `skills-lock.json` and generated files; update only this task and the owning handoff/roadmap when recording this operation.

L9 — T1 applied from a frozen copy of the reviewed migration files and configuration, verified byte-identical to `HEAD`. The first automated guard stopped before writing because it misread the native plan's target field; no database write had occurred, the saved safe shape was inspected, and the guard was corrected to read `target.project_ref` plus the three migration paths. A second pre-apply query reconfirmed an empty public schema and absent ledger.

L10 — Native `db push --skip-vault --yes` applied exactly `20261104000000`, `20261105000000` and `20261107000000`. Readback: ledger matches those three versions; `profiles.user_id` is text; RLS enabled with three policies; zero profile rows; authenticated select, owner-column insert and username update allowed; owner and timestamp update denied; delete denied; anon has no table grants; the guard trigger is security invoker and not callable by authenticated. The pre-existing auth-user count is unchanged; no seed, custom role or vault update ran. Evidence is private under `~/.local/state/modpack-creator-version-final/hosted-profiles-apply-20261112/`.

L11 — T2 claim: `clerk config patch` (dry-run, then applied) set `session.claims.role = "authenticated"`; a follow-up `config pull --keys session` confirms it is the only custom claim. No other instance setting was changed.

L12 — T2 trust is genuinely missing, not an RLS defect. A real fixture signed in through the Clerk UI and its JWT carried `sub`, `role: "authenticated"`, `sid`, `azp` and a future `exp`; `aud` was absent. Authenticated `GET /profile` returned 401, and a direct read-only PostgREST select with the same bearer returned `PGRST301` invalid JWT. The publishable apikey alone reached PostgREST and returned `42501` for anon, which proves the endpoint and key work and isolates the failure to Clerk-token trust. Per the stop rule no profile writes were attempted: zero rows exist for both fixtures, so nothing needs deletion. Anonymous and malformed-token API calls still returned 401; the signed-in fixture signed out and web `/api/me` returned 401 afterwards.

L13 — Blocking capability gap: hosted third-party auth is Auth-service configuration, absent from the `auth` schema tables and unsupported by Supabase CLI 3.1 (no third-party-auth subcommand) and by the available Supabase MCP tools. Remaining routes require a user-owned action: enable Clerk under Supabase Dashboard → Authentication → Third-Party Auth with issuer `https://ultimate-wren-486.clerk.accounts.dev` and JWKS `https://ultimate-wren-486.clerk.accounts.dev/.well-known/jwks.json`, or supply a scoped Management API token for `POST /v1/projects/<ref>/config/auth/third-party-auth`. That decision was raised to the user; no credential was requested in chat and no provider setting was changed by the agent.

L14 — After trust exists, rerun only T3: two fresh disposable fixtures, full profile lifecycle, cross-user isolation, denied delete/column writes, anonymous and malformed rejection, then delete only receipt-bound users and profile rows. The two current fixtures (run `38a3ee702ef5`) exist but have no profiles; they must be deleted whether or not T3 runs.

L15 — Those two orphan fixtures were deleted with provider confirmation and exact filtered absence checks before the retry; no profile rows existed for them.

L16 — User reported the Supabase Clerk provider was enabled. T3 then ran with fresh fixtures (run `1c2f9...`, private state `hosted-profiles-rls-20261112`). Trust now works: no `PGRST301`, and PostgREST accepted real Clerk bearers (`aud` is absent from Clerk's default token and Supabase accepted it anyway).

L17 — Observed profile contract for both fixtures: `GET /profile` 200 null before assignment; `POST` 201; `GET` 200 with null `usernameChangedAt`; duplicate `POST` 409; identical `PATCH` 200 with timestamp still null; first real rename 200 with timestamp set; immediate second rename 409 cooldown; `"ab"` 400; extra-key body 400.

L18 — Observed isolation and authorization directly against PostgREST with each real token: own-row select returns one row; A reading B returns zero rows and B reading A returns zero rows; cross-owner INSERT denied `42501`; `DELETE` denied `42501`; `PATCH` filtered to the other owner changed zero rows; direct `username_changed_at` update denied `42501`; the rows were byte-identical before and after the denials. Anonymous and malformed tokens return 401, never 500. Both real-UI sign-outs cleared Clerk state and web `/api/me` returned 401.

L19 — The recorded run is 38 observations: 36 passed; two recorded the absence of an `aud` claim, which is expected for Clerk's default token and is not an authorization failure. Clerk session tokens expire quickly, so one repeated lifecycle invocation returned 401 without writing; final evidence came from a fresh-token re-check.

L20 — Cleanup: exactly two profile rows were deleted through the explicitly authorized CLI session after a pre-check proved only those two existed, and the table is back to zero rows. Both fixture users were deleted with provider confirmation and absence checks; passwords and saved tokens were removed. No non-fixture user or row was touched.

L21 — Final local controls after the hosted work: `bun run check` exit 0 with 56 tests / 1200 assertions and `bun run build` exit 0. No source, manifest or lockfile change was made by this delivery.
