# Groups and permissions

Use the independent API with a verified Clerk bearer token carrying
`role: "authenticated"`. Assign a [profile](account-profiles.md) first.
Each account can belong to one group, including groups it owns. No frontend,
persisted pack, publication or voting workflow is included in this milestone.

## Create or join a group

POST `/groups` with `{ "name": "Friends", "visibility": "public" }` (or
`"private"`). Creation makes the caller the owner and first member. Names retain
Unicode characters and casing, trim surrounding spaces, and are limited to
60 characters without control characters or U+FEFF. Surrounding Unicode spaces
are trimmed consistently by the API and database; group names need not be unique.

GET `/groups/me` returns the caller's group, or `{ "group": null }`. The group
includes `memberCount` and the first 50 members; when more exist,
`membersNextCursor` is non-null. The owner also gets up to 50 pending requests
and `requestsNextCursor`. Continue either collection with
`GET /groups/me/members?limit=100&cursor=<membersNextCursor>` or
`GET /groups/me/requests?limit=100&cursor=<requestsNextCursor>`. The limit is
1–100 and defaults to 50. There is no public group directory in this delivery.
Given a known public group ID, POST `/groups/<groupId>/join` without a body to
join directly. Joining the same group again is idempotent; joining another group
returns 409.

For a private group, the owner POSTs `/groups/me/invitation` to create an invitation
token. The web client can embed it in a link; no frontend link route is implemented
here. Keep the token private and out of logs. A new invitation invalidates the
previous token; DELETE `/groups/me/invitation` revokes it. Tokens do not expire
automatically in this delivery.

The authenticated recipient GETs `/groups/invitations/<token>` to inspect the
target group and their own pending/member flags, then POSTs
`/groups/invitations/<token>/requests` without a body. This creates a pending
request, not membership. The owner sees pending requests in GET `/groups/me` and
POSTs `/groups/me/requests/<userId>/approve` or `/reject`. Only approval admits
the user. If that user already joined another group, approval fails without
consuming the pending request. Revoking a token does not cancel existing requests.

## Transfer ownership or leave

Only the owner can POST `/groups/me/ownership` with `{ "userId": "user_member" }`.
The target must already be a member. Transfer is immediate, with no acceptance
step; the former owner remains a member and loses owner-only access immediately.

DELETE `/groups/me/membership` leaves the group. An owner with other members gets
409 and must transfer ownership first. **A sole owner leaving deletes the group**
and its memberships, invitations and join requests. This is not an archive and
there is no recovery endpoint. No pack table exists yet; future pack-deletion
behavior is not implemented or verified by this migration.

## Database guarantees and limits

PostgreSQL unique constraints enforce one membership per account; deferred
constraints require the owner to be a member. RPCs implement admission and
departure in transactions. A rejected command leaves persisted state unchanged.
The forward trigger-privilege migration is required on PostgreSQL 17 so deferred
checks can read their tables when an authenticated transaction commits. The
trigger has a fixed empty search path and remains non-executable by clients.

All four group tables have RLS enabled, with no direct grants to `anon` or
`authenticated`. Eleven explicitly granted RPCs authorize the caller from signed
JWT `sub`; internal helpers are not executable by clients. The API forwards the
unchanged Clerk token and uses only a publishable/anon key, never `service_role`.
Members receive no owner invitation or request list; nonmembers cannot read the
group's member list. Access is enforced by RPC authorization, not by treating
`SECURITY DEFINER` as RLS enforcement. Its grants, empty search path and explicit
caller checks are essential security boundaries.

The hosted SQL checks used temporary claims, not real Clerk sessions. Real
PostgreSQL race checks and cleanup were observed; the checked-in pgTAP suite has
not run under pgTAP. See the [feature log](../../odd/tasks/groups-permissions.md)
for exact evidence and the [API reference](../reference/backend-api.md) for HTTP
limits. On a timeout, read current state before retrying: a lost response does
not establish rollback. The server does not retry writes.
