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
| M3. Complete catalog discovery contract | Document/test existing query/version/loader/offset filters, empty results and pagination. Decide and then implement only approved category/sort/environment filters and selector/detail/version-list interfaces. | Basic filters already implemented. Advanced filters and an exact-version picker need a decision before new behavior. Reject malformed approved input; pin existing requests. Independent of authenticated group work. |
| M4. Pack assembly and dependency approval | A client can propose a mod, inspect required dependencies, accept or cancel, remove a selection, change compatible settings and save. Rejection or stale revision cannot partially change stored selections. | Reuse resolver, explicit-selection validation and draft replacement. Depends on M2/M3 for the complete journey, not for existing API functionality. No silent upgrades. |
| M5. Group lifecycle and access | Tests cover public direct admission, private invite/request/approval, revocation, pages, transfer and departure; the caller's role/access changes immediately as defined by D4-D5. | Existing endpoints are the starting point. Directory/discovery and expulsion are not silently added. Independent of advanced catalog filters. |
| M6. Published versions and sharing | Publish/list/read/activate/export work with real signed sessions; a nonmember/previous member cannot read or export. Draft changes do not rewrite historical selections or activation. Unavailable upstream versions fail predictably. | Depends on M4/M5. Hosted schema application is recorded already; it is not a pending migration step. Stronger file-manifest persistence is a separate decision. |
| M7. Voting obligations and lifecycle | Open/change/cancel/expire/approve/incorporate are exercised, including fixed electorate and concurrent independent proposals. An explicit decision explains what “binding” requires and how conflicting pending additions are handled. | Depends on M4/M5. Do not automatically edit/publish/activate or block unrelated operations without approval. Deadline read semantics and notification scheduling are different concerns. |
| M8. Account deletion and exceptional lifecycle | First decide whether deletion is in this scope and define ownership, membership, historical ballots and profile/username retention. If approved, rejected actions preserve data and provider events cannot strand inconsistent records. | Conditional product scope and destructive-data/security review. Not a request to delete current accounts or install a webhook. Depends on M1/M2/M5/M7 rules. |
| M9. Abuse limits and failure handling | Measure then bound catalog response bytes, expensive public work and request duration; exercise upstream 401/429, timeout and malformed responses. Errors distinguish the failing subsystem and never leak secrets. | Hardening proposal, not a reproduced exploit. Inventory existing per-route body limits before adding a shared limiter. Rate-limit identity/storage and HTTP status contracts require a design decision. |
| M10. Trustworthy database/integration CI | CI executes relevant pgTAP, upgrade, real-session/concurrency and PostgREST checks against disposable isolated state. Races prove actual overlap, fail on an appropriate mutation and touch only unique fixtures. Cleanup failure makes a runner fail. | Current CI runs app checks/build and upgrade, but not all new database runners. Current race uses timed sleeps and broad cleanup prefixes; strengthen before CI reuse. Three SQL suites emit one TAP result despite many internal checks; improve diagnostics. |
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

- Which additional mod filters are needed: category, sort, client/server environment,
  explicit version selection? Supported Minecraft/loaders selector data also needs a
  defined source and cache policy if exposed.
- Does logout require browser/session sign-out only, or immediate invalidation of a
  previously copied token? The latter changes verification/revocation trade-offs.
- What precise enforcement makes a vote binding, and what happens when several approved
  additions conflict or ownership changes before incorporation?
- Is account deletion in this phase? Define retention/ownership before implementing it.
- Should public groups be discoverable in a directory? Current scope permits direct
  joining but explicitly does not implement a listing interface.
- Web UI is not part of the backend-only roadmap. Track backend readiness and UI
  integration separately so neither is falsely marked complete.
- External account/session access must be authorized for the exact target and operation.
  Previous migration authorization is not blanket permission to mutate provider settings.

## Next action

Review this capability inventory with the owner, starting with session behavior and
the required mod-search filters. Agree that first coherent slice before implementing.
Do not start with reviews/deployment while the intended user-facing capabilities remain
undefined. No source changes, commits, publishing or remote actions are authorized by
the request to assess and plan.

## Change log

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
