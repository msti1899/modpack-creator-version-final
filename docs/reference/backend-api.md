# Backend API reference

The independent Hono API verifies identity for `/me`, `/profile` and group/draft
routes. Stateless `/mods` and `/packs/*` remain public.
Local base URL: `http://127.0.0.1:3001`. Write bodies must be JSON.
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
- `GET` returning `{"profile": null}` is the only signal a client needs to know
  that an account still has to choose a username; `/me` intentionally keeps its
  identity-only shape and is not the profile-completion signal.
- Already-assigned profiles return 409 `Profile already exists.` on POST; a name
  owned by another account returns 409 `Username is already taken.`, on POST and
  on PATCH. POST resolves the cause with one additional owner-scoped read; if that
  read fails, the generic `Profile or username already exists.` message is kept.
  No constraint name or row data is exposed.
- The first rename is immediate; later actual changes require 30 days or return
  409. An identical write leaves the timestamp unchanged. Previous names become
  available again.

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
There is no listing, group-edit, expulsion or invitation-expiry endpoint. Draft
routes below have their own 16 KiB limit.

Invalid input returns 400; authentication 401; owner/public-admission denial 403;
missing group/request or invalid invitation 404; membership/profile/conflict
conditions 409. In particular, an owner cannot leave other members behind and an
already-grouped applicant cannot be approved into a second group. A sole-owner
leave deletes the group and dependent group records. Transport/protocol failures
return safe 502 errors, missing/unsafe database configuration 503, and timeouts
504. No SQL details are exposed. Requests reject redirects, use a five-second
timeout, cap response JSON at 256 KiB, and never automatically retry writes.

### Group pack drafts

Requires the same verified Clerk session and signed database role as group routes.
Current members can read and export only their own group's draft; only its current
owner may save it. No submitted owner or group ID chooses another group's draft.

| Method and path | JSON body | Success |
| --- | --- | --- |
| GET `/groups/me/pack` | None | 200 `{ groupId, role, draft }` |
| PUT `/groups/me/pack` | `{ gameVersion, loader, versionIds, expectedRevision }` | 200, same shape; creates on first save |
| POST `/groups/me/pack/export` | `{ name, version, loaderVersion }` | 200 `.mrpack` attachment built from the stored selection |

`draft` is null before the first save, otherwise
`{ gameVersion, loader, versionIds, revision, updatedAt }`. Revisions are positive
integers: submit `expectedRevision: 0` for creation, or the revision last read for a
replacement. A stale revision returns 409 before any catalog work; refetch and
reconcile explicitly instead of retrying automatically. The database compare-and-swap
and the group row lock remain authoritative, and the save RPC rechecks the current
owner, so a save racing an ownership transfer or group deletion cannot write.

A write replaces the explicit selection atomically and validates every supplied mod
and required-dependency version against Modrinth before the save RPC. Saving never
chooses a newer version or adds a dependency: resolve and obtain approval first, and
do not save a declined proposal. The proposal's `versions[].id` values, including the
`addedDependencies`, are the complete `versionIds` to submit. Changing Minecraft
version or loader revalidates the
whole supplied selection; an incompatible change returns 409 and leaves the stored
draft untouched. Empty selections may be saved but cannot be exported. Explicit
removals are accepted only while every required dependency of the remaining
selection is still present.

Bodies and database responses are capped at 16 KiB. Write bodies reject unknown
fields. Export accepts only presentation fields and uses the stored IDs, so a caller
cannot override the selection, game version, loader or target group; draft export
never publishes or activates. Use the published-version routes below for that.
Errors: 400 invalid input, 401
authentication, 403 owner-only edit, 404 no current group or draft, 409 stale or
incompatible selection, 502 upstream or protocol failure, 503 missing database
configuration and 504 timeout. Draft calls reject redirects, use a five-second
timeout, forward the unchanged user token with a publishable key and never retry.
A transport error does not prove rollback: read the current revision before
resubmitting.

The table and RPC boundary enforces authorization, format and atomic revision
checks. Modrinth compatibility is checked by Hono, not by SQL, so an owner calling
the RPC directly bypasses catalog validation.

### Published pack versions

Requires the same verified Clerk session and signed database role as group routes.
Only current members of the group may list, read or export its published versions.
A link carrying a publication ID grants nothing by itself, and another group's ID is
indistinguishable from a missing one. Only the current owner may publish or activate.

| Method and path | JSON body | Success |
| --- | --- | --- |
| GET `/groups/me/pack/publications?limit=&before=` | None | 200 `{ groupId, role, activePublicationId, publications, nextBeforeSequence }` |
| GET `/groups/me/pack/publications/:publicationId` | None | 200 `{ groupId, role, publication }` |
| GET `/groups/me/pack/publications/:publicationId/export` | None | 200 `.mrpack` attachment built from frozen metadata |
| POST `/groups/me/pack/publications` | `{ name, version, loaderVersion, expectedRevision }` | 201 `{ groupId, role, publication }` |
| PUT `/groups/me/pack/active-version` | `{ publicationId }` | 200 `{ groupId, activePublicationId }` |

