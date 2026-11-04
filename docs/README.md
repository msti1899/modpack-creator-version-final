# Project documentation

Choose a document by the question you need to answer. Decisions explain why;
they are not a substitute for usage instructions, API contracts, or architecture.

## Documentation map

| Type | Purpose | Current documents |
| --- | --- | --- |
| Guides | Complete a task step by step | [Create and download a modpack](guides/create-modpack.md) |
| Reference | Look up contracts, parameters, errors, and limits | [Backend API](reference/backend-api.md) |
| Architecture | Understand components, boundaries, and data flow | [Stateless Modrinth backend](architecture/modrinth-backend.md) |
| Decisions | Understand accepted choices and their trade-offs | [Initial scope and stack](decisions/0001-project-baseline.md) |
| Templates | Use a consistent structure for recurring records | [Decision template](templates/decision.md) |

Keep local setup commands in the [root README](../README.md). Add new documents
under the relevant directory and link them here. Do not create empty documents
just to fill a category. An accepted decision is not evidence of implementation.

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

## Implementation evidence

Keep commands and setup instructions in the [root README](../README.md).
Record tests, builds, migrations, or release evidence in the relevant decision
only when observed. Keep `Accepted`, `Implemented`, and `Verified` distinct.
