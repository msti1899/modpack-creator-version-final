# Project documentation

Start with the [current decision baseline](decisions/0001-project-baseline.md).
It records the product and technical choices agreed before implementation.
An accepted decision is not evidence that its behavior has been implemented.

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
