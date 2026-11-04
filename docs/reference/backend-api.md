# Backend API reference

The independent Hono API verifies identity for `/me`; existing catalog/pack
routes remain public. Application pack persistence is not implemented.
Local base URL: `http://127.0.0.1:3001`. POST bodies must be JSON.
For a complete example, see the [creation guide](../guides/create-modpack.md).

## Endpoints

### GET /health

Returns `{ "status": "ok", "service": "modpack-api" }`. This checks the API
process, not external service connectivity.

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
