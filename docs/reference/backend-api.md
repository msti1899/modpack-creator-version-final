# Backend API reference

The independent Hono API verifies identity for `/me`, `/profile` and group routes; catalog/pack
routes remain public. Application pack persistence is not implemented.
Local base URL: `http://127.0.0.1:3001`. POST bodies must be JSON.
For a complete example, see the [creation guide](../guides/create-modpack.md).

## Endpoints

### GET /health

Returns `{ "status": "ok", "service": "modpack-api" }`. This checks the API
process, not external service connectivity.

### GET /me

Requires a Clerk user-session bearer token. The API verifies its RSA signature,
expiry/not-before time, configured issuer and allowed browser origin, and rejects
non-user, pending or sessionless identities. Returns only `{ user: { id, email } }`,
with opaque `user_...` IDs and nullable signed-claim email. Unsigned request data
never supplies identity. All responses are `no-store` and vary on Authorization.

Missing/malformed/rejected credentials return 401 with `WWW-Authenticate: Bearer`;
missing/unsafe Clerk configuration returns 503; unexpected verifier failures return
502. Tokens are capped at 8192 characters. Offline verification does not promise
immediate logout revocation. Account, confirmation, recovery and session lifecycle
are owned by Clerk, not by a second API password/token issuer.

The old Supabase `/auth/register`, `/auth/login`, `/auth/verify`, `/auth/recover`
and `/auth/password` proxies are intentionally removed (404). No replacement
refresh/logout proxy is added. Clients must migrate to Clerk controls/session APIs;
this is an explicit auth-contract cutover, not backward-compatible provider mixing.
See [local identity](../guides/local-identity.md) and [account access](../guides/local-account-access.md).

### GET /profile, POST /profile, PATCH /profile

All three require a verified Clerk user-session bearer token and inherit `/me`'s authentication
errors and `no-store`/Authorization cache headers. The API derives the owner from
verified Clerk identity and forwards the unchanged user token to the Data API
under RLS. Its signed `role` must be exactly `authenticated`; missing/other roles
return 401 before database access. Privileged API keys are never accepted. Query parameters cannot select another owner or more columns.

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

Database configuration is independent of Clerk: missing/unsafe Supabase URL or
publishable/anon key returns 503. URLs use HTTPS except loopback development; no
embedded credentials, query or path is allowed. Supabase must separately trust the
same Clerk instance's JWTs; hosted trust setup is not performed by this code.
Owners are text Clerk IDs, using signed JWT `sub` for RLS. Legacy UUID-owned rows
are retained without reassignment and are not visible to Clerk users. Existing
names remain reserved, including legacy rows. No email-based account linking.

See the [profile guide](../guides/account-profiles.md) for database guarantees.

### Groups

All group operations require `/me`'s verified Clerk bearer and `/profile`'s exact
signed `authenticated` database role, independent Supabase configuration and
no-store/Authorization cache behavior. The caller is derived from the token,
never a submitted owner ID. See the [group guide](../guides/groups.md) for flows.

| Method and path | JSON body | Success |
| --- | --- | --- |
| POST `/groups` | `{ name, visibility }` | 201 `{ group }`; creator becomes owner/member |
| GET `/groups/me` | None | 200 `{ group }`, or `{ group: null }`; embeds up to 50 members/requests and next cursors |
| GET `/groups/me/members` | Query: `limit` 1–100 (default 50), opaque `cursor` | 200 `{ members, nextCursor }`; caller's group only |
| GET `/groups/me/requests` | Query: `limit` 1–100 (default 50), opaque `cursor` | 200 `{ requests, nextCursor }`; owner only |
| POST `/groups/:groupId/join` | None or `{}` | 200 `{ group }`; public groups only |
| POST `/groups/me/invitation` | None or `{}` | 201 `{ invitation: { token, createdAt } }`; private owner only; rotates |
| DELETE `/groups/me/invitation` | None or `{}` | 200 `{ invitation: null }` |
| GET `/groups/invitations/:token` | None | 200 `{ invitation: { groupId, name, ownerUsername, requested, member } }` |
| POST `/groups/invitations/:token/requests` | None or `{}` | 201 `{ request: { groupId, status: "pending", createdAt } }`; duplicate pending request is idempotent |
| POST `/groups/me/requests/:userId/approve` | None or `{}` | 200 `{ group }`; owner only |
| POST `/groups/me/requests/:userId/reject` | None or `{}` | 200 `{ request: { userId, status: "rejected" } }`; owner only |
| POST `/groups/me/ownership` | `{ userId }` | 200 `{ group }`; immediate transfer to a member |
| DELETE `/groups/me/membership` | None or `{}` | 200 `{ groupId, groupDeleted }` |

`group` contains `id`, `name`, `visibility`, `ownerId`, `role`, `createdAt`,
`memberCount`, `members: [{ userId, username, role, joinedAt }]`,
`membersNextCursor`, `invitation`, `requests: [{ userId, username, createdAt }]`
and `requestsNextCursor`. Embedded collections hold at most 50 entries; a non-null
cursor continues through the paged endpoints until it returns null. Roles are
`owner` or `member`. Only the owner receives pending requests and, for private
groups, the active invitation. Other callers receive null for both owner-only
fields. Page responses contain only `members` or `requests` plus `nextCursor`,
and reject unknown query parameters or malformed cursors.

Bodies are capped at 1 KiB and reject unknown fields. Names retain Unicode/casing,
trim surrounding Unicode spaces, contain 1–60 characters without controls or
U+FEFF, and need not be unique. Visibility is exactly `public` or `private`. IDs
are UUIDs; member IDs are Clerk `user_...` subjects; invitation tokens contain 64
lowercase hex digits. Queries cannot select another caller or additional fields.
There is no listing, group-edit, expulsion, invitation-expiry or pack-persistence
endpoint.

Invalid input returns 400; authentication 401; owner/public-admission denial 403;
missing group/request or invalid invitation 404; membership/profile/conflict
conditions 409. In particular, an owner cannot leave other members behind and an
already-grouped applicant cannot be approved into a second group. A sole-owner
leave deletes the group and dependent group records. Transport/protocol failures
return safe 502 errors, missing/unsafe database configuration 503, and timeouts
504. No SQL details are exposed. Requests reject redirects, use a five-second
timeout, cap response JSON at 256 KiB, and never automatically retry writes.

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

- [Clerk session token verification](https://clerk.com/docs/reference/backend/verify-token)
- [Supabase Clerk third-party trust](https://supabase.com/docs/guides/auth/third-party/clerk)
- [PostgREST table operations](https://docs.postgrest.org/en/v14/references/api/tables_views.html)
- [PostgREST database error mapping](https://docs.postgrest.org/en/v14/references/errors.html)
- [Modrinth API](https://docs.modrinth.com/api/)
- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)
