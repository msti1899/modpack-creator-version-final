# Local account profiles

This guide targets the completed Clerk cutover. The database review slice alone
does not migrate the API and must not be deployed independently.

The database stores one username per Clerk user ID. Authenticated profile
endpoints read, assign, and rename the caller's username. Clerk owns accounts/sessions; application usernames remain database-owned,
not automatically synchronized with Clerk usernames. Public Modrinth routes stay public.

## Use the profile endpoints

With the [local identity configuration](local-identity.md), database configuration
and a valid Clerk token carrying `role: "authenticated"`,
GET `/profile` to read your profile. POST `{ "username": "Mati_1899" }` to assign
the initial name; PATCH that same shape to rename it. Send the user token in the
Authorization bearer header and JSON bodies with `Content-Type: application/json`.
POST does not overwrite an existing profile. No profile is created merely by
signing in. Never send owner IDs, timestamps, or privileged API keys.

See [API reference](../reference/backend-api.md) for exact responses and errors.
If a write times out, read the profile before retrying: the database may have
committed before the response was lost. Identical PATCH retries do not restart
the cooldown; the server does not automatically retry writes.

## Onboarding contract

Signing in never creates a profile. Treat `GET /profile` as the completion check:

| `GET /profile` | Meaning | Next step |
| --- | --- | --- |
| `200 {"profile": null}` | The account still needs a username | `POST /profile` |
| `200 {"profile": {...}}` | The account is complete | Show the username or `PATCH` to rename |

A `POST` conflict is resolvable because the API names its cause:

- `409 Profile already exists.` The account already has a profile. Read it and
  continue with `PATCH` (or show the stored username); do not retry another name.
- `409 Username is already taken.` Another account owns that name, ignoring
  casing. Ask for a different username and retry `POST` or `PATCH`.
- `409 Profile or username already exists.` The API could not classify the
  conflict safely because the follow-up read failed. Read the profile before
  deciding; retry once the profile service is reachable.

Group creation and joining require a profile: `POST /groups` without one returns
`409 {"error": "Profile required."}` and writes no group row. This is deliberate,
not a transient failure. `GET /me` stays identity-only, so clients must call
`GET /profile` to detect a missing profile.

## Delete the account

`DELETE /profile` deletes the caller's application account data:

- `200 { "account": { "deleted": true, "group": null } }` for an account without a
  group. `group` is `{ "id", "deleted" }` when the caller belonged to one.
- `409 {"error": "Transfers are required before leaving a group with other members."}`
  when the caller owns a group that still has other members. Nothing changes; the
  owner transfers ownership first, exactly as when leaving a group.
- The last member's deletion removes the group, its draft, its published versions
  and its votes. A member's deletion removes only the membership.
- The profile row is deleted, so the username becomes available immediately.
  Votes, frozen electorates, cast ballots, invitations and decided requests of a
  surviving group are kept; the deleted account stays there as an opaque subject
  with no username.
- Repeating the call is safe: it returns `200` with `"deleted": false` because the
  requested end state already holds. Send no body, or an empty JSON object; any
  field returns `400`.

Clerk keeps owning the sign-in account, so this route changes no credential and
calls no provider. Deleting the account in Clerk instead, without calling this
route, is reconciled by the provider webhook described below once that endpoint is
registered.

## Provider-side deletion

`POST /webhooks/clerk` receives Clerk identity events. It reacts only to
`user.deleted`; every other event type is acknowledged and ignored. The request must
carry a signature that verifies against `CLERK_WEBHOOK_SIGNING_SECRET`, and the write
uses `SUPABASE_SECRET_KEY`. Without both values the route answers `503` and changes
nothing, so an unconfigured deployment never applies a half-configured deletion.

The same retention rules apply, with one difference: an owner who can no longer sign
in cannot transfer first. Ownership therefore passes immediately to the remaining
member who has been in the group longest, ordered by join time and then by subject.
The successor needs no acceptance step, and the group, its draft, its publications
and its votes are untouched. A member loses only the membership, the last member
deletes the group, and a repeated event writes nothing. The session route above keeps
its `409` refusal, because a holder who can still sign in keeps the choice.

Registering the endpoint and its signing secret in Clerk needs a public URL, which is
a deployment step. Until that exists, a Clerk-only deletion in a live environment is
not reconciled. See [ADR0005](../decisions/0005-provider-account-reconciliation.md).

## Database contract

`public.profiles` contains `user_id`, `username`, and nullable
`username_changed_at`. `user_id` is text and contains the verified Clerk subject.
RLS compares it to `auth.jwt()->>'sub'`, not UUID-only `auth.uid()`. A user without a profile has not chosen a username yet.

- Usernames use 3–20 ASCII letters, digits, or underscores; preserve letter casing.
- The unique index compares `lower(username)` with the C collation. `Matias` and
  `matias` cannot belong to different accounts, including concurrent requests.
- Initial assignment leaves the rename timestamp null. The first actual rename
  is immediate; later changes require 30 days since the previous rename.
- Identical writes do not count as a rename. A casing-only change is a change.
- A successful rename frees the previous name. Rejected writes change neither
  the name nor its timestamp.

Authenticated users may select their own row, insert only their own `user_id`
and `username`, and update only `username`. RLS isolates accounts. Anonymous
access, direct table deletion, ownership changes, and client timestamp writes are
not granted. Deletion is available only through the `delete_my_account` RPC, which
resolves the caller from the signed subject. The invoker trigger sets the rename
timestamp in the database; it is not an executable client RPC. PostgreSQL row
locks and the unique index arbitrate races, not a separate username-availability
lookup.

A deleted account leaves no profile row, so a surviving group's historical rows
keep only the Clerk subject. The four foreign keys that previously made that
impossible are gone; `groups.owner_id` and `group_members.user_id` still guard
ownership and membership, and the departure step removes those rows first.

## Verify locally

Follow the [local database guide](local-database.md) to start a new disposable
stack with the tracked migrations, then run `bun run db:test`. The profile pgTAP
tests run in a transaction and roll back fixtures. Do not reset an existing
developer database without consent: reset deletes local data.

The [task log](../../odd/tasks/account-profiles.md) separates database checks,
independent verification, native review, HTTP implementation, and publication.
No cloud project, email delivery, Google/Discord configuration, or deployment is
part of this slice.

## Database trust and legacy data

Set API `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` independently of the Clerk
verification settings; never use service-role credentials. Configure the database
project to trust the same Clerk instance, and issue tokens with the authenticated
role. The API rejects missing/privileged role claims before forwarding. Real
provider/project setup requires separate authorization; synthetic local JWT tests
are not proof that hosted trust is configured.

The forward Clerk-owner migration retains every legacy UUID value as text,
including username and cooldown; it does not create Clerk links or import users.
Those rows remain reserved and inaccessible to Clerk subjects. No data is deleted
or reassigned by matching email. Any later account-continuity operation requires
explicit verified ownership and a separate plan. Apply through the normal migration
process with backup/rollback planning; never reset an existing database as migration.

References: [Clerk third-party auth](https://supabase.com/docs/guides/auth/third-party/clerk)
and [profile ownership decision](../decisions/0003-clerk-profile-ownership.md).
