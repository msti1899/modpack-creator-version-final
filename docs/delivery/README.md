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
| [doc07: Local database proof](doc07-local-database-proof.md) | 2026-11-12 | Run actual pgTAP, the upgrade regression, real multi-session races and signed-token PostgREST checks on a real local stack, and record what they still cannot prove. |
| [doc08: Account and session runtime proof](doc08-account-session-proof.md) | 2026-11-13 | Prove a real Clerk email/password session against `/me` and `/profile`, exercise the app's own sign-in and sign-out controls in a browser, pin the environment-driven configuration and session-lookup failure branches, and withdraw an earlier defect report that came from a blocked dev origin. |
| [doc09: Catalog discovery contract](doc09-catalog-discovery.md) | 2026-11-13 | Reject unknown search parameters, add sort/category/environment/author filters, add exact project lookup, and enrich the result payload; record pinning evidence and a measured page size. |
| [doc10: Group lifecycle and access proof](doc10-groups-lifecycle-proof.md) | 2026-11-13 | Pin request-page cursors, page clamping and invalidated tokens in pgTAP, and exercise the whole group lifecycle with signed tokens on the local PostgREST surface, including immediate role changes and both departure paths. |
| [doc11: Pack assembly and dependency approval](doc11-pack-assembly.md) | 2026-11-13 | Name every proposed mod and dependency in pack resolution, and pin the approve, cancel, removal, settings-change and atomic-rejection journey without adding an endpoint or a migration. |
| [doc12: Published versions and sharing](doc12-published-sharing.md) | 2026-11-13 | Pin the member-only read and export contract, the unavailable-upstream export mapping and the immutability of frozen selections across draft edits, on the HTTP, pgTAP and signed-token PostgREST surfaces, and add the hosted live check that awaits authorization. |

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
