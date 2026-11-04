# Verify a local user's identity

`GET /me` verifies a user access token with Supabase Auth and returns only
`{ "user": { "id": "...", "email": "..." } }`. Email can be null. This slice
does not add login screens, application profile tables, groups, or cloud setup.

## Configure and run

Start the [local database stack](local-database.md), then copy
`apps/api/.env.example` to the ignored `apps/api/.env`. Use `bun run db:status`
to find the local API URL and publishable key (or legacy `anon` key).

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in that file. Never use a secret
or `service_role` key. A publishable key identifies the project, not a signed-in
user. Status output can also contain privileged development credentials: do not
commit it or post it in an issue. Restart `bun run dev:api` after changing config.

Sign in to the local Supabase Auth service with its client or Auth endpoint to
obtain a user access token, then use it from your own terminal:

```sh
curl -i http://127.0.0.1:3001/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Keep `ACCESS_TOKEN` in your own shell session; never paste it in chat, logs, or
Git. The API never accepts a request-supplied Supabase URL. HTTP is allowed only
for loopback development hosts; hosted configuration must use HTTPS without a
path, query, embedded credentials, or fragment.

## Behavior and limits

- Missing or malformed Bearer credentials return 401 before any outbound lookup.
- With credentials present, missing or malformed server configuration returns 503.
- Supabase rejects invalid/expired/non-user tokens: the API returns 401 with a
  `WWW-Authenticate: Bearer` challenge, not the upstream error details.
- A well-formed key for the wrong project can still be rejected upstream with 401;
  local format checks do not prove that a key belongs to the configured project.
- Auth network/protocol failures and upstream rate limits/server errors return
  502; timeouts return 504. Neither is reported as a user logout.
- Successful and error responses use `Cache-Control: no-store`. There is no
  identity cache. Tokens are capped at 8192 characters; Auth JSON at 64 KiB;
  the Auth request and body use a five-second timeout. Redirects are rejected.

The middleware establishes identity, not group membership, ownership, or email
confirmation policy. Local anonymous signup remains disabled by the foundation;
this route adds no separate anonymous-user policy. Existing health and Modrinth
routes remain public. A valid signed JWT is not guaranteed to become unusable
immediately after every logout operation; session lifecycle remains Supabase's
responsibility.

## Implementation and verification

`apps/api/src/identity.ts` sends the user Bearer token and project `apikey` to the
fixed `/auth/v1/user` endpoint. Supabase validates the access token; the backend
does not authenticate users by decoding JWT claims. API-key payload inspection
only rejects privileged legacy configuration; it does not verify user identity.

This trades one Auth network lookup per protected request for avoiding local
signing-key management. The Auth fetch seam is independent of the existing
Modrinth fetch seam, so catalog tests and public routes keep their behavior.

Run `bun test apps/api/tests` and `bun run --filter @modpack/api typecheck` for
deterministic checks. Disposable local-stack verification covers actual Auth
tokens separately. Cloud login, real email delivery, Brevo, Google, Discord,
refresh/logout endpoints, frontend work, and CD are outside this slice.

See the [API reference](../reference/backend-api.md),
[Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts), and
[API key documentation](https://supabase.com/docs/guides/getting-started/api-keys).
