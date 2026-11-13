# Current handoff

Checkpoint: 2026-11-12. `main` at `d5d3c40` already contains milestone 3 (PR #45,
merged as `b648c21`) and milestone 4 (PR #46, merged as `2ae50e7`). Milestone 5 is
implemented, tested and documented on `feat/published-versions`, cut from `d5d3c40`
and committed as `51e7a03` plus the documentation commit containing this file. Verify
the branch and HEAD before resuming; documentation commits do not change the
application baseline. This is a resume point, not a session history.

## Current work

Milestone 5 (published versions and sharing) is complete locally: one publication per
publish action, immutable snapshots, a per-group sequence, an owner-selected active
version that publishing never changes, member-only reads and exports, and a frozen
`.mrpack` export. An approved decision restricts reads and exports to current group
members, so a share link carries no authority by itself. See the
[publication guide](guides/pack-publications.md),
[API reference](reference/backend-api.md#published-pack-versions),
[doc05](delivery/doc05-published-versions.md) and
[publication tasks](../odd/tasks/published-versions.md).

Milestone 3 and 4 evidence stays in [doc02](delivery/doc02-groups-permissions.md) and
[doc04](delivery/doc04-pack-drafts.md); it is not restated here.

## Proof for this checkpoint

- RED observed: 11 of 12 new publication HTTP tests failed with 404 before the routes
  existed. GREEN: 17 focused tests / 365 assertions.
- `bun run check`: 103 tests / 2075 assertions, both application typechecks exit 0.
- All eight migrations applied in order on PGlite 0.5.16 in isolated external scratch,
  with the checked-in publication suite passing and the draft suite re-passing on the
  same run. This is supplemental evidence, not a pgTAP execution.
- Differential against `main` at `d5d3c40`: 16 scenarios identical in status, headers
  and body, including public `/mods`, `/packs/resolve` and `/packs/export` archive hash.
- Independent read-only verification ran twice in external scratch. The first round
  reproduced one input-parity blocker (C1 controls answered 502 instead of 400); the
  narrow recheck confirmed that fix with 147,492 parity attempts and no 5xx, then
  reported that publish accepted metadata the shared export contract rejects. The
  second correction applied the export length contract to publish input and was
  verified locally only, because the correction bound was already reached.

## Missing proof

Actual pgTAP (`bun run db:test` needs a local stack), the Docker-dependent upgrade
runner, hosted project application, true multi-connection publication and activation
races, a signed Clerk→Hono→PostgREST request, and native candidate review. PGlite is
single-connection, so group-lock ordering is argued structurally, not raced. Inherited
advisories from milestones 3 and 4 remain open and are not re-claimed as current proof.

## Delivery state

Branch `feat/published-versions` is pushed and published in [PR #49](https://github.com/msti1899/modpack-creator-version-final/pull/49) with the
Backend checks job passing in 39 seconds. No merge, hosted change or deployment is
recorded. Applying the publication migration to the selected test project and merging
the pull request remain separate decisions.

## Resume

1. Verify the branch, commit and local changes against this snapshot. Preserve
   unrelated untracked work: `.agents/`, `.atl/`, `apps/web/AGENTS.md`,
   `skills-lock.json`, and the separate `feat/voting` worktree, which this checkpoint
   did not inspect.
2. For scope, read [roadmap milestone 5](plans/backend-roadmap.md#delivery-order) and
   [publication tasks](../odd/tasks/published-versions.md); milestones 3 and 4 link
   their own records.
3. Next actions, each needing its own authorization: native candidate review when due,
   a multi-connection race check on a real database stack, hosted proof on the selected
   test project, then merge.
4. Hosted Clerk → Supabase trust and the applied profile, group and draft migrations
   remain as recorded in [the hosted verification record](../odd/tasks/hosted-profile-verification.md).
   The publication migration has never been applied to a hosted project. Do not access
   ambient CLI sessions or credentials beyond explicitly authorized test projects.
5. Remaining unverified areas that need separate accounts or mailboxes are unchanged:
   full Google/Discord OAuth completion and real email delivery.

## Documentation maintenance

Use [the documentation index](README.md) to choose the owning document. Complete work
units get a [numbered delivery record](delivery/README.md); interruptions update this
checkpoint. No retrospective doc numbers are assigned to earlier work. Earlier
application and documentation evidence remains in
[the archived handoff](handoff-history-2026-11-12.md), doc01 and the feature logs.
