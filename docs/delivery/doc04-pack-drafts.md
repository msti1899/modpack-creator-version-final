# doc04: Persisted pack drafts

Date: 2026-11-12
Scope: Backend draft persistence, owner-only editing, exact approved versions and
draft export for one group pack; no frontend, publication, active-version selection,
sharing links, voting, deployment or merge.
Baseline: `feat/pack-drafts`, based on `feat/groups-permissions` at `2a5628c`
(milestone 3 committed as `71dac1f`).

## Objective

Implement approved roadmap milestone 4: one draft pack per group, owner-only edits,
exact approved mod and dependency versions, and reuse of the existing stateless
Modrinth resolution and export. Failed writes must leave no partial selection. The
owner also decided that changing a draft's Minecraft version or loader requires the
entire selection to remain compatible, and that an incompatible change is rejected
without clearing or substituting approved versions.

## Changes and rationale

- `pack_drafts` holds one row per group with game version, loader, exact version
  IDs, a monotonic revision and an update timestamp. Row level security is enabled,
  direct table privileges are revoked, and only two authenticated RPCs are granted,
  matching the existing group boundary.
- `my_pack_draft` returns the caller's group, their role and the stored draft.
  `save_pack_draft` locks the group row, rechecks current ownership, validates
  settings and selection shape, and replaces the whole selection under a revision
  compare-and-swap. Lazy creation keeps the existing group contract unchanged.
- The Hono routes read, save and export the draft. Save validates the complete
  supplied selection through the existing Modrinth selection code without permitting
  dependency resolution, so saving never adds or upgrades a version. A stale
  revision is rejected before that external work; the database compare-and-swap
  remains authoritative for races.
- Export builds the archive from the stored selection and accepts only presentation
  fields, so a caller cannot override mods, game version or loader.
- Behavior and contracts live in the [draft guide](../guides/pack-drafts.md),
  [API reference](../reference/backend-api.md#group-pack-drafts) and the updated
  [decision baseline](../decisions/0001-project-baseline.md).

## Verification

Local, 2026-11-12:

- RED observed before implementation: draft HTTP tests returned 404 and the native
  SQL assertions failed because `public.pack_drafts` did not exist.
- `bun run check`: 86 tests / 1687 assertions, both app typechecks exit 0.
- Focused draft suite: 14 tests, including transport 502/504, missing configuration
  503, stored-empty export 400 and stale-revision rejection before catalog work.
- Isolated single-session SQL assertions pass under PGlite. This is supplemental
  evidence, not a pgTAP run.
- Independent read-only verification reproduced no blocker: 12 additional HTTP probes
  (122 assertions), 73 additional native SQL assertions, and 23 differential public
  search/resolve/export cases identical to the pre-feature snapshot. Rejected commands
  left the full stored row unchanged.

Hosted, 2026-11-12, under explicit bounded authorization for the selected test project:

- The draft migration was applied once; the hosted ledger version is
  `20261112215926` with md5 `dd3b2180…` and sha256 `2e9c70e4…`, identical to the local
  file. The local filename was renamed for parity only and must not be re-applied.
- 100 native PostgreSQL 17.11 assertions passed in a rolled-back transaction,
  covering direct-access denials, definer and privilege invariants, selection
  boundaries, compare-and-swap, isolation, transfer and cascade.
- A committed authenticated fixture flow passed owner-only save, member read,
  outsider isolation, unchanged full-row hash after rejected writes, transfer
  revocation and new-owner save.
- Two genuine two-connection races overlapped on distinct backends and the group
  lock: duplicate saves produced exactly one write plus a conflict for the loser, and
  a save racing an ownership transfer was rejected with the draft row unchanged.
- Fixtures were removed through group leave/cascade and tagged profile deletion; all
  six tables returned to zero rows with the baseline empty-set hash. Security
  advisors kept only the expected RPC-only and authenticated-definer findings.

Native review: two candidates were approved and acknowledged; the second covers the
current source bytes and consumed its own revision. The reviewer found no
authorization bypass, IDOR, injection sink or secret leak, and identified one
documentation defect in this delivery (an outdated dependency paragraph in the
handoff), which was corrected afterwards.

## Delivery state

Implementation, tests, documentation, hosted proof and native review are complete for
the recorded candidate. Committed and pushed on `feat/pack-drafts`; no pull request,
merge or deployment is recorded.

## Remaining work

- Actual pgTAP execution and the Docker-dependent upgrade runner remain unavailable;
  the checked-in database suite uses native assertions inside pgTAP framing.
- A real signed Clerk→Hono→PostgREST draft request and HTTP-side Modrinth validation
  through a deployed API are unproven.
- Advisories left as later work: HTTP coverage for group error mappings, draft 404 and
  malformed-body precedence, empty/50/51/duplicate selections through the routes,
  focused-test gating, failure-path observability, a degraded mode when Modrinth
  removes a pinned version, and the approved irreversible sole-owner deletion.
- Next action is tracked in the [current handoff](../handoff.md).

## References

- [Draft guide](../guides/pack-drafts.md)
- [API reference: group pack drafts](../reference/backend-api.md#group-pack-drafts)
- [Decision baseline](../decisions/0001-project-baseline.md)
- [Draft tasks](../../odd/tasks/pack-drafts.md)
- [doc02: Groups and permissions](doc02-groups-permissions.md)
