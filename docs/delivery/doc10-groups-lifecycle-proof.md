# doc10: Group lifecycle and access proof

Date: 2026-11-13
Scope: Test coverage and recorded evidence for the completion plan's M5, group lifecycle
and access, over the endpoints that already exist, plus one authorized live run with real
Clerk sessions against the selected test project. No new endpoint, migration, product
rule or frontend work.
Baseline: `origin/main` at `bce2fb7`; work on `feat/group-lifecycle`.

## Objective

M5 asks that public direct admission, private invitation with request and approval,
revocation, pages, ownership transfer and departure are covered by tests, and that a
caller's role and access change immediately as D4 and D5 define. The endpoints were
already implemented and merged in milestone 3, so this slice adds the missing evidence
instead of new behavior.

## Changes and rationale

- [groups.test.sql](../../supabase/tests/database/groups.test.sql) gained 24 pgTAP
  assertions for the parts of M5 the suite did not pin: pending-request pages crossing
  cursors to the final short page, an empty page past the end, a request-page limit
  below the minimum being clamped, a limit above the maximum accepted without
  truncation, and refusal of a rotated or revoked token both when resolving and when
  creating a join request. The member page gained the same clamping and past-the-end
  assertions. Existing admission, approval, rejection, transfer and departure
  assertions were left untouched.
- [test-postgrest.ts](../../scripts/test-postgrest.ts) grew from five signed-token
  checks to a multi-subject lifecycle suite on the real PostgREST surface. It now
  creates a public group and admits two joiners, proves a repeated same-group join is
  idempotent, refuses joining a second group, pages the member list across cursors,
  refuses every owner-only operation for a member, transfers ownership and observes the
  new owner and previous owner roles in the next read, exercises both departure paths
  including group deletion, and repeats the private path: invitation, resolution
  without membership, pending request, owner-only request page, approval, rejection,
  rotation and revocation. Every check prints its observed result, and the runner fails
  when any probe fixture survives cleanup.
- [test-group-session.ts](../../scripts/test-group-session.ts) adds the hosted live
  check. It creates three disposable `+clerk_test` accounts, completes a real
  email/password sign-in for each, and runs the same lifecycle through Hono against the
  selected test project with the real session tokens: profiles, public admission, member
  pages, owner-only refusals, immediate ownership transfer, both departure paths, and the
  private path with approval, rejection, rotation and revocation. It refuses to run
  without `--live`, refuses non-development credentials, refuses a local database URL,
  prints no secret or token, and deletes every account it created, including ids
  registered before a sign-in call can fail.
- The cleanup assertion is new for this slice: the earlier script deleted its rows but
  never verified the deletion, so a silently failing cleanup could have left fixtures
  behind while the command exited 0.

No SQL, route, validation rule, response shape or documentation of behavior changed.
The [group guide](../guides/groups.md) and the
[API reference](../reference/backend-api.md#groups) remain accurate as written.

## Verification

Environment: local disposable Supabase stack (Docker 29.9.3, PostgreSQL 17.11), Bun
1.4.4, no hosted project and no provider account touched.

- Baseline before any change: `bun run db:test` PASS, six files and 193 tests;
  `bun run db:test:postgrest` five of five checks passed.
- After the change: `bun run db:test` PASS, six files and 217 tests (24 new).
- After the change: `bun run db:test:postgrest` 58 of 58 checks passed.
- `bun run check` passes both application typechecks and 153 tests with 2655
  assertions.
- Mutation sensitivity was observed, not assumed. Two local-only mutations were applied
  to the database, never to the repository: `leave_group` lost its
  transfer-before-leaving refusal, and `resolve_invitation` ignored `revoked_at`. With
  them, pgTAP failed 9 of the groups file's 166 subtests (rotated and revoked token
  resolution, owner-with-members departure, previous-owner role, remaining transfer and
  sole-owner deletion) and the PostgREST suite failed six checks (the same departure and
  revocation cases). `bun run db:reset` restored the migrations and both suites returned
  to PASS. This shows the new assertions respond to a real behavior change; it is not
  mutation coverage of the schema.
- The two claim-holding paths stay separate here as in doc07: the local PostgREST accepts
  only the stack's symmetric secret while Hono verifies an RSA key, so these checks prove
  the database half of the request path with locally signed tokens. Hono's forwarding,
  validation and status mapping are covered by the API unit tests with a stub.
- Hosted live run on 2026-11-13: `bun scripts/test-group-session.ts --live` passed all 30
  checks with three real Clerk sessions against the selected test project, through a
  locally running API using the repository environment files. The same session token was
  accepted by Hono and forwarded to PostgREST, which is the hosted chain the local stack
  cannot assemble. Hosted table reads stayed refused even for a valid session token.
- The live script closed every group through the API before finishing, so only the three
  account profiles needed SQL: one exact-id delete, executed with authorization. Readback
  afterwards showed zero rows in `profiles`, `groups`, `group_members`,
  `group_invitations` and `group_join_requests`, and the Clerk instance again holds only
  the owner account.
- Two behaviours were observed while writing the live script. A development-instance
  browser token does not serve a second sign-in flow, so each account obtains its own;
  with a single shared token the second account never reached the password factor. A first
  failed attempt also left one test account behind because its id was registered only
  after sign-in; the id is now registered immediately after creation, the orphan was
  deleted with the Clerk CLI, and the instance was read back.

## Limits

- The hosted proof ran once, with real sessions on the Development instance and the
  selected test project. It is not a production run, and re-running it needs the same
  bounded authorization plus disposable fixtures.
- The upper page-limit clamp cannot be observed with the fixture sizes used: accepting a
  limit of 150 proves the value is not rejected, not that it became 100. The bound is
  visible only in the function body and in the earlier 2501-member integration probe
  recorded in doc07.
- No mutation was run against the lock discipline or the one-group unique index; the
  concurrency checks in `bun run db:test:concurrency` were not rerun for this slice.
- Group directory/discovery and member expulsion remain out of scope, as M5 states.

## Delivery state

Implementation and evidence: this record, the pgTAP additions, the PostgREST lifecycle
suite and the live hosted check on `feat/group-lifecycle`, isolated in its own worktree
from `origin/main` at `bce2fb7`. The live run used the selected test project and the
development Clerk instance with disposable fixtures, all removed afterwards. Native
review, publication, merge and deployment: none performed. The feature log is
[completion-m5-group-lifecycle](../../odd/tasks/completion-m5-group-lifecycle.md).

## Remaining work

- Re-run the hosted check after any change to the group routes, RLS grants or Clerk token
  template; it is a live script and does not run in CI.
- Re-run the concurrency suite if the lock discipline or admission constraints change.
- Resume from the [current handoff](../handoff.md).
