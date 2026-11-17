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
| [doc13: Voting obligations and lifecycle](doc13-voting-obligations.md) | 2026-11-13 | Decide that binding is an owner obligation that blocks nothing, discharge an already-satisfied approved addition without rewriting the draft, and pin the conflict, transfer and concurrency behaviour on the pgTAP, HTTP, signed-token PostgREST, race and hosted live surfaces. |
| [doc14: Clerk middleware proxy loop](doc14-clerk-proxy-loop.md) | 2026-11-14 | Diagnose the same-URL rewrite that made every routed response answer 500 after the 30 s proxy timeout when the bind host and the request host differ, fix it in the proxy wrapper, and pin the header-preserving conversion. |
| [doc15: Web tooling and sign-in screen](doc15-web-tooling-signin.md) | 2026-11-14 | Publish the frontend stack, the two-runner test harness, the approved palette and the dedicated sign-in screen as four independent slices, and record the CI and authenticated-journey gaps. |
| [doc16: Account deletion and retention](doc16-account-deletion.md) | 2026-11-14 | Decide the deletion scope and retention rules, delete the caller's own account through `DELETE /profile` while a surviving group keeps its votes, electorates, ballots, invitations and decisions, and record the provider-reconciliation gap. |
| [doc17: Provider-side account deletion reconciliation](doc17-account-reconciliation.md) | 2026-11-14 | Decide and implement the verified Clerk `user.deleted` path: the provider event deletes the application account, a group whose owner can no longer act passes to its longest-standing member, and every missing input fails closed. |
| [doc18: Mod browser screen](doc18-mod-browser.md) | 2026-11-14 | Implement the approved catalog-ledger direction as `/mods`: a proxied Modrinth search with facets, paging, selection, light and dark themes, verified against the frozen mockup, with pack wiring and publication still open. |
| [doc19: Web-to-API transport guide](doc19-web-api-transport.md) | 2026-11-15 | Document the transport the web app already uses: two server-only handlers, the five-second deadline and byte-capped reads they share, and the reads-only shape that leaves browser mutations without a path. |
| [doc20: Dedicated CI step for the web suites](doc20-ci-web-suites.md) | 2026-11-16 | Run the Vitest suites in their own workflow step and remove the Bun bridge test that spawned the same command, so each runner executes once and a component failure names its step. |
| [doc21: Frontend CI workflow and the web linter](doc21-ci-frontend-workflow.md) | 2026-11-16 | Split the gate into a frontend workflow that owns `apps/web` and a backend workflow scoped to the API, add Playwright with axe on every pull request and Lighthouse on `main`, and introduce the first repository linter with documented suppressions instead of a reformat. |
| [doc22: Minecraft release selector data](doc22-minecraft-versions.md) | 2026-11-16 | Serve the Minecraft release list the web must read instead of a hardcoded version, releases only and newest first, with one shared process cache, stale serving after a failed refresh and no silent empty list. |
| [doc23: Per-project versions for the mod picker](doc23-project-versions.md) | 2026-11-16 | Serve one mod's versions that support a chosen Minecraft version and loader, newest first and capped, pass the release type through so a caller can mark prereleases, and keep an unknown project a 404 rather than an empty list. |
| [doc24: Loader builds for export and publication](doc24-loader-builds.md) | 2026-11-16 | Discover the loader build a pack must declare from each loader's own metadata, with a recorded per-loader mapping, a null recommendation when nothing is stable, one cached entry per pair and manual entry still valid. |
| [doc25: Trustworthy database and integration CI](doc25-database-ci.md) | 2026-11-16 | Run the pgTAP, concurrency and PostgREST suites in CI against a disposable stack, fail a race that never overlapped, give every fixture a per-run token, fail on cleanup leftovers, and report one TAP result per check in the three suites that reported one per file. |
| [doc26: Group summary for link-only discovery](doc26-group-summary.md) | 2026-11-16 | Add a public-safe group summary by identifier for the link-only join screen, keep private groups invisible to outsiders and never expose the member list. |

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
