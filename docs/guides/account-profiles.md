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
access, deletion, ownership changes, and client timestamp writes are not granted.
The invoker trigger sets the rename timestamp in the database; it is not an
executable client RPC. PostgreSQL row locks and the unique index arbitrate races,
not a separate username-availability lookup.

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
