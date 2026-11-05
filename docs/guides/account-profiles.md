# Local account profiles

The database stores one username per Supabase Auth user. This delivery adds the
database rules only; HTTP profile endpoints are the next slice. Existing `/me`
and public Modrinth routes are unchanged. Full account/provider workflows remain
unimplemented.

## Database contract

`public.profiles` contains `user_id`, `username`, and nullable
`username_changed_at`. A user without a profile has not chosen a username yet.

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
