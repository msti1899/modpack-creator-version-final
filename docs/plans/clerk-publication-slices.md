# Smaller Clerk publication boundaries

Status: Published as draft tracker PR17 and children PR18–PR29; no merge or deployment.
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

Review [tracker PR17](https://github.com/msti1899/modpack-creator-version-final/pull/17)
and its ordered children. Check hosted CI independently before any separately
authorized integration/merge. Original PR16 remains open and untouched.

## Change log

- 2026-11-10: Approved finer slicing instead of accepting size exceptions.

## Verified publication boundaries

Each child targets the immediately preceding branch. The tracker is
`feat/clerk-review` (draft/no-merge). First-attempt `feat/clerk-publish-*` branches
are retained locally for audit only; do not publish them.

| Position | Branch | PR | Changed lines |
| --- | --- | --- | --- |
| 1 | `feat/clerk-review-01-db` | [#18](https://github.com/msti1899/modpack-creator-version-final/pull/18) | 137 |
| 2 | `feat/clerk-review-02-db-api` | [#19](https://github.com/msti1899/modpack-creator-version-final/pull/19) | 78 |
| 3 | `feat/clerk-review-03a-retire-recovery` | [#20](https://github.com/msti1899/modpack-creator-version-final/pull/20) | 317 |
| 4 | `feat/clerk-review-03b-retire-credentials` | [#21](https://github.com/msti1899/modpack-creator-version-final/pull/21) | 335 |
| 5 | `feat/clerk-chain-04a-decisions` | [#22](https://github.com/msti1899/modpack-creator-version-final/pull/22) | 84 |
| 6 | `feat/clerk-chain-04b-api` | [#23](https://github.com/msti1899/modpack-creator-version-final/pull/23) | 400 |
| 7 | `feat/clerk-chain-04c-api-guides` | [#24](https://github.com/msti1899/modpack-creator-version-final/pull/24) | 316 |
| 8 | `feat/clerk-chain-05-web-accounts` | [#25](https://github.com/msti1899/modpack-creator-version-final/pull/25) | 112 |
| 9 | `feat/clerk-chain-06-web-identity` | [#26](https://github.com/msti1899/modpack-creator-version-final/pull/26) | 207 |
| 10 | `feat/clerk-chain-07a-workspace-regression` | [#27](https://github.com/msti1899/modpack-creator-version-final/pull/27) | 288 |
| 11 | `feat/clerk-chain-07b-profile-upgrade` | [#28](https://github.com/msti1899/modpack-creator-version-final/pull/28) | 170 |
| 12 | `feat/clerk-chain-07c-continuity` | [#29](https://github.com/msti1899/modpack-creator-version-final/pull/29) | 290 |

The final continuity child may add a few passive closure lines; its final count
must still be checked before publication. All other counts are frozen commits.
The final application, migrations, scripts, tests, dependency lock and workflow
match `990444f` byte-for-byte and mode-for-mode. Only bookkeeping documentation
advances. Original reviews remain historical evidence, not newly issued approvals.

- 2026-11-10: All boundaries and local checks verified; no size exceptions needed.

- 2026-11-10: Published tracker PR17 (draft) and children PR18–PR29 using the explicitly authorized GitHub CLI session/origin credentials. GitHub bases and counts confirmed; no force-push, merge, remote settings changes or deployment. Hosted CI started; terminal success is not claimed.