A `publication` is
`{ id, sequence, name, version, loaderVersion, gameVersion, loader, versionIds, active, publishedAt }`.
`sequence` increases per group and is never reused. Publishing snapshots the stored
draft, so a later draft save never changes an existing publication. Publishing never
activates: a new publication has `active: false`, and the active version remains
whatever the owner last selected, initially none.

Publishing requires an existing, non-empty draft and `expectedRevision` set to the
revision last read. A stale revision returns 409 before any catalog work, and the
stored selection is revalidated against Modrinth before the publishing RPC. Existing
publications are not revalidated, so a later upstream removal surfaces as an export
conflict rather than silently changing the published pack.

`limit` is 1–50 (default 20); `before` is the previous page's `nextBeforeSequence`.
Pages are ordered newest first and `nextBeforeSequence` is null on the last page.
Publication metadata obeys the same limits as the public `.mrpack` export: `name` up
to 100 and `version`/`loaderVersion` up to 50 characters, measured in UTF-16 units,
so every accepted publication can be exported later. Reads accept any stored value
the database permits, including a 100-code-point name written by a direct RPC call,
but such a value cannot be exported because the shared export contract measures
UTF-16 units.
Export accepts no body and no query parameters and uses the frozen name, version,
loader version, game version, loader and exact version IDs. Activation accepts only a
publication of the caller's own group and leaves exactly one active version. A failed
export is a documented failure, never a different pack: `409 A selected mod or
dependency is unavailable.` when a pinned version or project is gone, `409` with the
compatibility message when a version dropped the frozen Minecraft version or loader,
`502` for an upstream server error or malformed metadata, and `504` on timeout. The
frozen publication stays listed and readable in every case.

Errors: 400 invalid input, 401 authentication, 403 owner-only publish or activation,
404 no current group, no draft or unknown publication, 409 stale draft or sequence
exhaustion, 502 upstream or protocol failure, 503 missing database configuration,
504 timeout. Bodies are capped at 16 KiB and responses at 256 KiB; calls reject
redirects, use a five-second timeout and never retry.

### Group votes

Requires the same verified Clerk session and signed database role as group routes.
Every current member reads their own group's votes and ballot page; only the current
owner starts, cancels and incorporates; only the frozen electorate votes. No
submitted user or group ID selects another group's vote.

| Method and path | JSON body | Success |
| --- | --- | --- |
| GET `/groups/me/votes` | None (query: `cursor`, `limit`) | 200 `{ votes, nextCursor }` |
| POST `/groups/me/votes` | `{ gameVersion, loader, addVersionIds, durationHours, expectedDraftRevision }` | 200 vote object |
| GET `/groups/me/votes/:voteId/ballots` | None (query: `cursor`, `limit`) | 200 `{ ballots, nextCursor }` |
| POST `/groups/me/votes/:voteId/ballots` | `{ value }` where value is `approve` or `reject` | 200 vote object |
| POST `/groups/me/votes/:voteId/cancel` | None | 200 vote object |
| POST `/groups/me/votes/:voteId/incorporate` | `{ expectedRevision }` | 200 `{ vote, draft }` |

A vote is
`{ id, groupId, gameVersion, loader, proposal: [{ versionId, projectId, projectTitle, versionNumber }], durationHours, electorateSize, status, createdAt, closesAt, resolvedAt, incorporatedAt, approveCount, rejectCount, myBallot }`.
`status` is `open`, `approved`, `rejected` or `cancelled`; `myBallot` is the caller's
latest ballot or null. `proposal` is the snapshot stored at creation, so a later
catalog change cannot rewrite what the group voted on. Ballot rows are
`{ userId, username, ballot, castAt, updatedAt }`, with null ballot fields for an
electorate member who has not voted.

`addVersionIds` holds 1–50 exact Modrinth version IDs: the mod plus each required
dependency the draft does not already contain. The API validates the union of the
stored draft and the addition, requires the same Minecraft version and loader as the
draft, and rejects an ID already stored. It never resolves or adds a dependency. No
draft is needed to start voting; the first incorporation then creates the draft.
Durations are 1–720 hours. Publishing and activation are the published-version routes
above, never a vote side effect.

The electorate is frozen at creation, including the owner, and later joiners are not
added. A member may replace their own ballot while the vote is open. More than half
of `electorateSize` affirmative ballots approves the vote immediately, and no ballot
is accepted afterwards. A vote past `closesAt` without that majority reads
`rejected`; no scheduler exists, so the stored status stays `open` and every write
path refuses it. Cancellation by the owner is terminal. Several votes may be open at
once, and a departure changes neither `electorateSize` nor the ballots already cast.

Incorporation is a separate owner action. It merges the pinned addition into the
current draft under the draft's `expectedRevision` compare-and-swap, appends without
reshaping the existing selection, bumps the draft revision and records
`incorporatedAt`. It returns the updated draft and never publishes, activates or
versions the pack. A stale revision, a changed Minecraft
version or loader, or a partially stored addition returns 409 with nothing written,
leaving the vote approved and unincorporated.

