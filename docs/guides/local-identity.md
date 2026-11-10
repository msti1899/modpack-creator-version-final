# Use Clerk identity locally

Review-chain scope: this slice activates API identity/profile verification only.
Web account controls and the same-origin bridge follow in later children. The
complete guide describes the finished chain, not an independently deployable slice.

Clerk handles accounts and sessions. The independent Hono API verifies Clerk
session tokens at `GET /me`; Supabase remains the database. No user synchronization,
group permissions, or cloud setup is included in this integration.

## Configure the same Clerk instance in both applications

Create or select your development instance yourself in the Clerk Dashboard.
This repository does not provision accounts or redeem the Student Pack benefit.
Never post credentials or session tokens in chat, logs, issues, or Git.

1. Copy `apps/web/.env.example` to the ignored `apps/web/.env.local`.
   Replace `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` with that
   instance's keys. Only the publishable key is public. Set `API_URL` to the
   Hono API origin; locally it defaults to `http://127.0.0.1:3001`.
2. Copy `apps/api/.env.example` to the ignored `apps/api/.env`.
   Set `CLERK_JWT_KEY` to the **JWT public key (PEM)** from the same instance,
   not a secret/API key. Literal `\n` escapes are supported.
3. Set API `CLERK_ISSUER` to the exact token issuer origin (for example,
   `https://your-instance.clerk.accounts.dev`) and `CLERK_AUTHORIZED_PARTIES`
   to comma-separated **browser origins**, not API origins. The local example
   permits `http://localhost:3000` and `http://127.0.0.1:3000`; deployed origins
   must use HTTPS. Do not use wildcards or request-derived origins.
4. Run `bun run dev` and open `http://localhost:3000`. Restart after changing
   environment configuration. Production builds must be rebuilt with the web
   configuration; adding runtime keys does not change an existing static page.
5. Use **Create account** or **Sign in**, then the account menu to manage your
   session or sign out. **Check API session** calls web `/api/me`, which gets
   the Clerk session token server-side and forwards it to Hono `/me`.

The web route is only a transport adapter, not a second domain API. Catalog and
pack behavior stays in Hono. Server-side forwarding requires no browser-to-API
CORS or shared cross-domain cookies. Redirects from the API are rejected so
credentials cannot be forwarded to a redirected host.

With no web keys, the public starter page explains that setup is needed and
`/api/me` returns 503. The API's health and catalog routes remain usable without
Clerk or a running local database. No accountless Clerk app is created implicitly.

## Identity contract and limits

- `/me` returns `{ "user": { "id": "user_...", "email": null } }` by default.
  Clerk IDs are opaque strings, **not Supabase UUIDs**. A signed string `email`
  claim is returned if present; Clerk does not include it by default. The API
  does not fetch or synchronize profiles or infer email verification.
- Signature, expiry and token timing are checked by the Clerk SDK. The API also
  requires the configured issuer, an allowed `azp`, a user ID and session ID;
  pending session tasks are not accepted. Missing/malformed credentials return
  401; missing/invalid API configuration returns 503. Unexpected verification
  failures return 502 without exposing SDK diagnostics.
- Responses are `no-store`. There is no shared identity cache. Bearer tokens
  are limited to 8192 characters. `/api/me` bounds API JSON to 16 KiB and uses
  a five-second upstream timeout; outages are not reported as logout.
- Verification uses the configured RSA public key without an Auth network call.
  Rotate the deployed key when the Clerk instance key changes. Logout/session
  revocation is **not guaranteed to invalidate an issued JWT immediately**;
  token expiry still matters. No online revocation lookup is implemented.
- Supabase Auth tokens no longer authenticate `/me`. Existing remote users or
  data are not imported or deleted. Before migrating any deployed installation,
  plan account continuity and the session cutover separately.

## Supabase, provider setup and production

The application profile table is retained with direct Clerk text owners, a
preserving forward migration and signed-subject RLS. Configure API
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` separately from Clerk settings;
never use service-role credentials. Supabase must trust the same Clerk instance,
and profile tokens must carry signed `role: "authenticated"`. Hosted trust setup
requires separate authorization and verification; local signing fixtures do not
establish it. Legacy UUID-owned rows remain intact but unlinked and reserved,
without email-based account linking. See the [profile guide](account-profiles.md)
and [ownership decision](../decisions/0003-clerk-profile-ownership.md).

Email/password, confirmation/recovery and Google/Discord availability follow your
Clerk instance settings. Real email delivery and OAuth flows have not been proven
by offline tests; production social providers require their own credentials.
Brevo is not required by this local Clerk integration, and no email provider
configuration was changed. Clerk production requires an owned domain and DNS
setup. Student benefits and free domains have eligibility/expiry conditions;
no perpetual free operation is promised.

## Verification

Use `bun test apps/api/tests/identity.test.ts apps/web/tests`, `bun run check`,
and `bun run build`. Offline tests generate disposable signing keys and exercise
the real Clerk verifier; no real account, private instance key, database or email
provider is needed. Credential-free checks do not establish real sign-in,
OAuth/email delivery, hosted CI or deployment success.
The root suite also runs `tests/auth-security.test.ts` (including real timeout
signals); API tests pin the previous public status/header/body and ZIP contracts.

Sources: [Clerk Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart),
[token verification](https://clerk.com/docs/reference/backend/verify-token),
[Supabase third-party Clerk](https://supabase.com/docs/guides/auth/third-party/clerk),
[Clerk production](https://clerk.com/docs/guides/development/deployment/production).
