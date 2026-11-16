# Backend completion by user journey

Status: Proposed — replaces the narrower verification-only proposal, not the approved roadmap.
Source: The owner requested a complete backend assessment and plan, including session and mod-filtering journeys (2026-11-13).
Current checkpoint: [handoff](../handoff.md). Inspected baseline: `3d5ddda` plus the previous proposal at `39c677f`.

## Outcome and boundaries

Plan a usable backend by what a person needs to do: register, sign in and out,
finish a profile, find compatible mods, approve dependencies, manage a group,
save a pack, share an exact publication, and participate in voting. A merged route
is not a completed user journey.

This document authorizes no implementation, provider configuration, database mutation,
deployment or publication. It distinguishes accepted rules, implemented interfaces,
missing integration, assurance gaps and proposed extensions. Approving a plan must not
silently approve unresolved product choices.

The backend remains the independent Hono/Bun application and Supabase PostgreSQL,
with Clerk owning accounts and sessions. Web wiring is inventoried because it affects
whether a feature is usable; implementing those screens is a separate frontend scope.
Do not create an application-owned logout endpoint merely because none exists: Clerk
already supplies sign-out. CurseForge, uploaded configuration files, multiple groups,
multiple packs per group and a launcher remain deferred.

## Assessment method and limits

- Read-only source/document inspection covered all eleven API source modules, the nine
  migrations, HTTP/SQL tests, local database runners, CI, Vercel configuration and the
  web account/session adapter. CodeGraph supplied routing and symbol evidence; the
  exploration handoff supplied the broader map.
- No new runtime tests, browser journey, load test, hosted query or defect reproduction
  ran for this assessment. Previously recorded green tests remain historical evidence.
  Static concerns are not presented as reproduced production defects.
- Provider settings, actual token lifetime, live Vercel configuration and email/OAuth
  delivery were not inspected. Environment secret values were not read. Historical
  task logs, the lockfile and some fixture/helper internals were not exhaustively read.
- No module audit proves absence of every bug. The inventory below is a scope map with
  specific next checks, not a security certification or a claim of feature completeness.

## Capability inventory

Status vocabulary: **API exists** means a local interface is present; **wired** means
the web calls it; **pending proof** means the real journey was not exercised here;
**proposal** means no accepted product requirement mandates the extension.

