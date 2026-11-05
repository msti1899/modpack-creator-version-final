# Access and recover an account locally

Supabase Auth owns credentials and sessions. The Hono API exposes bounded
email/password registration and login; the existing profile API owns usernames.
No frontend, real email delivery or external provider setup is included.

## Local flow

Use the [local database](local-database.md) and [identity configuration](local-identity.md).
Local Auth defaults allow an immediate signup session; do not assume a hosted
project has the same confirmation policy or change its security settings to
match a test. The API supports a no-session registration result as well.

1. POST `{ email, password }` to `/auth/register`. A 201 includes an active session;
   a 202 includes neither a usable session nor an account identifier.
2. POST the same credentials to `/auth/login` to obtain a new session. Passwords,
   including leading/trailing whitespace, are not trimmed by the API.
3. Send `Authorization: Bearer <accessToken>` to `/me` to verify the session,
   then GET `/profile`. Null means username onboarding remains incomplete.
4. POST `{ username }` to `/profile`. If the name is occupied, choose another;
   registration is not rolled back and the account is not automatically deleted.

Never put real passwords/tokens into logs, committed fixtures or shell history.
Use disposable local accounts for end-to-end tests. API keys are not user sessions.
The application uses only the configured publishable/anon key; admin fixture
cleanup, if needed, belongs solely in disposable test infrastructure.

See the [API reference](../reference/backend-api.md) for response/error contracts.
Refresh/logout and Google/Discord remain later work. Validate real SMTP, confirmation and abuse protection before
any public deployment; local success is not production-readiness evidence.

## Confirm email and recover a password

This is an API-only flow. It does not create a clickable completion page or
configure real delivery. Supabase's default email link still points through Auth
and redirects to the configured site URL, not this JSON endpoint.

For disposable local accounts, open the local SMTP inbox on `http://127.0.0.1:54324`.
Inspect the email HTML without following its verification link. Extract the link's
`token` query value (the hash) or a template's `TokenHash`, not its short OTP code.
Following the provider link first consumes the token outside this API.

1. When signup requires confirmation, POST `{ tokenHash, type: "signup" }` to
   `/auth/verify`. Save the returned session privately; use `/me` and `/profile`
   as in the registration flow. Existing local auto-confirm defaults are unchanged.
2. For forgotten passwords, POST `{ email }` to `/auth/recover`. A generic 202
   does not prove that a user exists or that an email was delivered.
3. From the recovery email, POST `{ tokenHash, type: "recovery" }` to `/auth/verify`.
   It returns the same JSON session; expired/reused hashes are rejected by Auth.
4. PATCH `{ password }` to `/auth/password` with the returned access token as a
   bearer credential. The updated user is returned without tokens or metadata.
   Then sign in with the new password through `/auth/login`.

A normal authenticated session may also update its own password. No password is
changed by merely requesting recovery or verifying a token. Provider password and
reauthentication rules still apply. Do not assume password changes invalidate all
existing JWTs. Keep hashes, session responses and passwords out of URLs/logs/history.
There is no callback redirect, GET token consumption or caller-controlled destination.
A future client/email-template integration must be designed separately.

Upstream contracts: [Supabase password guide](https://supabase.com/docs/guides/auth/passwords)
and [Auth REST specification](https://github.com/supabase/auth/blob/master/openapi.yaml).
