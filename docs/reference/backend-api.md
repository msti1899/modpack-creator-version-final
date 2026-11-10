# Backend API reference

The independent Hono API verifies identity for `/me` and `/profile`; catalog/pack
routes remain public. Application pack persistence is not implemented.
Local base URL: `http://127.0.0.1:3001`. POST bodies must be JSON.
For a complete example, see the [creation guide](../guides/create-modpack.md).

## Endpoints

### GET /health

Returns `{ "status": "ok", "service": "modpack-api" }`. This checks the API
process, not external service connectivity.

### POST /auth/register, POST /auth/login

Public credential endpoints accept only `{ email, password }`. Usernames,
metadata, redirects, phone numbers and alternative grants are not accepted.
Passwords are forwarded unchanged to Supabase Auth, never stored or logged by
this API. Requests are limited to 2 KiB; email to 254 characters and password to
1024 characters. Supabase owns password strength rules (local minimum: 8).

Login returns 200; registration with an active session returns 201. Both return
`{ user: { id, email }, session: { accessToken, refreshToken, expiresIn, tokenType } }`.
`tokenType` is `bearer`. Treat both tokens as secrets; do not log or cache them.
No provider metadata, provider tokens, upstream cookies or raw error details
are forwarded. All credential responses are `no-store`.

Registration without a session, or for an existing account, returns 202 with
`{ user: null, session: null }`. This does not prove a new account or email delivery.
Confirmation-enabled legacy accounts still require confirmation before login.
The former `/auth/verify` proxy has been retired for the Clerk cutover. Auto-confirm settings can still reveal
registration outcomes indirectly through session availability; this is not a
complete account-enumeration or production abuse-protection solution.

Errors: 400 for invalid input or rejected registration, 401 for generic failed
login, 429 for Auth rate limits, 503 for missing/unsafe server configuration,
502 for upstream network/protocol failures, 504 for timeout. Auth requests reject
redirects, use a five-second timeout including response reading, and cap JSON at
64 KiB. They use the configured publishable/legacy anon key, never service-role
credentials or caller-supplied Authorization. There are no automatic retries.

Registration does not create a profile. With an active access token, read
`/profile` and assign the username through its existing POST operation. Account
creation and profile assignment are not one transaction: a taken name does not
delete the Auth account. Refresh/logout and provider-linking endpoints
are not implemented here. See [local account access](../guides/local-account-access.md).

### Retired email-management proxies

POST `/auth/verify`, POST `/auth/recover` and PATCH `/auth/password` now return 404
without calling any provider. These Supabase-specific completion/reset routes
are intentionally retired for the Clerk cutover, not redirected to another token
issuer. Clients must move to Clerk-managed account flows when the integration is
complete. This intermediate feature-chain slice is not independently deployable.

### GET /me

Requires `Authorization: Bearer <user access token>`. Supabase Auth validates it;
API keys are not user sessions. Returns `{ user: { id, email } }`, with nullable
email and no raw metadata or tokens. All responses are `no-store` and vary on
Authorization. A 401 includes `WWW-Authenticate: Bearer`.

Missing/malformed credentials return 401 without an upstream call. With credentials
present, missing/malformed server configuration returns 503; upstream invalid/expired
token responses return 401; network/protocol/oversized-response failures return
502; timeouts return 504. Auth requests reject redirects, cap JSON at 64 KiB, and
use a five-second timeout. Tokens are limited to 8192 characters.

Configuration and verification: [local identity guide](../guides/local-identity.md).
This establishes identity only, not group permissions or email-confirmation policy.

### GET /profile, POST /profile, PATCH /profile

All three require a Supabase user bearer token and inherit `/me`'s authentication
errors and `no-store`/Authorization cache headers. The API derives the owner from
verified identity and forwards the user's token to the Data API under RLS, never
a service-role key. Query parameters cannot select another owner or more columns.

- GET returns `{ profile: { username, usernameChangedAt } }`, or `{ profile: null }`
  before initial assignment. `usernameChangedAt` is null until the first rename.
