# doc02: Groups and permissions

Date: 2026-11-12
Scope: Backend groups, membership, owner permissions and admission; no frontend,
pack persistence, voting, deployment or publication.
Baseline: `feat/groups-permissions` rebased onto `main` at
`9219a87`; the original milestone branch point was `30ead7d`.

## Objective

Implement approved roadmap milestone 3. The owner approved continuation and
immediate ownership transfer without recipient acceptance. A later explicit
authorization permitted necessary migration and temporary fixture tests in the
selected test project, not resets, deletion of unrelated data or publication.

## Changes and rationale

- Four group tables and thirteen authenticated group RPCs enforce one group per account,
  public direct admission, private invitation plus owner approval, immediate
  ownership transfer and transfer-before-leave. Sole-owner departure deletes the
  group and its dependent membership/invitation/request records.
- Database constraints and transaction locks arbitrate competing admissions;
  there is no separate availability check that grants membership.
- The independent API forwards verified Clerk bearer tokens with a publishable
  key. Direct table access and helper execution are denied. Explicit RPC checks,
  rather than RLS policies, authorize the `SECURITY DEFINER` operations.
- The [group guide](../guides/groups.md) and [API reference](../reference/backend-api.md#groups)
  own the usage and HTTP contract. There is no public group-directory endpoint;
  group names do not inherit the separate ASCII-only username restriction.

## Verification

Environment: local Bun workspace and the explicitly selected Supabase test project,
PostgreSQL 17.11. See the [feature log](../../odd/tasks/groups-permissions.md) for
commands, RED/GREEN evidence and retained probe locations.

- Local focused API checks: 15 tests / 255 assertions passed. Full `bun run check`:
  both application typechecks and 71 tests / 1455 assertions passed.
- Parent differential: 17 old/current HTTP comparisons matched status, headers
  and body hashes. Independent verification: 332 HTTP checks passed and 33
  differential comparisons matched; no change-caused blocker was reproduced.
- Real database probes verified permissions, cross-group isolation, Unicode
  names, immediate transfer, leave/deletion cascades and unchanged state after
  rejected writes. Two actually overlapping multi-connection races admitted
  exactly one user: competing public joins and competing private approvals.
- The applied SQL matches the local migration bytes. Migration ledger version
  `20261112201725`; SQL MD5 `7ce6507e9b3d6d69fdc96581d64df959`.
- Native review identified a PostgreSQL 17 commit-boundary defect missed by the
  earlier checks: the invoker deferred trigger failed with 42501 after the RPC's
  privileged context ended. A direct authenticated COMMIT reproduced it without
  leaving fixtures. Forward migration `20261112214259` makes only that invariant
  trigger a definer with an empty search path and revoked client execution;
  the previously applied migration is unchanged. Regression checks then committed
  create/join/approval/transfer/departure successfully as `authenticated`, removed
  their fixtures, and verified direct table/helper access remained denied. This
  supersedes the initial PGlite inference about deferred trigger privilege.
- All tagged test fixtures were removed. The parent independently read back zero
  profiles and zero rows in all four group tables; the profile hash equals the
  pre-apply baseline. No real Clerk accounts were created for these checks.
- The actual pgTAP suite is **not run**: no local stack exists and the MCP exposes
  no supported pgTAP runner. `bun run db:test` failed to connect to the absent
  local database; the Docker-dependent upgrade runner was not run. PGlite
  assertion stubs are supplemental structural evidence, not pgTAP evidence.
- No full real-session Clerk → Hono → PostgREST group flow was exercised. API
  signatures/forwarding and database claims were checked separately. The earlier
  profile-session checks do not prove this new flow.
- Hosted advisors report four RLS-without-policy tables and authenticated definer
  RPCs, consistent with the tested RPC-only design; FK-index advisories were
  reduced by the pagination indexes. Profile initplan warnings predate this
  migration. This is not a clean-advisor report.
- Manual review reproduced and a forward migration fixed two 502 cases:
  SQL `btrim` accepted a U+00A0-only name the HTTP Unicode normalization rejected
  on read, and a valid 2501-member overview exceeded the 262144-byte transport
  cap. Migration `20261112222116` applies one explicit Unicode-space/control/FEFF
  contract and caps embedded collections at 50 with keyset cursors. Hosted checks
  with 121 members and 60 requests returned a 6324-byte overview, 50 embedded
  entries, complete pages (100 + 21 members; 30 + 30 requests), trimmed `Café`
  from a wrapped Unicode name, rejected NBSP-only/FEFF names, and left zero
  fixture rows. The integration probe also paginated all 2502 members of a
  2501-member group without loss.

## Delivery state

Implementation and guide/reference are present; applicable native SQL and HTTP
checks passed with the missing proof above. This record does not claim full
verification or a native review receipt. The current checkpoint owns subsequent
review and delivery state. Source changes were committed as `71dac1f` and published
in [PR #45](https://github.com/msti1899/modpack-creator-version-final/pull/45);
Backend CI passed. No merge or deployment was performed. The initial migration and
its forward trigger fix are applied only to the authorized test project; native
targeted validation is pending.

## Remaining work

Native candidate review was explicitly consented, but the review stopped with
three of four lenses complete and no receipt; its bounded correction/targeted
validation govern any later closure. Actual pgTAP and real-session group-flow checks remain
unverified. Local commit/slicing and any publication follow separate repository
policy and authorization. Resume from the [current handoff](../handoff.md).
