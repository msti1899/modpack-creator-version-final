# Local email/password access
Objective: register and sign in through Supabase Auth, then choose the existing profile username.
Base: `a71e8ff` (main after merged profile integration PR12). Branch: `feat/email-password-auth`; runner: Bun 1.4.4 plus disposable local Supabase.
Delivery: one coherent auth slice, forecast 380 authored lines; cached feature-branch-chain applies if slicing becomes necessary. Local work-unit commits only; no push/PR/merge/deployment authorized.

## Specs

- S1: User: "sigue" after "Registro e inicio de sesión" / "Reutilizar Supabase Auth y conectar el flujo con la elección del nombre de usuario ya implementada." Implement registration/access, not custom password storage or token issuance. Technical interface: POST `/auth/register` and `/auth/login`, only `{email,password}`, server-configured Auth URL and publishable/anon key. Username assignment stays authenticated POST `/profile`, without cross-service rollback or account deletion. Document incomplete onboarding when no profile exists.
- S2: "Pruebas del flujo completo" / "Cuenta nueva, credenciales incorrectas, sesiones inválidas y acceso al perfil propio, usando Supabase local." Test through public Hono request and injected Auth fetch seams, plus real disposable Auth/Data API registration → sign-in → `/me` → `/profile`. Preserve all existing route contracts with baseline/candidate status/header/body comparisons. Observe RED before implementation, then focused tests and root checks.
- S3: "Sin frontend ni servicios externos todavía. Después seguimos con confirmación de correo y recuperación de contraseña." No frontend, SDK/dependency, database schema, configured Auth security defaults, refresh/logout/recovery/provider implementation, cloud setup, or publication changes. Handle registration without a session safely for future confirmation-enabled projects; confirmation callbacks/delivery remain deferred.

## Tasks

- T1 [S1,S3] inline — complete: implemented, verified and native review approved; guarded config reuse, credential routes, response allowlist, tests and contract/guide. Risk: items 2/3 (passwords/tokens and shared configuration guard). Commit: `8652e95`.
- T2 [S1–S3] independent ODD verifier — passed; local live flows, rejection/state preservation, privacy/limits and prior-route differential proof. Risk: items 2/3. Evidence: baseline35/627, candidate41/730,140assertions36differentials and5confirmation-enabled assertions.
- T3 [S1–S3] inline — complete; native review under user-owned switch, handoff/roadmap and exact task mirror. Publication remains separate. Reviewed implementation: `8652e95`.

## Log

- L1: User: "sigue" approving the proposed local registration/sign-in delivery and its full-flow tests. No further product questionnaire requested.
- L2: Read-only ODD explorer mapped current identity/configuration/profile seams and official Auth docs. Parent spot-checked the existing config guard. Registration and login share one module and depend on the same parsing/configuration; parent writes inline, no parallel writer reason. Fresh main `a71e8ff` contains user-merged PR12; old local handoff status is historical and will be reconciled.
- L3: Implementation choices: forward only email/password to fixed signup/password-grant endpoints; reuse the existing guarded config and Auth fetch seam. Supabase owns password policy, rate limits and sessions. Never trim passwords, forward caller metadata/redirects, log credentials, cache responses, retry writes, or use service-role keys. Input cap2KiB, Auth response cap64KiB and5second timeout. Return allowlisted user/session fields only; generic errors and safe no-session registration status. No profile is auto-created or deleted.
- L4: Observed RED/GREEN for missing routes, credential validation, no-session/duplicate responses, safe provider errors/configuration, then a real duplicate-signup regression: raw GoTrue uses numeric `code` plus semantic `error_code`, unlike SDK-style `code`. Pinned and fixed the raw fixture. Focused6tests103assertions; root types and41tests730assertions pass. Ten real registration/login/identity/profile checks passed, including whitespace, weak/wrong credentials, duplicate privacy and account isolation. Forty-two old-route differential cases matched status/headers/full bytes, including mrpack ZIP. Independent verification and native review pending.

- L5: Independent verification was interrupted after its successful 140-assertion pass. User: "sigue". Resumed only the unfinished confirmation-enabled proof and cleanup: five assertions passed, including202nulluser/session and unconfirmedlogin401. Verifier compared source/tests/docs to its snapshot unchanged; no blockers. Both fresh root checks passed35/627baseline and41/730candidate. Parent spot check also passed. No cloud SMTP/callback/recovery claim; native review pending.

- L6: User granted the native Auth review. Four exact provider-issued captures ran concurrently in risk/resilience/readability/reliability order and returned no findings. Final approval was acknowledged successfully; no correction was needed. Implementation `8652e95` is reviewed. Local delivery is complete; push/PR/merge/deployment remain separate user decisions.
