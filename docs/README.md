# Project documentation

Choose a document by the question you need to answer. Decisions explain why;
they are not a substitute for usage instructions, API contracts, or architecture.

To resume work, start with the [current handoff](handoff.md), then the relevant
milestone in the [backend roadmap](plans/backend-roadmap.md). Read historical
feature logs only when the current task needs their evidence.

## Documentation map

| Type | Purpose | Current documents |
| --- | --- | --- |
| Guides | Complete a task step by step | [Create and download a modpack](guides/create-modpack.md); [Local database](guides/local-database.md); [Local identity](guides/local-identity.md); [Local account access](guides/local-account-access.md); [Account profiles](guides/account-profiles.md); [GitHub contribution workflow](guides/github-workflow.md) |
| Reference | Look up contracts, parameters, errors, and limits | [Backend API](reference/backend-api.md) |
| Architecture | Understand components, boundaries, and data flow | [Stateless Modrinth backend](architecture/modrinth-backend.md) |
| Decisions | Understand accepted choices and their trade-offs | [Initial scope and stack](decisions/0001-project-baseline.md); [Clerk identity](decisions/0002-clerk-identity.md); [Clerk profile ownership](decisions/0003-clerk-profile-ownership.md) |
| Plans | Follow approved outcomes, sequence, acceptance criteria, and pending decisions | [Backend roadmap](plans/backend-roadmap.md) |
| Handoff | Resume from the latest verified state and next action | [Current checkpoint](handoff.md) |
| Templates | Use a consistent structure for recurring records | [Decision template](templates/decision.md); [Plan template](templates/plan.md) |

Keep local setup commands in the [root README](../README.md). Add new documents
under the relevant directory and link them here. Do not create empty documents
just to fill a category. An accepted decision is not evidence of implementation.

## Maintain continuity

Record new plans under `docs/plans/`. Mark approval explicitly, keep proposed
ideas separate, and update only affected milestones when the user changes scope.
At a delivery or interruption, update `docs/handoff.md` with the verified snapshot,
pending work, and next action. Link detailed evidence rather than copying logs.

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

Keep commands and setup instructions in the [root README](../README.md).
Record tests, builds, migrations, or release evidence in the relevant decision
only when observed. Keep `Accepted`, `Implemented`, and `Verified` distinct.