- POST creates the caller's profile, returning 201 and the same profile shape.
- PATCH renames an existing profile, returning 200; a missing profile returns 404.
- Both write bodies contain **only** `{ username }`: 3–20 ASCII letters, digits,
  or underscores. Casing is preserved; uniqueness ignores casing. Invalid JSON,
  unknown fields, invalid names, or bodies exceeding 1 KiB return 400.
- Already-assigned profiles or taken usernames return 409. The first rename is
  immediate; later actual changes require 30 days or return 409. An identical
  write leaves the timestamp unchanged. Previous names become available again.

Data API failures return safe errors: 401 for expired/rejected credentials,
502 for protocol/network/permission failures and rate limits, 504 for timeout.
Requests reject redirects, use a five-second timeout including response reading,
and cap response JSON at 4 KiB. There are no automatic retries. A transport error
does not prove a write rolled back: read the profile before deciding to retry.
No signup, provider-linking, or profile deletion endpoint is included.

Database configuration is guarded independently from identity verification. The
profile module accepts a separate safe database origin and publishable/anon key;
unsafe/missing configuration returns 503 without a Data API call. API keys never
authenticate the caller and privileged keys are rejected. The existing identity
configuration remains the default until the Clerk cutover; no provider is changed
by this preparatory adapter slice.

See the [profile guide](../guides/account-profiles.md) for database guarantees.

### GET /mods

Query parameters: `query` (optional text), `gameVersion` (required), `loader`
(required), and `offset` (optional integer, default 0, maximum 10000).
Loaders: `fabric`, `forge`, `neoforge`, `quilt`.

Returns `{ hits: [{ projectId, title, description, slug }], total, offset }`.
At most 20 results are returned, filtered to mods matching the game and loader.

### POST /packs/resolve

Body: `{ projectId, gameVersion, loader, versionIds: string[] }`.
`versionIds` contains previously approved exact Modrinth version IDs.

Returns `{ versions: [{ id, projectId, name, versionNumber }], addedDependencies }`.
`name` is the version display name. `addedDependencies` contains newly required
dependency version IDs, excluding the requested mod and previous selections.
The caller must obtain approval before accepting the candidate.

### POST /packs/export

Body: `{ name, version, gameVersion, loader, loaderVersion, versionIds: string[] }`.
`version` identifies the pack release. `loaderVersion` is an exact caller-supplied
loader version, not automatically discovered or verified for existence.

Success returns an attachment with MIME `application/x-modrinth-modpack+zip`.
Its ZIP contains `modrinth.index.json`, not mod binaries. Missing required
dependencies cause rejection rather than unapproved additions.

## Errors and limits

Errors return `{ "error": "..." }`: 400 for invalid input, 409 for incompatible
or unresolvable selections, 502 for upstream failures including rate limits,
and 504 for timeouts. Unknown routes retain the default Hono 404 response.
Check the status before treating an export response as a ZIP.

- At most 50 mods including dependencies and 100 upstream lookups per operation.
- Pack request bodies: 16 KiB. Pack names and search queries: 100 characters.
- Metadata lookup timeout: 8 seconds; operation deadline: 20 seconds.
- Download metadata must use HTTPS on `cdn.modrinth.com`. File names, collisions,
  SHA1/SHA512 hashes, sizes, and client/server declarations are checked.
- Required and incompatible declarations are honored; optional and embedded
  dependencies are not automatically added. Undeclared runtime conflicts cannot
  be detected. Loader compatibility remains the caller's responsibility.

## Sources

- [Supabase Auth REST contract](https://github.com/supabase/auth/blob/master/openapi.yaml)
- [Supabase signup behavior](https://supabase.com/docs/reference/javascript/auth-signup)
- [PostgREST table operations](https://docs.postgrest.org/en/v14/references/api/tables_views.html)
- [PostgREST database error mapping](https://docs.postgrest.org/en/v14/references/errors.html)
- [Modrinth API](https://docs.modrinth.com/api/)
- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)
