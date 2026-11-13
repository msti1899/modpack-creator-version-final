# doc05: Published versions and sharing

Date: 2026-11-12
Scope: Backend published pack versions, owner-selected activation, member-only sharing
and frozen `.mrpack` export for one group pack; no frontend, anonymous access, voting,
deployment or merge.
Baseline: `feat/published-versions`, cut from `main` at `d5d3c40`, which already
contains the merged milestone 3 (PR #45) and milestone 4 (PR #46) deliveries.

## Objective

Implement approved roadmap milestone 5: preserve earlier publications, let the owner
select the active version explicitly, and make shared links respect access rules while
publishing never activates a version by itself. The owner also decided that only
current members of a group may read or export its published versions, so possession of
a link grants no access by itself. Accepted D6 requires published versions to be
immutable snapshots and the active choice to be independent of the latest publication.

## Changes and rationale

- `pack_publications` stores one immutable row per publication: the frozen draft
  selection, the frozen presentation metadata, a per-group `sequence` that is never
  reused, an `is_active` flag and a publication timestamp. Row level security is
  enabled, direct table privileges are revoked and a partial unique index enforces at
  most one active row per group.
- `my_pack_publications` returns a keyset page ordered newest first, bounded to 50
  entries, with `activePublicationId` and `nextBeforeSequence`. Bounding the embedded
  collection avoids the unbounded-response class fixed in milestone 3.
- `my_pack_publication` returns one publication of the caller's own group. Another
  group's identifier is indistinguishable from a missing one, and a caller without a
  group receives `Group required.`.
- `publish_pack_draft` locks the group row, rechecks current ownership, requires the
  draft revision the caller reviewed, rejects an empty draft and copies the stored
  selection. It never sets `is_active`, so publishing does not activate.
- `activate_pack_publication` is a separate owner action under the same lock. It
  clears the previous active row before setting the new one and accepts only a
  publication of the caller's group.
- The Hono routes list, read, publish, activate and export. Publishing revalidates the
  stored selection through the existing Modrinth selection code and rejects a stale
  revision before that external work; the database compare-and-swap and group lock
  remain authoritative for races.
- Export builds the archive from the frozen metadata and accepts no body or query
  parameters, so a caller cannot substitute a selection. Publication metadata obeys
  the existing public export limits, while reads accept any value the database permits
  so a direct RPC write stays readable.
- Behavior and contracts live in the [publication guide](../guides/pack-publications.md),
  [API reference](../reference/backend-api.md#published-pack-versions) and the updated
  [decision baseline](../decisions/0001-project-baseline.md).

## Verification

Local, 2026-11-12:

- RED observed before implementation: 11 of 12 new publication HTTP tests failed with
  404 because the routes did not exist.
- `bun test apps/api/tests/pack-publications.test.ts`: 17 tests / 365 assertions.
- `bun run check`: 103 tests / 2075 assertions, both application typechecks exit 0.
- All eight migrations applied in order on PGlite 0.5.16 in an isolated external
  scratch harness with `anon`/`authenticated` roles, `auth` schema stubs and pgTAP
  `plan`/`pass`/`finish` stubs. The checked-in publication suite passed and the
  existing draft suite re-passed on the same run. This is supplemental evidence, not
  a pgTAP execution.
- Differential against `main` at `d5d3c40`: 16 scenarios identical in status, headers
  and body, including `/health`, `/me` with and without a session, group read/create,
  invitation resolution, member and request pages, draft read/save/stale/export,
  `/mods`, `/packs/resolve` and `/packs/export` archive hash.

Independent read-only verification, delegated, external scratch, 2026-11-12:

- First round reproduced one change-caused blocker: C1 controls (U+0080–U+009F) passed
  the HTTP boundary but SQL rejected them, so the response was 502 instead of 400. The
  same round confirmed S1–S4 and S6 met, S5 met apart from that blocker, and recorded
  an unmapped astral-length read path plus an ignored export body as advisories.
- Correction batch: the publication label validator now mirrors the established group
  name contract (Unicode trim, C0/C1 and U+FEFF rejection, code-point length for
  reads), the export route rejects any body, and regression tests were added.
- Narrow recheck of the corrected blocker: 147,492 parity attempts across U+0001–U+2FFF
  produced only 201/400 with zero 5xx and no SQL write on rejection; astral publish,
  list and detail returned 201/200/200; the export body guard returned 400 in process.
  The recheck then reported a new blocker: publish accepted metadata that the shared
  export contract rejects because the two boundaries measured lengths differently.
- Second correction, local evidence only: publish now applies the existing export
  length contract while reads still accept schema-valid stored values, with tests for
  both sides. The verification bound was reached, so no third independent round ran.

Not run: actual pgTAP (`bun run db:test` needs a local stack), the Docker-dependent
upgrade runner, hosted project proof, true multi-connection concurrency, a real signed
Clerk→Hono→PostgREST request and native candidate review. PGlite is single-connection,
so the group-lock ordering argument is structural, not raced.

## Delivery state

Implementation, tests and documentation are complete on `feat/published-versions`.
The implementation, migration and both test suites are commit `51e7a03`; this record
and the documentation updates are the branch tip commit that contains it. No pull
request, merge, hosted application or deployment is recorded; those remain separate
decisions.

## Remaining work

- Actual pgTAP execution, the Docker-dependent upgrade runner and a signed end-to-end
  request through Clerk, Hono and PostgREST remain unavailable here.
- True concurrent publication and activation races, and hosted proof, need a real
  database stack and separate authorization.
- Native candidate review and publication are pending decisions, not authorization.
- Inherited advisories from earlier milestones are unchanged and not re-claimed here.
- Next action is tracked in the [current handoff](../handoff.md).

## References

- [Publication guide](../guides/pack-publications.md)
- [API reference: published pack versions](../reference/backend-api.md#published-pack-versions)
- [Decision baseline](../decisions/0001-project-baseline.md)
- [Publication tasks](../../odd/tasks/published-versions.md)
- [doc04: Persisted pack drafts](doc04-pack-drafts.md)
- [doc02: Groups and permissions](doc02-groups-permissions.md)
