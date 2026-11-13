# Project documentation

Choose a document by the question you need to answer. Decisions explain why;
they are not a substitute for usage instructions, API contracts, or architecture.

To run the project, start with the [root README](../README.md). To resume
development, read the [current handoff](handoff.md), then the relevant milestone
in the [backend roadmap](plans/backend-roadmap.md). To see what a completed
delivery changed, use the [numbered delivery records](delivery/README.md).

## Documentation map

| Type | Purpose | Current documents |
| --- | --- | --- |
| Guides | Complete a task step by step | [Create and download a modpack](guides/create-modpack.md); [Local database](guides/local-database.md); [Local identity](guides/local-identity.md); [Local account access](guides/local-account-access.md); [Account profiles](guides/account-profiles.md); [Groups and permissions](guides/groups.md); [Persisted pack drafts](guides/pack-drafts.md); [Voting on a mod addition](guides/voting.md); [GitHub contribution workflow](guides/github-workflow.md) |
| Reference | Look up contracts, parameters, errors, and limits | [Backend API](reference/backend-api.md) |
| Architecture | Understand components, boundaries, and data flow | [Stateless Modrinth backend](architecture/modrinth-backend.md) |
| Decisions | Understand accepted choices and their trade-offs | [Initial scope and stack](decisions/0001-project-baseline.md); [Clerk identity](decisions/0002-clerk-identity.md); [Clerk profile ownership](decisions/0003-clerk-profile-ownership.md) |
| Plans | Follow approved outcomes, sequence, acceptance criteria, and pending decisions | [Backend roadmap](plans/backend-roadmap.md) |
| Handoff | Resume from the latest verified state and next action | [Current checkpoint](handoff.md) |
| Delivery records | Read what changed, why, what was checked, and what remained at that time | [Numbered deliveries](delivery/README.md) |
| Templates | Use a consistent structure for recurring records | [Decision template](templates/decision.md); [Plan template](templates/plan.md); [Delivery template](templates/delivery.md) |

Keep local setup commands in the [root README](../README.md). Add new documents
under the relevant directory and link them here. Do not create empty documents
just to fill a category. An accepted decision is not evidence of implementation.

## Keep each fact in one place

- Guides own current task instructions and expected results.
- Reference owns API contracts; architecture owns component boundaries and flows.
- Decisions own accepted choices and their rationale, not the live delivery state.
- Plans own intended scope, acceptance criteria and sequence.
- The handoff owns the latest verified checkpoint, blockers and next action.
- Delivery records own dated outcomes and evidence for a completed work unit.

Never quote the project owner. Record each approved decision as neutral prose with
its date and scope, and separate decisions from proposals or agent suggestions.
This applies to every document here and in `odd/tasks/`; do not reintroduce
quotations, option labels or "verbatim" attributions.

Link the owning document instead of copying its changing details. A milestone may
summarize progress, but should link the handoff for environment and delivery state
rather than repeat review counts, PR status or workstation observations.

## Maintain continuity

Record new plans under `docs/plans/`. Mark approval explicitly, keep proposed
ideas separate, and update only affected milestones when the user changes scope.
At a delivery or interruption, replace the current handoff with the latest
verified snapshot, pending work and exact next action. Link detailed evidence
rather than appending session transcripts. Keep earlier evidence in its existing
feature log or a dated historical record before removing it from the handoff.

For a completed coherent change, add one numbered delivery record using the
[delivery convention](delivery/README.md) and [template](templates/delivery.md).
Update the relevant guide or reference with current behavior; the delivery record
links those instructions rather than duplicating them. An interrupted session
updates the handoff, not a new delivery number.

The [handoff history through 2026-11-12](handoff-history-2026-11-12.md) preserves
the earlier checkpoint and workstation reports. It is historical evidence, not
the startup or resume instructions for the current session. Earlier work is not
being retroactively converted into numbered deliveries.

## Record a decision

1. Copy the [decision template](templates/decision.md) into `docs/decisions/`.
2. Name it `NNNN-short-description.md`, using the next unused number.
3. Record the context, actual choice, trade-offs, source, and unresolved points.
4. Keep it `Proposed` until the decision owner confirms it; link it below.

Use this format for product, architecture, operations, or workflow decisions.
Do not create a document for every implementation detail. Related choices can
share one record, as in the initial baseline.

When a choice changes, preserve the previous decision and its rationale. Mark
the affected record or section as superseded and link the replacement. A
proposal, recommendation, or open question must not become an accepted rule
without confirmation. Never store credentials or private invitation links here.

## Decision index

| Record | Status | Scope |
| --- | --- | --- |
| [0001: Initial scope and stack](decisions/0001-project-baseline.md) | Accepted | Product, architecture, budget, and initial delivery |
| [0002: Clerk identity](decisions/0002-clerk-identity.md) | Accepted; verified locally | Clerk-only application authentication |
| [0003: Clerk profile ownership](decisions/0003-clerk-profile-ownership.md) | Accepted; verified locally | Direct Clerk subjects and retained legacy profile rows |

## Implementation evidence

Keep the quick startup path in the [root README](../README.md) and detailed task
instructions in guides. Record observed tests, builds, migrations and delivery
outcomes in the relevant delivery record; existing feature logs remain evidence
for earlier work. Decisions link evidence when needed instead of becoming test
journals. Keep accepted, implemented, verified, committed, published, merged and
deployed states distinct. Include the date and environment of observations;
previous success is not a fresh check.
