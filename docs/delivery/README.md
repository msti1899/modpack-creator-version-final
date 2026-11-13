# Delivery records

Read these records to understand what a completed work unit changed, why it
changed, what was actually checked and what remained open at that time.

Numbering starts with the documentation reorganization on 2026-11-12, not with
the first project implementation. Earlier work stays in the
[historical handoff](../handoff-history-2026-11-12.md) and existing feature logs.
For the latest state and next action, use the [current handoff](../handoff.md).

## Index

| Record | Date | Outcome |
| --- | --- | --- |
| [doc01: Documentation reorganization](doc01-documentation-reorganization.md) | 2026-11-12 | Start numbered records, clarify document ownership, and separate the current checkpoint from historical reports. |
| [doc02: Groups and permissions](doc02-groups-permissions.md) | 2026-11-12 | Implement group admission and permissions, record real database race checks and HTTP verification, and distinguish pending pgTAP, session and review proof. |
| [doc03: Remove owner quotations](doc03-owner-quote-removal.md) | 2026-11-12 | Replace quotations of the owner's messages with neutral decision summaries and forbid them in future documentation. |
| [doc04: Persisted pack drafts](doc04-pack-drafts.md) | 2026-11-12 | Persist one exact approved draft per group with owner-only saves, compatible Minecraft/loader changes, and verified hosted PostgreSQL proof. |
| [doc05: Published versions and sharing](doc05-published-versions.md) | 2026-11-12 | Publish immutable pack versions with owner-selected activation and member-only sharing, reusing the existing `.mrpack` export. |
| [doc06: Group voting](doc06-voting.md) | 2026-11-12 | Add owner-created mod-addition votes with a frozen electorate, absolute majority, early approval, cancellation and binding owner incorporation without publication. |

## Add the next record

1. Finish one coherent work unit, including its applicable checks. Several
   sessions may contribute to one unit; an interruption belongs in the handoff.
2. Copy the [delivery template](../templates/delivery.md). Use the next unused
   number and a descriptive kebab-case topic: `doc02-short-topic.md`. Continue
   with `doc100` after `doc99`; keep existing identifiers and links stable.
3. Record only observed outcomes. Name the verification date and environment;
   distinguish historical evidence, fresh checks, blockers and skipped checks.
   Keep implementation, review, commit, publication, merge and deployment separate.
4. Link the current guides/contracts and any relevant decisions or commits.
   Never include credentials, private receipts or machine-specific review tokens.
5. Add an index entry and refresh the current handoff. Update the roadmap only
   when its affected milestone changes; preserve the accepted scope.

Treat completed records as dated evidence, not living instructions. Correct a
factual error with a dated correction; later work gets a new record with links
to its predecessor. Do not renumber or rewrite old outcomes to match newer ones.
