# Local email confirmation and password recovery
Objective: complete backend-only email verification and password recovery with JSON sessions.
Base: `594e084`; branch: `feat/email-confirmation-recovery`; runner: pinned Bun 1.4.4 and disposable local Supabase when available.
Delivery: one coherent slice, forecast 390 authored lines; feature-branch-chain if slicing is required. No publication, merge or deployment authorized for this feature.

## Specs

- S1: User: "sigue" after the handoff's next unfinished local confirmation/recovery scope; "Sí, devolver la sesión en JSON". Verify signup/recovery email token hashes through Supabase Auth and return the existing allowlisted user/session JSON, not redirects or a frontend page. Technical contract: POST `/auth/verify` with only `{ tokenHash, type }`, where type is `signup` or `recovery`. Invalid/expired/reused tokens are rejected; Supabase owns one-time semantics.
- S2: Continue "la confirmación de email y la recuperación de contraseña". Technical contract: POST `/auth/recover` with only `{ email }`, generic 202 acknowledgement; PATCH `/auth/password` with only `{ password }` and a user bearer token, returning the updated allowlisted user. Supabase owns password policy and authentication; an ordinary valid session may also update its own password. Preserve passwords unchanged. No custom credentials or session issuance.
- S3: "sin frontend ni servicios externos todavía". Reuse guarded server configuration, bounded JSON, timeouts, no-store, safe errors, no retries, no caller redirects or metadata, no token logging. Keep existing registration/login/profile/catalog/pack contracts unchanged. No dependency, database schema, Auth defaults, external service or provider setup changes. Test via existing public Hono request/injected Auth fetch seam and disposable local flows if available. If runtime/infrastructure is unavailable, record missing proof rather than claiming it passed.

## Tasks

- T1 [S1–S3] inline — implemented, own checks passed; independent verification passed: route implementation, deterministic RED/GREEN, documentation, focused and root checks. One dependent auth module; no parallel writer reason. Risk: item 2 (email tokens, sessions, password changes). Commit: `bda4665`.
- T2 [S1–S3] delegated verifier — passed: independent security/flow checks and prior-route differentials in fresh scratch state. Risk: item 2. Parent spot check required.
- T3 [S1–S3] inline — complete: native assessment/review as applicable, handoff/roadmap and mirror update; no remote publication.

## Log

- L1: User: "sigue"; assistant asked whether verification should return JSON rather than redirect; user: "Sí, devolver la sesión en JSON".
- L2: Explorer mapped existing passwordRoutes and local SMTP; parent spot-checked source/config. Reuse existing public Hono/fetch seam. POST verification avoids consuming tokens on GET/link previews. The local guide will explain extracting the token hash without opening the provider link; clickable client completion remains deferred. Official Supabase Auth OpenAPI and password guide confirm POST verify, POST recover and authenticated PUT user. Existing email defaults remain unchanged. Bun absent from PATH; preparing pinned runtime outside repository. No source writes before this logbook.

- L3: Observed RED404 then GREEN for verification, recovery request and password update. Focused5tests189assertions; root typechecks and46tests919assertions passed. Fifty-four baseline differential cases matched status, headers and full bytes (42 priorroutes inclZIP plus12credential/newinput cases). Bun1.4.4 used from a disposable temporary runtime; no dependency/config bytes changed. Existing Hono request and injected Auth fetch remain the agreed seam. Independent live tests and security verification pending.

- L4: Independent verifier passed S1–S3:46probes, real isolated confirmation-enabled SMTP/Auth flows, replay/expiry/purpose rejection, recovery/ordinarysession password updates and profile/account isolation, plus4baseline differentials. Fresh candidate root46tests919assertions passed; parent repeated focused5tests189assertions. No findings or correction. Source matches verified snapshot. Native review pending.

- L5: User: "granted". Native high-risk assessment (security item2) reviewed implementation `bda4665`,7files344changedlines. Risk/resilience/readability/reliability captures ran concurrently and returned no findings; terminal approval was acknowledged successfully. No correction needed. Reviewed boundary is `bda4665`. Local feature complete; remote publication and deployment remain separate decisions. Final bookkeeping changes only passive documentation. Disposable Supabase stack, network and private test scratch were removed after verification.
