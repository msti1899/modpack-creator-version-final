# Project continuity

Before starting or resuming work, read [the handoff](docs/handoff.md) and verify
its branch/commit snapshot against Git. Then read the relevant milestone in
[the backend roadmap](docs/plans/backend-roadmap.md), not every historical log.

For implementation details, follow the handoff's pointer to the relevant
`odd/tasks/` document and consult [accepted decisions](docs/decisions/0001-project-baseline.md)
when the task touches product rules or architecture.

When a plan is approved or changed, update its scope and affected milestones.
Before handing off work, update `docs/handoff.md` with verified outcomes, remaining
work, and the exact next action. Keep code, test, review, publication, and merge
states distinct; record missing evidence explicitly.

Keep new plans under `docs/plans/`, using [the plan template](docs/templates/plan.md).
Use the user's approved scope; proposals are not requirements. Keep credentials
and machine-specific review tokens out of documentation. Publication and external
service setup remain explicit user decisions. Use Gentle AI ODD roles for delegation.

Never quote the project owner's messages, questions, option labels or replies in
documentation. Record what was decided in neutral prose, with the date and the
affected scope, and distinguish an approved decision from a proposal. The same rule
applies to task logs, plans, decisions, delivery records, handoffs and agent notes.
Do not add "verbatim" quotations of the owner; describe the decision instead.
