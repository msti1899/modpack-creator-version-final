# Local backend identity
Second backend roadmap delivery: Supabase-validated identity in Hono, without frontend, cloud provisioning, or CD. Branch: feat/backend-identity; runner: Bun plus disposable local Supabase.
Delivery: ask-on-risk; forecast about 350 authored lines. Preserve existing public endpoints and the original createApp(fetcher) seam.

## Specs
- S1: User approved the backend roadmap with "Go ahead with the plan." After the proposed local identity slice and local/cloud clarification, user said "dale". Scope: validate Supabase sessions in Hono and add GET /me; no custom password system, account/profile tables, cloud provider setup, or frontend.
- S2: GET /me returns only {user:{id,email}} for a Supabase-verified identity. Missing/malformed/invalid/expired credentials return401; infrastructure errors must not masquerade as logout. No tokens, arbitrary metadata, or upstream error details in responses/logs. Configuration comes from the server, never request URLs.
- S3: Keep health, Modrinth search/resolve/export and unknown-route behavior unchanged and public. Use an independent auth fetch seam so existing Modrinth mocks stay valid. Read identity from Supabase Auth /auth/v1/user instead of trusting decoded client JWT claims.
- Checks: deterministic public-route tests and existing backend suite/typecheck; real disposable local Auth user/token checks; negative token cases; endpoint isolation; independent ODD verifier for risk2. Explicitly report hosted/cloud/email/OAuth limitations.

## Tasks
- T1 [S1-S3] Auth middleware, GET /me, server configuration and route regression tests — inline (one cohesive unit, no writer trigger), complete; own and independent checks passed; implementation a9c5bad.
- T2 [S1-S3] Local verification, API/reference/architecture docs and independent verification — inline plus odd-verify for security, complete; own and independent checks passed; implementation a9c5bad.
- T3 [S1-S3] Native review applicability and delivery evidence — parent orchestration; independent checks passed, native review pending; implementation a9c5bad.

## Log
- L1: User continuation: "dale" after explaining local Supabase needs no cloud project. Previous roadmap approval: "Go ahead with the plan." First identity delivery is the proposed Hono session validation and GET /me, not all account/provider features at once.
- L2: ODD-only delegation retained: explorer gpt-6-luna/high, verifier gpt-6.1-sol/medium; parent implements inline. Explorer verified official Supabase Auth /user validation and API-key semantics. Independent auth fetch avoids changing the existing catalog fetch seam.
- L3: Foundation PR6 verified merged into main4ca12d4349bcb78e57f9df8b715383fc7f01c566. New branch starts there. No cloud credentials or external provider sessions are accessed.
- L4: Proposed implementation: fixed GET {SUPABASE_URL}/auth/v1/user with publishable/legacy anon apikey and incoming user Bearer token. No local identity cache or custom JWT validation. Return no-store responses; 401challenge, 503missing/invalid config, 502upstream/protocol failure, 504timeout. No universal immediate logout-revocation guarantee. Anonymous Auth users are distinct from API anon keys; no new anonymous-signup policy added, and local config already disables anonymous signup.
- L5: Risk: item2 (authentication, bearer credentials, private identity). Actual local verification uses only newly created disposable accounts/projects. No remote execution, provisioning, SMTP/OAuth setup, push, or PR authorized for this slice yet.

- L6: Public-route tests observed RED404 before implementation, then GREEN. Root check29tests531assertions and API typecheck pass. Auth transport rejects redirects, caps JSON64KiB and uses5secondtimeout; no usermetadata/tokens returned. Public-key configuration guard supports newpublishable keys or legacyanon keys and rejects privileged/secret keys; decoding configuration never authenticates users.
- L7: Actual disposable localSupabase signup issued a5secondtoken. GET/me returned200 for it; missing/invalid/publishable-as-user/anon-as-user/expired all401, challenge/no-store verified. Auth project/account/volumes disposed without touching original data. No cloud, external email, OAuth or session-revocation guarantees tested. Independent verification pending.

- L8: odd-verify independently passed fresh frozen install/rootcheck29tests531assertions, baselineAPI15tests420assertions,4extra securityprobes40assertions including actual stalled HTTPbody->504, and real5secondexpiredlocalAuthtoken rejection. Existing health/404/search/resolve/export bodies, headers and ZIPbytes matched baseline with and without invalidBearer. Localports remained127only; no blockers, no cloudclaims. Parent narrows documentation to missing/malformed config503: a well-formed wrong-project key may still receive upstream401.

- L9: Work unit committed a9c5bad07e435c28b633698e590039ef6a263df7 on feat/backend-identity:10files337additions9deletions (346authoredlines), below delivery budget. No new dependencies or migrations; no cloud/frontend/CD/push/PR. Source normalization finished before native candidate freeze. Parent repeated rootcheck29tests531assertions and cleaned only reported disposable verifier volumes/scratch/private-key logs.