| Journey | Observed implementation | Remaining work / classification |
| --- | --- | --- |
| Register and sign in | Clerk sign-in/sign-up controls and verified `/me`; D3 and ADR0002 own the rules. | Complete real email/password, Google and Discord journeys; distinguish configuration, missing integration and runtime failures. |
| Sign out | `AuthControls` renders Clerk `UserButton`; the provider has a sign-out redirect configured. | Pending browser proof: session disappears, account display updates, and a subsequent protected request without credentials is refused. No custom logout route is required by this architecture. |
| Session expiry and revocation | API verifies the signed token locally using a pinned RSA key, issuer and authorized parties. | Expiry/invalid-token behavior must remain tested. Browser logout is not proof that a previously copied JWT is immediately revoked. Immediate revocation is a policy choice, not an already implemented guarantee. |
| Link/unlink sign-in methods and recovery | Clerk owns account management; D3 forbids automatic email-based merging and removal of the last method. | Verify the configured provider/account UI actually enforces these rules, including recovery mail. Ownership by Clerk does not prove the app configuration is correct. |
| Finish onboarding and maintain username | `/profile` and database username rules exist; `/me` exposes identity, not profile completion. | No complete web onboarding/profile flow. Specify how the client detects an absent application profile, handles collisions after OAuth and reaches the existing profile routes. |
| Delete an account | No application profile-delete interface or Clerk deletion reconciliation was found; domain foreign keys can restrict profile removal. | New lifecycle decision: ownership, historical votes, memberships, retained data and username reuse. Do not silently add deletion/cascades. |
| Search/filter mods | `GET /mods` accepts text, Minecraft version, loader and offset. It restricts results to mods and fixes the page size at 20. | These filters already exist in the API. No mod-browser UI is wired. Check empty/error/end-of-page behavior rather than reimplementing search. |
| Advanced mod filters and sorting | Category, sort order, client/server environment and caller-selected page size are not exposed by the current search contract. Unknown query parameters are ignored. | Proposal requiring filter definitions. Decide whether unsupported keys should be rejected or remain ignored before changing existing behavior. |
| Populate selectors and inspect a mod | Catalog metadata is retrieved internally for resolution, not exposed as a complete discovery interface. | Propose Minecraft/loader option lists, mod details and compatible version lists if needed by the intended UI. These endpoints are not implied by an existing search implementation. |
| Choose an exact mod version | Resolution reuses a supplied pin or selects the latest compatible version; no public per-project version-list route exists. | Decide whether people need to browse/pick older compatible releases. Preserve exact pins and never silently upgrade an approved version. |
| Confirm required dependencies | Resolver and explicit-selection validation exist; D2 requires owner confirmation before adding required dependencies. | No end-user confirmation/cancel flow is wired. Prove dependency rejection leaves the draft unchanged and that additions have compatible, conflict-free pins. |
| Edit the selected mods and settings | Owner-only draft replacement, revisions and compatibility checks exist. | Wire add/remove/save/conflict recovery. Do not add a new remove endpoint if replacing the explicit selection already satisfies the journey. |
| Create/join a group | Group RPCs/routes support public admission and private invitation plus approval. | User flows are not wired beyond `/api/me`. Public-group discovery is explicitly absent; decide directory vs known link/identifier instead of assuming a missing directory is a defect. |
| Manage invitations, requests and members | Invitation create/revoke/resolve, request approve/reject and paginated member/request reads exist. | Exercise navigation beyond the first page, revoked links, pending/rejected states and non-owner failures. Member expulsion remains out of scope. |
| Leave/transfer ownership | Immediate transfer, owner departure constraints and deletion when the last owner leaves are implemented. | Browser confirmation/recovery UX is undecided. Prove loss of access after departure and deletion semantics without using real user data. |
| Save/read/export a draft | Draft RPC and HTTP interfaces plus Modrinth `.mrpack` export exist. | Complete owner/member flows and public-interface tests for stale revision, invalid settings and upstream failures; no partial state after rejection. |
| Publish/list/activate/share a version | Immutable stored selection/presentation metadata, member-only reads/exports, explicit independent activation exist. | Exercise real signed-session flows and no-member denial. A link alone must never authorize a read. |
| Export an older publication | Export uses the stored version IDs but retrieves downloadable metadata from Modrinth again. | Verify and document unavailable-version behavior. Persisting complete file manifests or promising long-term binary availability is a separate scope decision. |
| Open/read/cast/cancel a vote | Concrete additions, duration, frozen electorate, ballot changes, early majority and cancellation exist. | Complete all user journeys, time-boundary and departure cases; document that deadline rejection is derived on access, not evidence of a scheduler. |
| Incorporate a binding vote | Separate owner incorporation RPC exists; approval does not automatically edit/publish/activate. | D7 says incorporation is binding but does not define a deadline or blocking mechanism. Decide how pending obligations constrain save/publish/transfer and what happens on later incompatibility. Do not assume a trigger or publication ban is already approved. |

### Evidence locations

- [Accepted product/architecture rules](../decisions/0001-project-baseline.md):
  D2 catalog/dependencies; D3 accounts; D4-D5 groups; D6 publications; D7 votes;
  D8-D9 independent API, **two Vercel projects**, initial USD 0 budget.
- [Clerk ownership](../decisions/0002-clerk-identity.md) and
  [profile ownership](../decisions/0003-clerk-profile-ownership.md).
