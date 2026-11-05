# Backend API reference

The independent Hono API verifies Clerk identity for `/me`; existing catalog/pack
routes remain public. Application pack persistence is not implemented.
Local base URL: `http://127.0.0.1:3001`. POST bodies must be JSON.
For a complete example, see the [creation guide](../guides/create-modpack.md).

## Endpoints

### GET /health

Returns `{ "status": "ok", "service": "modpack-api" }`. This checks the API
process, not external service connectivity.

### GET /me

Requires `Authorization: Bearer <Clerk session token>`. The Clerk SDK verifies
the signature/timing using a configured RSA public key; the API enforces its
issuer, authorized browser origin and user-session claims. API keys and old
Supabase sessions are not accepted. Returns `{ user: { id, email } }`, with
opaque Clerk `user_...` ID and nullable email. Email is null unless a signed
string email claim exists; no profile lookup occurs. No raw metadata or tokens
are returned. All responses are `no-store` and vary on
Authorization. A 401 includes `WWW-Authenticate: Bearer`.

Missing/malformed credentials return 401 without an upstream call. With credentials
present, missing/malformed server configuration returns 503; invalid/expired
tokens return 401; unexpected verification failures return 502. No Auth network
lookup occurs. Tokens are limited to 8192 characters. Key rotation requires a
configuration update; issued JWTs may remain valid until expiry after logout.

Configure `CLERK_JWT_KEY` with the instance JWT public key (PEM, literal `\n`
supported), `CLERK_ISSUER` with the exact HTTPS issuer origin, and
`CLERK_AUTHORIZED_PARTIES` with comma-separated browser origins. HTTP is allowed
only for loopback development origins. Use the same instance that issues user
sessions; no secret key or local Supabase Auth service is needed by the API.
See `apps/api/.env.example` and run `bun test apps/api/tests/identity.test.ts`.
This establishes identity only, not group permissions or email-confirmation policy.

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
- Request bodies: 16 KiB. Pack names and search queries: 100 characters.
- Metadata lookup timeout: 8 seconds; operation deadline: 20 seconds.
- Download metadata must use HTTPS on `cdn.modrinth.com`. File names, collisions,
  SHA1/SHA512 hashes, sizes, and client/server declarations are checked.
- Required and incompatible declarations are honored; optional and embedded
  dependencies are not automatically added. Undeclared runtime conflicts cannot
  be detected. Loader compatibility remains the caller's responsibility.

## Sources

- [Modrinth API](https://docs.modrinth.com/api/)
- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)
