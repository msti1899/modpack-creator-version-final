# Access accounts with Clerk and application profiles

API identity/profile verification, web account controls and the same-origin
identity bridge are connected locally. Current regression, independent verification
and the smaller native review sequence completed locally. Hosted provider configuration
is not established. See the [current handoff](../handoff.md) for delivery state.

Clerk is the only account/session provider. Supabase stores application profiles;
there is no second Supabase password/token flow in the Hono API.

## Account and profile flow

Use the [Clerk configuration guide](local-identity.md) with the same instance on
web and API. If that instance is already configured, use the existing sign-in,
sign-up and account controls. Confirmation, recovery, token refresh and sign-out
are Clerk-managed flows, not `/auth/*` endpoints. Do not create another instance
or provision credentials as part of local code verification.

Obtain a fresh Clerk session token through the SDK and send it as a bearer to
`GET /me`. Configure Supabase database trust and `role: "authenticated"` separately
before accessing `/profile`. GET returns null before username assignment; POST
`{ username }` assigns it, PATCH renames it under the application cooldown rules.
Account creation and profile assignment are not one transaction; a taken username
does not delete an account. Never send owner IDs or timestamps from the client.

The application username is not Clerk's display name/username. Existing UUID-owned
rows remain stored but unlinked; no account is associated automatically by email.
See the [profile guide](account-profiles.md) for RLS, migration and naming guarantees.

## Verification boundaries

Local tests use fresh RSA keypairs and disposable databases to verify signed
Clerk-shaped tokens, owner isolation and legacy-data retention. They neither
provision Clerk/Supabase accounts nor prove real sign-in/email/provider delivery.
Hosted credentials, third-party JWT trust and end-to-end provider tests require
separate authorized setup. Never put passwords, tokens or private keys in chat,
Git, command history or logs. See the [API reference](../reference/backend-api.md).