- `apps/api/src/index.ts:20-45`: current routing, public pack body limit and fallback error.
- `apps/api/src/modrinth.ts:144-158`: search parameters/facets; `:160` onward:
  resolution, explicit selection validation, vote proposal and export.
- `apps/web/src/components/auth-controls.tsx:1-17`, `apps/web/src/app/layout.tsx`,
  `apps/web/src/app/page.tsx`: account controls and scaffold, not complete product UI.
- `apps/web/src/app/api/me/route.ts` and `apps/web/src/lib/identity.ts`:
  the current web adapter handles `/me`, not every backend interface.
- `apps/api/src/{identity,profiles,groups,pack-drafts,pack-publications,votes}.ts`
  and `supabase/migrations/*.sql`: existing authenticated interfaces and persistence.
- [HTTP contract](../reference/backend-api.md), [catalog architecture](../architecture/modrinth-backend.md),
  [group guide](../guides/groups.md), [publication guide](../guides/pack-publications.md),
  [voting guide](../guides/voting.md): current behavior, not approval for extensions.
- Clerk's documented sign-out API/configuration: [signOut](https://clerk.com/docs/reference/javascript/clerk#sign-out)
  and [Core 3 upgrade guide](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3).

## Milestones

Priority orders discovery and implementation; every row remains proposed. Each delivery
includes code (if needed), public-interface tests and contract/help documentation
together. Tests should first reproduce a requested rule or defect when a deterministic
runner exists. Existing behavior sharing changed code must remain pinned.

