# Smaller Clerk publication boundaries

Status: Local reconstruction and independent verification complete; publication pending.
Source: "no se pueden hacer mas chicos?" and "Go ahead with the plan."
Current checkpoint: [publication tasks](../../odd/tasks/clerk-publication-slices.md).

## Outcome and boundaries

Retain the verified Clerk integration while producing coherent child PRs of at
most 400 authored changed lines. Preserve current branches and reconstruct new
publication branches. No code compression, omitted tests or history rewrites.

## Milestones

| Milestone | Acceptance criteria | State |
| --- | --- | --- |
| API boundaries | Accepted decision precedes API; API keeps tests, configuration and reference together; operator guides remain a separate useful deliverable. | Implemented and verified. |
| Final regressions | Workspace security/public/control regressions and CI separate from disposable SQL upgrade behavior, with final continuity afterward. | Implemented and verified. |
| Verification | Per-parent counts and ancestry, exact application/migration/lock fidelity, local checks/build/upgrade and relative documentation links. | Passed; one intermediate-link defect corrected and independently rechecked. |

## Dependencies and open decisions

Use the existing feature-branch-chain tracker and first four review children.
Native review evidence belongs to its original candidate; new boundaries do not
inherit a new native approval. Hosted CI and configured provider flows remain
unverified. Publication must use the explicitly authorized repository/session;
merge, deployment and external provider setup remain out of scope.

## Next action

Confirm the GitHub session for publication, then inspect remote state and publish
the selected tracker/children without force-push or merge. Existing remote PR16
must not be silently modified or duplicated.

## Change log

- 2026-11-10: Approved finer slicing instead of accepting size exceptions.

## Verified publication boundaries

Each child targets the immediately preceding branch. The tracker is
`feat/clerk-review` (draft/no-merge). First-attempt `feat/clerk-publish-*` branches
are retained locally for audit only; do not publish them.

| Position | Branch | Changed lines |
| --- | --- | --- |
| 1 | `feat/clerk-review-01-db` | 137 |
| 2 | `feat/clerk-review-02-db-api` | 78 |
| 3 | `feat/clerk-review-03a-retire-recovery` | 317 |
| 4 | `feat/clerk-review-03b-retire-credentials` | 335 |
| 5 | `feat/clerk-chain-04a-decisions` | 84 |
| 6 | `feat/clerk-chain-04b-api` | 400 |
| 7 | `feat/clerk-chain-04c-api-guides` | 316 |
| 8 | `feat/clerk-chain-05-web-accounts` | 112 |
| 9 | `feat/clerk-chain-06-web-identity` | 207 |
| 10 | `feat/clerk-chain-07a-workspace-regression` | 288 |
| 11 | `feat/clerk-chain-07b-profile-upgrade` | 170 |
| 12 | `feat/clerk-chain-07c-continuity` | 277 |

The final continuity child may add a few passive closure lines; its final count
must still be checked before publication. All other counts are frozen commits.
The final application, migrations, scripts, tests, dependency lock and workflow
match `990444f` byte-for-byte and mode-for-mode. Only bookkeeping documentation
advances. Original reviews remain historical evidence, not newly issued approvals.

- 2026-11-10: All boundaries and local checks verified; no size exceptions needed.
