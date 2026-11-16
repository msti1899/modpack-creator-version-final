# doc26: Group summary for link-only discovery

- Date: 2026-11-16
- Scope: board item #129, the one backend read that D-F2 required.
- State: implemented on `feat/group-summary`; merge pending at the time of writing.
- Outcome: a public join link can name its group, its owner and its size before the person
  joins, without exposing members or confirming that a private group exists.

## What changed

- `supabase/migrations/20261116230000_group_summary.sql` adds a `security definer` RPC that
  returns `{ id, name, visibility, ownerUsername, memberCount, membership }` for one group.
  A public group is readable by any signed-in caller; a private one is returned only to a
  member or a pending requester. It is granted to `authenticated` and revoked from `anon`.
- `apps/api/src/groups.ts` registers `GET /groups/:groupId/summary`, projects only the named
  fields and maps a null RPC result to 404 with the same message as an unknown group.
- [The API reference](../reference/backend-api.md) documents the route and the privacy rule.

## What was checked

- `bun test apps/api/tests/group-summary.test.ts`: 5 tests, 15 assertions. The public shape
  with no member list, the 404 for a private outsider, both membership values, the invalid
  identifier and the missing token before any RPC call, and a 502 for a malformed payload.
- `supabase/tests/database/groups.test.sql` gains eight checks on fresh fixtures: a public
  group is visible to an outsider, its owner is named, no member list is returned, a private
  group is invisible to an outsider, a private owner reads `member`, and `anon` cannot execute
  the RPC. `bun run db:test` passes 447 results across 9 files.
- The new migration was applied to the local disposable stack with `supabase db push` and the
  whole pgTAP suite rerun against it. `bun run typecheck`, `bun run lint` and the app tests are
  clean.

## Not proven

- The migration is applied locally only. It has not been applied to the hosted test project,
  which needs its own authorization, and no hosted session exercised the route.
- The SQL checks use fresh profiles and groups inside one rolled-back transaction; they prove
  the function's rules, not a live browser journey from a link.
- No screen consumes the route yet. The join surface belongs to F3 and still needs its design
  round.

## Remaining work

- F3's approved design round and its implementation, which will consume this route from a
  public join link.
