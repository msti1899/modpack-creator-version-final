# doc03: Remove owner quotations from documentation

Date: 2026-11-12
Scope: Documentation only. Replace quotations of the project owner's messages and
selected options with neutral summaries, and record the rule that prevents them
from returning.
Baseline: `origin/main` at `30ead7dbc22a201d77061ab99f296e7193375540`.

## Objective

The owner does not want their messages quoted in project documentation. The
documented decisions must remain accurate and traceable without reproducing the
owner's words, questions or option labels.

## Changes and rationale

- Rewrote every owner attribution in tracked documentation as a dated, neutral
  decision statement, preserving the decision itself and the scope it approved.
- Removed the `verbatim` attributions that treated selected questionnaire options
  as quotations.
- Added the rule to [AGENTS.md](../../AGENTS.md) and the
  [documentation map](../README.md): record decisions as prose, never quote the
  owner, and separate a confirmed decision from a proposal or agent suggestion.
- Updated the [decision](../templates/decision.md), [plan](../templates/plan.md)
  and [delivery](../templates/delivery.md) templates so new records do not invite
  quotations.

Technical strings such as JSON payloads, SQL fragments, claim names and commands
remain quoted because they are interface data, not owner statements.

## Verification

Environment: local repository documentation, 2026-11-12.

- A repository-wide scan of `docs/`, `odd/tasks/`, `README.md` and `AGENTS.md`
  found no remaining owner quotations and no remaining `verbatim` attributions,
  apart from the two rule sentences that forbid them.
- Local link and heading checks pass for every changed file.
- Git whitespace checks pass. No application, configuration, dependency,
  credential or database content changed, so no application test or build applies.
- Documentation that was still uncommitted in other sessions was outside this
  branch; those files must follow the same rule before they are published.

## Delivery state

Documentation: complete in this branch.
Commit/publication/merge/deployment: branch `docs/remove-owner-quotes`; see the
pull request for review and CI evidence. No deployment is authorized.

## Remaining work

Apply the same rule to any documentation that lands after this change, including
work in progress in other sessions. Future delivery records start at `doc04`.

## References

- [Documentation map and rules](../README.md)
- [Project continuity rules](../../AGENTS.md)
- [Decision template](../templates/decision.md)
