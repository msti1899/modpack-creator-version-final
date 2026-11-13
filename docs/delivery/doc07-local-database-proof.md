# doc07: Local database proof

Date: 2026-11-12
Scope: Complete the database evidence that milestones 3-6 recorded as missing, using a
real local Supabase stack. No product behavior, endpoint or migration changes.
Baseline: `main` at `5c83c5c`; work on `feat/backend-proof-completion`.

## Objective

Milestones 3-6 were implemented and merged while actual pgTAP, the upgrade runner,
real multi-session races and the PostgREST authorization branch stayed unproven,
because no container runtime was available. Docker was installed with owner
authorization and the local stack became available, so those checks could finally
run. This record captures what they proved and what they still cannot prove.

## Changes and rationale

- `supabase/tests/upgrades/clerk-profile-owners.sql` moved to
  `supabase/upgrade-tests/clerk-profile-owners.sql`. `supabase test db` discovers every
  file under `supabase/tests`, so this non-pgTAP upgrade script ran as a pgTAP file,
  died on `role "anon" already exists`, and failed the whole command. The defect was
  invisible while pgTAP never ran. [The upgrade runner](../../scripts/test-profile-upgrade.ts)
  now mounts it from its new location and the relative `\ir` includes follow.
- [scripts/test-concurrency.ts](../../scripts/test-concurrency.ts) adds real
  multi-session checks for the three rules that were previously argued from lock
  discipline: public admission, publication sequencing and ballot counting. Each check
  opens two independent sessions inside the stack's own database container, holds the
  first transaction open after it takes its lock, and starts the second one while the
  first is still uncommitted.
- [scripts/test-postgrest.ts](../../scripts/test-postgrest.ts) adds signed-token checks
  against the local PostgREST surface: a locally signed token reaches the group RPC, a
  request without a token is rejected, a token signed with another secret is rejected,
  direct table reads stay closed and the same token reads its group back.
- Both scripts follow the existing local-only convention: no arguments, no connection
  string, no forwarded Docker flags, and they refuse to run when the stack is absent.

## Verification

Environment: CachyOS Linux, Docker 29.9.3 with the compose plugin, Supabase CLI 3.0.0,
project `modpack-creator-local`, PostgreSQL image `17.11.0.011`.

- `bun run db:start` on 2026-11-12 pulled the stack and applied all nine migrations in
  order, exposing `postgresql://postgres:postgres@127.0.0.1:54322/postgres` and
  `http://127.0.0.1:54321`. This is the first real-stack application in the record;
  earlier runs used an isolated PGlite session.
- `bun run db:test`, first run: all six pgTAP suites passed (193 tests) and the command
  still exited 1 because `supabase test db` also discovered the upgrade script, which
  reported `role "anon" already exists` with `No plan found in TAP output`. Recorded as
  a discovery defect, not a schema defect.
- `bun run db:test` after the move: `Result: PASS`, six files, 193 tests.
- `bun run db:test:upgrade`: `Profile upgrade regression passed.` in its disposable
  container, with the legacy owner, username and cooldown preserved.
- `bun run db:test:concurrency`: eight checks pass. Concurrent admission of one person
  into two public groups leaves exactly one membership and the contending session
  reports `Already in a group.`; two concurrent publications both complete with
  sequences 1 and 2 and activate nothing; two concurrent approving ballots produce one
  ballot per voter and close a three-person vote exactly once.
- `bun run db:test:postgrest`: five checks pass, listed above.
- `bun run check` after the changes: 125 tests, 2310 assertions, both typechecks.
- `bun run db:test` still cannot substitute for hosted proof. Lock discipline was not
  mutation-tested: the checks are designed so that removing a lock or the one-group
  unique index changes the observed result, but no such mutation was run.
- The PostgREST script signs its own HS256 token with the stack secret. Hono accepts
  only an RSA public key and the local PostgREST only that symmetric secret, so no
  single token crosses both validators locally. The Clerk→Hono→PostgREST chain as a
  whole remains unproven; Hono's forwarding and status mapping stay covered by unit
  tests with a stub, and this record does not claim hosted Clerk verification.

## Delivery state

Implementation and documentation: this record and its commits on
`feat/backend-proof-completion`. Review: not run for this slice. Commit: `7ad8f98`,
`db263f2` and `a6563c9`. Publication and merge: published and merged the same day
through [PR #51](https://github.com/msti1899/modpack-creator-version-final/pull/51) as
`becd201`, with the Backend checks passing in 50 seconds on the branch head.
Deployment: none.

## Remaining work

- Native review of this slice, and the still-open native review gap for milestone 3
  (three of four lenses, no receipt) and milestone 5.
- Correction, 2026-11-13: the owner authorized applying the publication and votes
  migrations to the selected test project. All nine migrations are now applied there and
  the schema was read back: the four new tables exist with row level security enabled,
  no client grants and only service-role table access, and the publication and voting
  RPCs are granted to `authenticated`. Hosted functional proof of those flows still
  needs a real signed session.
- Full Google/Discord OAuth completion and real email delivery, which need provider
  accounts rather than code.
- Next action is tracked in the [current handoff](../handoff.md).

## References

- [Backend roadmap](../plans/backend-roadmap.md)
- [doc02: Groups and permissions](doc02-groups-permissions.md)
- [doc04: Persisted pack drafts](doc04-pack-drafts.md)
- [doc05: Published versions and sharing](doc05-published-versions.md)
- [doc06: Group voting](doc06-voting.md)
- [Feature log](../../odd/tasks/backend-proof-completion.md)
