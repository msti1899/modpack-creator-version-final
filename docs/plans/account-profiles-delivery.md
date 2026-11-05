# Account profiles delivery chain

Status: In progress.
Source: Approved backend continuation and the user's feature-branch-chain choice;
publication authorized on 2026-11-05 with "commit push y pr".
Current checkpoint: [backend handoff](../handoff.md).

## Outcome and boundaries

Deliver local username profiles in two reviewable slices without changing `/me`
or public Modrinth behavior. No frontend, external provider setup, deployment,
or automatic merge is included.

## Milestones

| Milestone | Acceptance criteria | Implementation / verification / delivery |
| --- | --- | --- |
| Database slice | Ownership isolation, case-insensitive uniqueness and server-enforced rename rules | Implemented at `86e168a`; local and independent checks passed; native review approved without findings. Publish the child PR against this tracker. |
| HTTP slice | Authenticated own-profile read/write; unchanged existing routes | Pending implementation on a child of the database branch. |
| Integration | Both slices checked and explicitly approved for integration | Keep tracker draft/no-merge until the chain is complete. No merge authorized. |

## Dependencies and open decisions

`main` → `feat/account-profiles` (tracker) → `feat/account-profiles-db` → future HTTP slice.
The tracker initially contains this plan only, not the database implementation.
Child PRs stay below 400 authored changed lines; do not trim tests to fit.

## Next action

Open the database child PR against `feat/account-profiles`. Then implement the
HTTP slice with tests and documentation on its dependent branch.

## Change log

- 2026-11-05: Created the draft integration tracker for the approved two-slice
  chain. Publishing is authorized; deployment and merging remain separate decisions.