An addition already present in full with matching settings is satisfied instead of
rejected: the call records `incorporatedAt` and returns the unchanged draft and its
revision. That is how a second approved vote for the same concrete addition is
discharged after the first one appended it. `GET /groups/me/votes` is the obligation
read: `status: "approved"` with `incorporatedAt: null` is pending. A pending
obligation blocks no draft save, publication, activation or ownership transfer, and
the current owner is the only incorporator after a transfer; the previous owner
receives 403.

Page sizes default to 50 and are capped at 100. Vote cursors are
`<microseconds>.<uuid>` and ballot cursors are a Clerk `user_...` subject; malformed
cursors return 400. Bodies are capped at 16 KiB and reject unknown fields;
database responses are capped at 256 KiB. Errors: 400 invalid input, 401
authentication, 403 owner-only action or non-electorate ballot, 404 no current group
or unknown vote, 409 stale revision, closed vote, incompatible settings, duplicate
addition, unapproved or already incorporated, 502 unusable upstream response, 503
missing database configuration and 504 timeout. Calls reject redirects, use a
five-second timeout, forward the unchanged user token with a publishable key and
never retry writes. As with drafts, Modrinth compatibility is validated by Hono, so
a caller using the RPC directly bypasses catalog validation; SQL still enforces
authorization, the frozen electorate, the majority and the draft compare-and-swap.

### GET /mods

Query parameters:

- `query`: optional text, at most 100 characters.
- `gameVersion` and `loader`: required. Loaders are `fabric`, `forge`, `neoforge`
  and `quilt`.
- `offset`: optional integer, digits only, `0`–`10000`, default `0`.
- `sort`: optional, one of `relevance` (default), `downloads`, `follows`, `newest`
  or `updated`. Forwarded as the upstream index, so a non-relevance sort replaces
  relevance ordering.
- `category`: optional and repeatable, or comma-separated. Each value is a category
  slug of lowercase letters, digits or hyphens. Multiple values are a union, ANDed
  with the loader and Minecraft version filters.
- `environment`: optional, `client` or `server`. It matches mods that declare that
  side as `required` or `optional`, so a mod that merely works on that side is
  included; it does not mean "exclusive to that side". Precise per-side support is
  reported per result.
- `author`: optional Modrinth username of at most 64 characters.

An unknown parameter returns 400 `Invalid query parameter.` instead of being
ignored, so a misspelled filter cannot silently return unfiltered results. A
single-value parameter repeated in the same request returns the same error rather
than being narrowed to its first value. Invalid values return 400 before any
upstream request. `author` is 1–64 characters from letters, digits, `_` and `-`.

Returns `{ hits: [ModSummary], total, offset }` with at most 20 results per page.
`ModSummary` is `{ projectId, slug, title, description, iconUrl, downloads,
follows, author, categories, clientSide, serverSide, latestVersion }`. An enriched
field the upstream omits is `null`, or `[]` for `categories`; a field that is
present but malformed fails the request. `clientSide` and `serverSide` are
`required`, `optional` or `unsupported`.

### GET /mods/:idOrSlug

Returns one `ModSummary` for a project ID or slug. The route accepts no query
parameters; any parameter returns 400 `Invalid query parameter.` An unknown
project, or one that is not a mod, returns 404 `Mod not found.`; upstream failure
returns 502 and a timeout returns 504, so a failed lookup is never reported as
not-found. `author` is only populated by search, and `latestVersion` only by
search and list responses.

### POST /packs/resolve

Body: `{ projectId, gameVersion, loader, versionIds: string[] }`.
`versionIds` contains previously approved exact Modrinth version IDs.

Returns `{ versions: [{ id, projectId, projectTitle, name, versionNumber }], addedDependencies }`.
`name` is the version display name and `projectTitle` the trimmed Modrinth project
title, so a proposal can be inspected by mod name and version without further catalog
calls. An upstream title that is absent, empty, longer than 300 characters or contains
control characters returns 502 `Modrinth returned an invalid project title.`; a
proposal is never returned partially enriched.
`addedDependencies` contains newly required
dependency version IDs, excluding the requested mod and previous selections.
The caller must obtain approval before accepting the candidate: the returned
`versions[].id` set is the complete `versionIds` a save submits, and a discarded
proposal stores nothing because resolution never writes.

### POST /packs/export

Body: `{ name, version, gameVersion, loader, loaderVersion, versionIds: string[] }`.
`version` identifies the pack release. `loaderVersion` is an exact caller-supplied
loader version, not automatically discovered or verified for existence.

Success returns an attachment with MIME `application/x-modrinth-modpack+zip`.
Its ZIP contains `modrinth.index.json`, not mod binaries. Missing required
dependencies cause rejection rather than unapproved additions.

## Errors and limits

Errors return `{ "error": "..." }`: 400 for invalid input, 404 for an unknown
catalog project, 409 for incompatible or unresolvable selections, 502 for upstream
failures including rate limits, and 504 for timeouts. Unknown routes retain the
default Hono 404 response. Check the status before treating an export response as
a ZIP.

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
