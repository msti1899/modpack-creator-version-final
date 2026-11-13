# Published pack versions and sharing

Branch: `feat/published-versions`, based on `main` at `d5d3c40` (milestones 3 and 4
merged). Delivery: ask-on-risk. Forecast: 900–1000 authored changed lines.
Runners: `bun test apps/api/tests/pack-publications.test.ts`, `bun run check`, and
`bun run db:test` when a local Supabase stack is available.

## Specs

- S1: Approved roadmap milestone 5: "Preserve earlier publications, explicit
  active-version selection by the owner, and links respecting access rules.
  Publishing does not automatically activate a version."
- S2: Existing D6: "The owner prepares changes and explicitly publishes pack
  versions." "Preserve previous published versions." "The owner chooses the active
  version independently of the latest publication. Publishing a new version does
  not automatically activate it."
- S3: Decision of 2026-11-12: only current members of the group may read or export
  a published version. A share link carries no authority by itself; a caller
  outside the group receives no publication data. Group admission is unchanged, so
  joining a public group stays direct and a private group still requires owner
  approval.
- S4: Existing D3/D5: "Initially, each group has one modpack and an owner." "Only
  the owner edits the group's modpack." "If the owner is the only member and
  leaves, delete the group and its modpack rather than archiving them." Ownership
  transfer moves publication rights immediately.
- S5: Existing export contract: exact approved Modrinth version IDs, validated
  metadata, `.mrpack` attachment. A publication freezes the presentation metadata
  supplied by the owner, so an already published artifact stays reproducible.
- S6: Roadmap boundaries: "Frontend, CD, CurseForge, multiple groups per user,
  multiple packs per group, and the desktop launcher remain outside this roadmap's
  current scope." Publication of the branch, merge and deployment remain separate
  user decisions; hosted work needs separate authorization.

Implementation choices (not additional product requirements): publications are
immutable snapshots in their own table with a per-group increasing sequence; one
active publication per group is enforced by a partial unique index; the list is
keyset-paginated (maximum 50) instead of embedding an unbounded collection; publish
reuses the existing catalog validation against the caller's current draft revision
and returns a conflict for a stale draft; activation is a separate owner action;
publication export uses the frozen metadata and accepts no overrides.

## Tasks

- T1 [S1-S5] Implement and test the vertical publication slice: migration and
  RPCs, HTTP publish/list/detail/activate/export routes, SQL and API regression
  tests. Route: inline; one dependent behavior, no writer trigger. Status: complete
  locally (17 focused tests / 365 assertions; 103 tests / 2075 assertions for the
  full check; eight migrations plus both database suites pass on PGlite 0.5.16; 16
  differential scenarios identical to `main`). Risk: items 1, 2, 3 and 4 (new
  persisted format, permissions, shared export contract, activation ordering).
  Commit: `51e7a03`; PR #49, Backend checks passing.
- T2 [S1-S6] Update guide, reference, decision baseline, roadmap, delivery record,
  indexes and handoff; preserve milestone 3 and 4 evidence. Route: inline.
  Status: complete. Commit: documentation commits on the same branch, published in PR #49.
- T3 [S1-S5] Independent read-only verification of this high-risk slice after its
  own checks, including differential public endpoint output and rejected-write
  state probes. Route: delegated verification for named items 1/2/3/4.
  Status: two rounds ran in external scratch. Round one confirmed S1-S4 and S6 met
  and S5 met apart from one reproduced input-parity blocker (C1 controls answered
  502 instead of 400). The recheck of that correction confirmed the fix with 147,492
  parity attempts and no 5xx, then reported one new blocker: publish accepted
  metadata the shared export contract rejects. That was corrected locally with the
  verification bound already reached, so no third round ran. Commit: none.
- T4 [S1-S6] Native candidate review under its own consent when due. Route:
  per-action worker. Status: pending. Commit: none.

## Log

- L1: 2026-11-12: Milestone 5 was resumed on its own branch cut from `main`, which
  already contains the merged milestone 3 and 4 deliveries. Scope came from the
  approved roadmap row and the existing decision baseline.
- L2: 2026-11-12: Approved decision: only current group members may read or export
  a published version; possession of a share link grants no access. Recorded under
  D6 in the decision baseline and used as S3.
- L3: The previous handoff was stale about milestones 3 and 4: both were already
  merged in `main` at `d5d3c40`. The checkpoint is corrected in this delivery and no
  earlier evidence is re-claimed as new proof.
- L4: RED observed before implementation: 11 of 12 new publication HTTP tests failed
  with 404 because the routes did not exist. GREEN: 12 tests / 307 assertions, and
  the migration plus native SQL assertions passed on the isolated PGlite harness.
- L5: The first verification round reproduced one change-caused blocker: the C1
  control range passed the HTTP boundary but SQL rejected it, so the response was an
  unmapped 502 instead of 400. The same round recorded advisories for a UTF-16 read
  length, an ignored export body and the missing delivery record.
- L6: Correction batch: the label validator now mirrors the established group-name
  contract, the export route rejects any body, and regression tests cover C1
  rejection, the astral read boundary, astral publish length and exactly-full
  pagination. Full check rose to 100 tests / 2042 assertions.
- L7: The narrow recheck confirmed the blocker resolved: 147,492 parity attempts
  across U+0001-U+2FFF produced only 201/400 with no 5xx and no write on rejection.
  It then reported a new blocker: publish accepted names and versions the shared
  `.mrpack` export contract rejects, because the two boundaries measured length
  differently.
- L8: Second correction, local evidence only: publish applies the existing export
  length contract while reads accept every value the database permits. Focused suite
  reached 17 tests / 365 assertions, full check 103 tests / 2075 assertions, the SQL
  suites still pass, and the differential stayed identical. The verification bound
  was reached, so no third independent round ran.
- L9: Still unproven: actual pgTAP, the Docker-dependent upgrade runner, hosted
  application, true multi-connection publication/activation races, a signed
  Clerk-to-Hono-to-PostgREST request and native candidate review. PGlite is
  single-connection, so lock ordering is argued structurally, not raced.
