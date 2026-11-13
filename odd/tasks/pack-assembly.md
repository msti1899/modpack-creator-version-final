# Pack assembly and dependency approval (completion plan M4)

Objective: complete the pack-assembly journey so a client can propose a mod,
inspect the newly required dependencies, accept or cancel, remove a selection,
change compatible settings and save, while every rejection leaves the stored draft
untouched. Scope comes from
[the completion plan](../../docs/plans/backend-completion.md) milestone M4, whose
rule is to reuse the resolver, the explicit-selection validation and draft
replacement instead of adding parallel interfaces.
Base: `origin/main` at `bce2fb7`. Branch: `feat/pack-assembly`.
Route: inline. Runner: Bun 1.4.4, `bun run test` (backend) and `bun run check`.
Delivery: one reviewable slice on the feature branch. Publication and merge are
separate decisions and are not authorized.

## Specs

- S1: `POST /packs/resolve` keeps its existing contract for every request that is
  valid today: the same deterministic `versions` order, the same
  `addedDependencies` set, and the same status/error behavior. The change is
  additive only.
- S2: Every entry of `versions` additionally carries `projectTitle`, the trimmed
  Modrinth project title of that version's project, limited to 300 characters with
  no control characters. A proposal can therefore be inspected by project title and
  version number without further catalog calls. An upstream title that is absent,
  empty, oversized or contains control characters returns 502
  `Modrinth returned an invalid project title.` rather than a partially enriched
  proposal.
- S3: A proposal that the caller does not accept stores nothing. `GET
  /groups/me/pack` before and after a discarded proposal returns the same draft and
  revision, and no `save_pack_draft` RPC is issued.
- S4: Accepting a proposal sends the whole returned `versions[].id` set with the
  revision last read. The save stores exactly that selection atomically and returns
  the new revision; the stored draft contains no extra or upgraded version.
- S5: Removing a selection is the same replacement write with a shorter
  `versionIds`. A removal that leaves every required dependency of the remaining
  selection present saves; a removal that breaks a remaining mod's required
  dependency returns 409 and writes nothing.
- S6: Changing the draft's Minecraft version or loader revalidates the entire
  supplied selection. A compatible change keeps the exact approved versions and
  saves; an incompatible one returns 409 and leaves the stored draft untouched.
- S7: Every rejected write leaves the stored selection unchanged: 400 invalid input,
  403 non-owner, 409 incompatible selection or stale revision, and 502 upstream
  failure issue no `save_pack_draft` call. A stale `expectedRevision` is rejected
  before any catalog request.

Not in scope, per the recorded decision: a group-scoped proposal endpoint, a
caller-selected page size, selector data for Minecraft and loader options, an exact
version picker, silent version upgrades, and any UI. S5 and S6 are already
implemented and documented; they are pinned here, not rewritten.

## Tasks

- T1 [S1, S2] inline — complete in the first work unit. `POST /packs/resolve` now
  returns `projectTitle` per version through one validation shared with vote
  proposals; a missing, empty, oversized or control-bearing title returns 502.
  RED was observed first: both new title assertions failed with `projectTitle`
  undefined. Risk: item 3 (public API payload contract).
- T2 [S3–S7] inline — complete in the first work unit. The journey test composes the
  public resolver with the draft routes over one in-memory row and asserts the exact
  `save_pack_draft` arguments, the row hash after each rejection, the absence of
  catalog work for oversized and stale writes, and the absence of a save call for a
  rejected proposal. Those assertions passed at the baseline, so they pin existing
  behavior rather than a change.
- T3 [S1–S7] inline — in progress. The route reference and both guides are updated in
  the first work unit; the delivery record and handoff follow independent verification.
- T4 [S1–S7] delegated verifier — complete. Independent verification met S1–S7 with no
  blocker and three advisories, all taken in the correction batch: the vote path's
  title-before-version-name error precedence was restored and pinned, the journey test
  now asserts the exact save arguments and row-hash stability, and the size record was
  corrected to measured values. Environment limits left unexercised: live Modrinth,
  real PostgreSQL compare-and-swap and row lock, Docker, and the 504 timeout path.

## Log

- 2026-11-13: The owner asked for completion-plan M4 to continue in an isolated
  worktree. The slice is cut from `origin/main` at `bce2fb7`, which excludes the
  unpushed local frontend tooling commits, and it carries no SQL change. Scope and
  limits are taken from the recorded M4 decision; the existing resolver, explicit
  selection validation and draft replacement are reused as that decision requires.
- 2026-11-13: Baseline observed on the new worktree: `bun run test` passes 153 tests
  and 2655 assertions. `bun install` completed with the tracked lockfile.
- 2026-11-13: T1 and T2 implemented. RED was observed for both title assertions before
  the change. `bun run check` passes 157 tests and 2690 assertions with both
  typechecks. The additive guarantee was checked two ways: the exact resolve payload
  pin in `packs.test.ts` was updated only for the fixture titles, and the public
  regression golden was recomputed with only the `POST /packs/resolve` hash changing,
  the other nine request hashes unchanged. A 50-version closure measured 13495 bytes
  in the first measurement, which independent verification could not reproduce.
- 2026-11-13: Independent verification met S1–S7 with no blocker and reproduced the
  documented baseline and candidate counts. It observed three advisories: the vote
  path's error precedence changed when a title and a version name are malformed at
  once, the task wording overstated what the journey test asserted, and the size
  record's fixture parameters were not described. All three were taken in one
  correction batch. Re-measured with documented fixtures, a 50-version closure is
  8895 bytes with 30-character titles and names and 24095 bytes with every title at
  the 300-character ceiling; the independent measurement of 7093 and 22739 bytes used
  shorter identifiers. `bun run check` then passed 157 tests and 2699 assertions.
