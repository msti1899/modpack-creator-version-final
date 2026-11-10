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

## Email-management cutover

The former `/auth/verify`, `/auth/recover` and `/auth/password` proxies return 404
without contacting Supabase Auth. Do not reuse the former email-hash/password
instructions or retry these endpoints; confirmation and recovery move to Clerk.
No provider accounts, email settings or existing credentials are changed here.

Registration/login above remain only for the next bounded retirement step. This
review-chain state must not be deployed independently; the completed Clerk
integration replaces both provider-specific account paths and identity validation.
