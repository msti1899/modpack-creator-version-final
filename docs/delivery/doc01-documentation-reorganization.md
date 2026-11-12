# doc01: Documentation reorganization

Date: 2026-11-12
Scope: Documentation organization and the first numbered delivery record; no
application, configuration, dependency or external-service changes.
Baseline: `main` at `22318bced38c3011a656ce85bb47509265800d28`.

## Objective

Make the existing documentation easier to navigate and maintain. The owner
requested numbered `doc01`, `doc02` records of completed work starting now,
without reconstructing the project's earlier history, and approved proceeding
with the documentation proposal.

This is the first record in that sequence, not the first project delivery.

## Changes and rationale

- The [root README](../../README.md) presents the application and quick startup
  path, then links detailed instructions and the current checkpoint. Duplicated
  review counts and stale integration-state prose were removed.
- The [documentation index](../README.md) assigns one owning document to each
  kind of information: instructions, contracts, architecture, decisions, future
  scope, current checkpoint and dated outcomes.
- The [current handoff](../handoff.md) is a short resume point. The complete
  previous body, including already-uncommitted workstation reports, is preserved
  in the [historical handoff](../handoff-history-2026-11-12.md) with an archive notice.
- [Roadmap milestone 2](../plans/backend-roadmap.md#delivery-order) links the
  checkpoint instead of repeating contradictory PR/publication state and review
  counts. Approved product scope and milestone acceptance were not changed.
- The [delivery index](README.md) and [template](../templates/delivery.md) make
  the next record predictable. One completed work unit gets one number; sessions
  and older project history do not receive retrospective numbers.

## Verification

Environment: local repository documentation, 2026-11-12.

- Structural readback and local-link/heading checks passed: 31 Markdown files
  scanned, 118 local links checked, zero missing targets or heading fragments.
- The archive preserves the complete pre-existing record; only its archive notice
  and one link to an unpublished guide heading changed. The checkpoint was 65 lines instead
  of the earlier 299-line history.
- SHA-256 comparisons confirmed that all five pre-existing protected files
  (including local identity instructions and generated/local metadata) were unchanged.
- All six milestone scope/acceptance cells match the pre-existing roadmap.
- `git diff --check` passed; edited/new documents have final newlines, no trailing
  whitespace and no conflict markers.
- Read-only native assessment returned `medium`, `review_due: false`, reason
  `under_budget`. Its workspace includes the pre-existing generated
  `apps/web/next-env.d.ts` change; that file was not edited by this delivery.

No meaningful runtime RED/GREEN applies to this passive documentation change.
Local application tests/builds, browsers and hosted integration probes were not
rerun; earlier application results remain historical. Publication adds separate
Backend CI and exported-tree structural checks, excluding unrelated local changes.
PR #41 passed Backend CI and merged as `89c9e32` before the second slice.
The exported second-slice snapshot passed 31 Markdown files / 119 local links,
with zero broken targets or heading fragments and no dependency on unpublished files.

## Delivery state

Documentation: complete; structural checks passed.
Review: structural documentation readback completed; no new native review receipt
or hosted integration verification is claimed.
Publication was subsequently authorized as two sequential PRs to `main`: the
historical checkpoint first, then this reorganization. The first is [PR #41](https://github.com/msti1899/modpack-creator-version-final/pull/41).
GitHub records provide the final commit, CI and merge evidence. No deployment is
authorized. Existing unrelated working-tree changes remain outside this delivery.

## Remaining work

None within this documentation delivery. Future completed work starts at `doc02`;
do not reconstruct `doc00` or earlier numbered entries.
Application profile/RLS prerequisites remain a separate permission decision in
the [current handoff](../handoff.md#resume), not work authorized by this delivery.

## References

- [Documentation index and maintenance rules](../README.md).
- [Delivery convention and index](README.md).
- [Delivery template](../templates/delivery.md).
- [Current handoff](../handoff.md).
- [Earlier feature evidence](../../odd/tasks/clerk-auth-replacement.md).