| Milestone | Acceptance criteria | Implementation / verification / delivery |
| --- | --- | --- |
| M1. Account and session journey | Email/password registration, sign-in, sign-out and expired-session behavior have recorded results. Google/Discord linking and recovery follow D3. Distinguish API-auth rejection, browser logout and copied-token revocation. | Reuse Clerk; inspect configuration before proposing auth endpoints. Provider access and test accounts need bounded authorization. Immediate revocation remains an explicit decision. |
| M2. Profile completion contract | A client can determine whether an authenticated account needs a profile, create one, resolve a username collision and rename under the existing cooldown/casing rules. Group creation without a profile remains predictably rejected. | Preserve `/me` unless a contract change is deliberately approved; prefer the existing profile interface. Record frontend onboarding as integration, not backend completion. Depends on M1 identity. |
| M3. Complete catalog discovery contract | Document/test existing query/version/loader/offset filters, empty results and pagination. The approved filter scope is category, sort order, client/server environment and author on `GET /mods`, an exact project lookup route, and an enriched hit payload. Multi-select category is a union, and the environment filter means "runs on that side" using required or optional support, not "exclusive to that side". Selector data and an exact-version picker were decided on 2026-11-16 ([ADR0006](../decisions/0006-selector-data-and-versions.md)) and are delivered as their own read slices, not inside M3. | Basic filters already implemented. Delivery order: first pin the existing behavior (empty results, offset bounds, the fixed page size, today's unknown-parameter behavior and upstream 429/5xx/timeout mapping) without adding behavior; then one filter per delivery with its contract tests, cheapest first; then the exact project lookup route, distinguishing not-found from upstream failure; then the enriched hit payload, measuring response size against the M9 concern. Reject malformed or unknown input and pin existing requests. No implementation is authorized by the scope decision alone. Independent of authenticated group work. |
| M4. Pack assembly and dependency approval | A client can propose a mod, inspect required dependencies, accept or cancel, remove a selection, change compatible settings and save. Rejection or stale revision cannot partially change stored selections. | Reuse resolver, explicit-selection validation and draft replacement. Depends on M2/M3 for the complete journey, not for existing API functionality. No silent upgrades. |
| M5. Group lifecycle and access | Tests cover public direct admission, private invite/request/approval, revocation, pages, transfer and departure; the caller's role/access changes immediately as defined by D4-D5. | Existing endpoints are the starting point. Directory/discovery and expulsion are not silently added. Independent of advanced catalog filters. |
| M6. Published versions and sharing | Publish/list/read/activate/export work with real signed sessions; a nonmember/previous member cannot read or export. Draft changes do not rewrite historical selections or activation. Unavailable upstream versions fail predictably. | Depends on M4/M5. Hosted schema application is recorded already; it is not a pending migration step. Stronger file-manifest persistence is a separate decision. |
| M7. Voting obligations and lifecycle | Open/change/cancel/expire/approve/incorporate are exercised, including fixed electorate and concurrent independent proposals. An explicit decision explains what “binding” requires and how conflicting pending additions are handled. | Depends on M4/M5. Do not automatically edit/publish/activate or block unrelated operations without approval. Deadline read semantics and notification scheduling are different concerns. Done on 2026-11-13: D7 records the obligation and conflict rules, and the lifecycle is pinned in pgTAP, HTTP, signed-token PostgREST, real multi-session races and a hosted live check. See [doc13](../delivery/doc13-voting-obligations.md). |
| M8. Account deletion and exceptional lifecycle | First decide whether deletion is in this scope and define ownership, membership, historical ballots and profile/username retention. If approved, rejected actions preserve data and provider events cannot strand inconsistent records. | Conditional product scope and destructive-data/security review. Not a request to delete current accounts or install a webhook. Depends on M1/M2/M5/M7 rules. Done on 2026-11-14: ADR0004 decides the application-owned surface and retention rules, `DELETE /profile` deletes the caller's own account while a surviving group keeps its votes, ballots, electorates, invitations and decisions, and ADR0005 adds the verified Clerk `user.deleted` reconciliation with ownership succession. Registering the provider endpoint needs a public URL. See [doc16](../delivery/doc16-account-deletion.md) and [doc17](../delivery/doc17-account-reconciliation.md). Merged as `c8bcaa4`; the two migrations are applied to the hosted project. |
| M9. Abuse limits and failure handling | Measure then bound catalog response bytes, expensive public work and request duration; exercise upstream 401/429, timeout and malformed responses. Errors distinguish the failing subsystem and never leak secrets. | Hardening proposal, not a reproduced exploit. Inventory existing per-route body limits before adding a shared limiter. Rate-limit identity/storage and HTTP status contracts require a design decision. |
| M10. Trustworthy database/integration CI | CI executes relevant pgTAP, upgrade, real-session/concurrency and PostgREST checks against disposable isolated state. Races prove actual overlap, fail on an appropriate mutation and touch only unique fixtures. Cleanup failure makes a runner fail. | Delivered on 2026-11-16 ([doc25](../delivery/doc25-database-ci.md)): `Database CI` runs the pgTAP, concurrency and PostgREST suites against a disposable stack, a race is accepted only after two transactions were open at once, every fixture carries a per-run token, cleanup leftovers fail the run, and the three suites report one TAP result per check. |
| M11. Operations for the selected Vercel architecture | Validate both independent projects, environment origins/token configuration, key rotation, readiness/logging without secrets, quotas and rollback. Record a smoke result and the environment actually tested. | D9 already selects Vercel; a Docker image, owned domain and platform-choice interview are not prerequisites. Do not infer deployed behavior from loopback-only `dev.ts`. Deployment/CD remains separately authorized. |
| M12. Evidence and handoff reconciliation | Inventory statuses agree with observed code, tests, hosted application and delivery. Old reviews have their actual terminal status recorded without invented approval. Each planned journey has a demonstrable outcome or a concrete blocker. | Runs alongside M1-M11, not as a substitute for functionality. Historical records stay dated; current handoff owns present state. Publishing/merge remains a separate decision. |

### Dependency order

1. Start with M1-M3: accounts/profile and mod discovery are the user-facing foundation.
2. Reuse existing interfaces for M4-M7; close gaps rather than rewrite working routes.
3. Decide M8 before implementing deletion. M9/M10 support each implemented slice.
4. M11 uses the already selected hosting architecture and needs deployment consent.
   M12 stays current throughout.

## Dependencies and open decisions

These are planning items, not a request to answer every question at once:

- Mod discovery scope for M3 is decided: category (union within the group), sort order,
  client/server environment, author, exact project lookup by id or slug, and an enriched
  hit payload. Selector data and the exact version picker were decided on 2026-11-16 by
  [ADR0006](../decisions/0006-selector-data-and-versions.md): the Minecraft version list is
  proxied from Modrinth releases and cached for one hour, a project's compatible versions
  are listed for an explicit picker, and the loader build is discovered from each loader's
  own metadata with manual entry kept as the override. The three read slices are queued on
  the board; none of them authorizes a screen.
- Does logout require browser/session sign-out only, or immediate invalidation of a
  previously copied token? The latter changes verification/revocation trade-offs.
- What precise enforcement makes a vote binding, and what happens when several approved
  additions conflict or ownership changes before incorporation?
- Is account deletion in this phase? Decided on 2026-11-14 by
  [ADR0004](../decisions/0004-account-deletion.md) for the caller's own application data, and
  the provider path by
  [ADR0005](../decisions/0005-provider-account-reconciliation.md), including ownership
  succession to the longest-standing member. Still open: confirmation/recovery UX and
  registering the webhook endpoint, which needs a public URL.
- Should public groups be discoverable in a directory? Current scope permits direct
  joining but explicitly does not implement a listing interface.
- Web UI is not part of the backend-only roadmap. Track backend readiness and UI
  integration separately so neither is falsely marked complete.
- External account/session access must be authorized for the exact target and operation.
  Previous migration authorization is not blanket permission to mutate provider settings.

## Next action

M1-M8 have their evidence recorded. M8 decided both deletion surfaces: the session path and
the verified provider path, including ownership succession when an owner can no longer act.
Registering the Clerk endpoint needs a public URL, so it waits on a deployment decision.
M10 is delivered ([doc25](../delivery/doc25-database-ci.md)); M9 hardening remains, and M11
needs deployment consent. Selector data and the exact-version picker were decided on 2026-11-16
([ADR0006](../decisions/0006-selector-data-and-versions.md)); their three read slices are
queued on the board and none of them is implemented. No implementation, provider
configuration or publication is authorized by this plan alone beyond what its records
name.

## Change log

- 2026-11-14: ADR0005 and its implementation complete M8's provider half on the same
  `feat/account-deletion` branch. A verified Clerk `user.deleted` event now deletes the
  application account through `POST /webhooks/clerk`; ownership of a group whose owner can
  no longer act passes to the longest-standing remaining member, and every other case reuses
  ADR0004. The shared routine is provider-neutral, `delete_account_for` is executable by
  `service_role` only, and the route fails closed without its signing secret or secret key.
  Local evidence: `bun run check` 192 tests and 3196 assertions, `bun run db:test` PASS with
  nine files and 250 tests, and 136 signed-token PostgREST checks, up from 126. An
  independent read-only pass found no blocker and two advisories, both fixed: impossible
  payloads that claimed a succession without a surviving group, and a body bound that trusted
  a declared length. The endpoint is not registered in Clerk because that needs a public URL;
  no hosted project or provider setting was touched. See
  [doc17](../delivery/doc17-account-reconciliation.md). Merged to `main` through
  [PR #81](https://github.com/msti1899/modpack-creator-version-final/pull/81) as `c8bcaa4`
  on 2026-11-14, and its two migrations are applied to the hosted test project.

- 2026-11-14: M8, account deletion and exceptional lifecycle, was implemented on
  `feat/account-deletion` from `origin/main` at `afea8bf`. ADR0004 decides that deletion is
  in scope only as the caller deleting their own application data: D5's rules decide
  ownership and membership, a profile and its username are deleted and immediately
  reusable, and a surviving group keeps its votes, frozen electorates, ballots, invitations
  and decided requests with the Clerk subject as an opaque tombstone. Four foreign keys that
  made a deleted profile impossible are dropped; the two that protect ownership and
  membership remain. `DELETE /profile` is idempotent and refuses an owner with other members
  with the existing transfer message, writing nothing. Local evidence: `bun run check` 182
  tests and 3090 assertions, `bun run db:test` PASS with eight files and 239 tests, and 126
  signed-token PostgREST checks, up from 97. Independent verification found and this slice
  fixed one blocker: the ballot page rejected the `null` username of a retained tombstone, so
  a surviving group's ballot page answered 502 after a member deleted their account. Provider
  reconciliation needs a webhook secret,
  a service-role credential and a rule for an owner who can no longer act, so it remains a
  separate decision; a Clerk-only deletion leaves an inaccessible profile whose username
  stays reserved. No hosted project or provider setting was touched. See
  [doc16](../delivery/doc16-account-deletion.md). Merged to `main` as `c8bcaa4`.

- 2026-11-13: M7, voting obligations and lifecycle, was implemented on
  `feat/voting-obligations` from `origin/main` at `ddd1b8f`. D7 now records what binding
  requires, that a pending obligation blocks no unrelated operation, that the current
  owner is the incorporator after a transfer, and how a conflicting pending addition is
  resolved: a wholly present addition is satisfied without rewriting the draft, while a
  partial overlap stays a 409 that writes nothing. The new migration
  `20261113190000_vote_incorporation_satisfied.sql` carries that branch and was applied to
  the selected hosted project. Evidence: pgTAP PASS with seven files and 218 tests, 97 signed-token
  PostgREST checks, 14 real concurrency checks, 165 Bun tests and 2962 assertions, and a
  41-check hosted live run with real Clerk sessions. See
  [doc13](../delivery/doc13-voting-obligations.md). This slice adds one incorporation
  branch and evidence; it changes no other route, message or status.

- 2026-11-13: M5 merged to `main` through
  [PR #60](https://github.com/msti1899/modpack-creator-version-final/pull/60) as
  `4e03da0`, with the Backend checks passing in 44 seconds. Published as four commits, one
  per artifact, after a medium/`under_budget` assessment. This slice changed no product
  behavior, so the remaining M5 work is a re-run of the live proof when group routes, RLS
  grants or the token template change.

- 2026-11-13: M5 gained its hosted real-session proof after separate authorization. A new
  live script created three disposable development accounts, signed them in for real
  session tokens, and ran the full lifecycle through a local API against the selected test
  project: 30 checks passed, including immediate role changes and both departure paths.
  Groups were closed through the API, profiles were removed by exact id, and hosted
  readback showed zero rows. The instance holds only the owner account. Re-running needs
  the same bounded authorization; the script is not part of CI. See
  [doc10](../delivery/doc10-groups-lifecycle-proof.md).

- 2026-11-13: M5, group lifecycle and access, was authorized on an isolated branch and
  implemented as evidence on `feat/group-lifecycle` from `origin/main` at `bce2fb7`. No
  endpoint, migration or product rule changed. pgTAP gained 24 assertions for
  pending-request cursors, page clamping, empty final pages and rotated or revoked
  tokens, and the signed-token PostgREST script became a multi-subject lifecycle suite
  (58 checks) covering admission, invitation, approval, rejection, pages, immediate
  ownership transfer and both departure paths. Local results: `bun run db:test` PASS with
  217 tests, `bun run db:test:postgrest` 58/58, `bun run check` 153 tests. Two local-only
  mutations produced nine pgTAP and six PostgREST failures and were reverted with
  `bun run db:reset`. Hosted real-session lifecycle proof remains open. The slice is not
  published, reviewed or merged. See [doc10](../delivery/doc10-groups-lifecycle-proof.md).

- 2026-11-13: M3 was implemented on `feat/catalog-discovery` after separate owner
  authorization, using the scope and delivery order recorded above. The slice rejects
  unknown and repeated query parameters, adds sort/category/environment/author filters,
  adds an exact project lookup route and enriches the result payload. Independent
  verification met S1–S8 with no blocker. It is not published, merged or reviewed, and
  selector data and the exact-version picker remain open. See
  [doc09](../delivery/doc09-catalog-discovery.md).

- 2026-11-13: M3 delivery order recorded. The slice pins existing search behavior
  first (empty results, offset bounds, fixed page size, unknown-parameter behavior and
  upstream failure mapping) before adding behavior; then adds one filter per delivery
  with contract tests; then the exact project lookup route, distinguishing not-found
  from upstream failure; then the enriched hit payload with a response-size measurement.
  The slice is backend contract work with no client consuming the new fields yet, so no
  user-visible improvement is claimed and implementation remains unauthorized.

- 2026-11-13: M3 catalog-discovery scope was narrowed to a decided filter set: category,
  sort order, client/server environment, author, exact project lookup by id or slug, and an
  enriched hit payload. The environment filter is defined as "runs on that side", matching
  required or optional support, so a mod that works on a side is not hidden because it is
  not exclusive to it. This is a scope decision and authorizes no implementation.

- 2026-11-13: The owner authorized starting M2, the profile-completion contract, as
  an isolated branch from the documentation baseline because M1 account/session work
  is in progress elsewhere. No other milestone is authorized. The slice records the
  existing profile-completion signal, splits the ambiguous creation conflict into
  distinguishable causes, and pins the group-without-profile rejection.
- 2026-11-13: M2 is implemented and verified locally on `feat/backend-profile-completion`.
  Local checks and independent verification passed without a blocker; the slice is
  not published, reviewed for delivery or merged, and no other milestone advanced.
- 2026-11-13: Initial proposal focused on verification, hosted proof, identity and
  production. It did not inventory the actual user journeys and is superseded here.
- 2026-11-13: Expanded after owner feedback to cover sessions/logout, onboarding,
  search/filter/version discovery, dependency approval, group lifecycle, packs,
  publications and voting as well as hardening/operations. Clarified implemented
  interfaces versus missing web wiring, test gaps and optional features. Corrected the
  earlier claim that a new platform decision, Docker image or owned domain is needed;
  D9 already selects two Vercel projects. No implementation scope was approved.
- 2026-11-13: The owner authorized publishing and merging this planning document.
  Its unresolved product choices remain open; this is not authorization to implement
  every proposed extension or change external services.

- 2026-11-13: M4 is implemented on `feat/pack-assembly` after the milestone was
  selected for continuation. The resolver now names every proposed mod and dependency
  by project title so a proposal can be inspected and approved without extra lookups;
  accept, cancel, removal, compatible settings changes and atomic rejection reuse the
  existing resolver, selection validation and replacement write. Independent
  verification met S1–S7 with no blocker and its three advisories were corrected.
  Not published, not merged. See [doc11](../delivery/doc11-pack-assembly.md).

- 2026-11-16: [ADR0006](../decisions/0006-selector-data-and-versions.md) decides the three
  selector questions that were open: a Modrinth-proxied Minecraft release list cached for
  one hour, an explicit per-project version list for the mod detail surface, and loader
  builds discovered from each loader's own metadata with manual entry kept as the override.
  The decision adds three read contracts and no write path, and it authorizes no screen.
  Its slices are queued on the board and remain unimplemented.

- 2026-11-16: M10 delivered. CI now starts the disposable Supabase stack and runs pgTAP,
  multi-session concurrency and signed-token PostgREST checks; the concurrency harness records
  that two transactions were open at once before accepting an outcome and fails when a race
  never overlapped; fixtures use a per-run token and cleanup leftovers fail the run. The three
  `plan(1)` suites now report one TAP result per check, 439 in total. See
  [doc25](../delivery/doc25-database-ci.md).
