# Frontend roadmap

Status: Proposed. This document assesses the current state and proposes milestones; it
authorizes no implementation, design round, deployment or merge.
Source: the owner requested an assessment of backend readiness and of the delivered and
in-progress screens, plus a frontend plan shaped like the backend plans (2026-11-14).
Current checkpoint: [handoff](../handoff.md). Inspected baseline: `afea8bf` on `main`.

## Outcome and boundaries

A person can pick up the product in a browser: sign in, finish a profile, create or join
a group, browse the Modrinth catalog for mods compatible with one Minecraft version and
loader, assemble and save a pack, publish an exact version, and vote on a proposal.
Milestones follow what a person must do, not what the API happens to expose.

Scope is `apps/web` only, plus the Next route handlers it may need to keep provider
credentials off the client.

- The backend contract in [the API reference](../reference/backend-api.md) is fixed here.
  A journey that needs a route the API does not serve becomes a dependency decision, not
  an implicit backend task.
- No screen is implemented before its design gate passes (see below). An approved
  mockup is a precondition, and a mockup is not a screen.
- A merged API route is not a usable journey. Usability means a real person completes
  the journey in a browser against a signed session.
- Publication, deployment, CD, provider configuration, hosting and merge remain separate
  owner decisions. Local proof does not authorize any of them.
- Not in scope: CurseForge, uploaded configuration files, multiple groups per person,
  multiple packs per group, the desktop launcher, and account deletion while its product
  question stays open.

## Assessment method and limits

- Read-only inspection of `apps/web/src`, the eleven `apps/api/src` modules and their
  router composition, [the backend roadmap](backend-roadmap.md),
  [the backend completion plan](backend-completion.md), the delivery records and
  [the frontend tooling guide](../guides/frontend-tooling.md).
- The local design store was read as gate state only: which rounds exist, which one is
  approved, and whether the frozen reference copy is intact. Its files are local and
  unversioned, and their contents are not reproduced in this repository.
- No runtime test, browser journey, Lighthouse run or visual comparison was executed for
  this assessment. Previously recorded green results stay historical evidence.
- This is a scope map with named next checks, not a claim of feature completeness.

## Where the work stands

### Backend readiness per journey

| Journey | Interface | Readiness for a screen |
| --- | --- | --- |
| Sign in and out, expired session | Clerk plus `GET /me`, verified with a real session ([doc08](../delivery/doc08-account-session-proof.md)) | Ready. Delivered in the app already. |
| Profile completion and rename | `GET`/`POST`/`PATCH /profile` with casing, collision and 30-day rules | Ready. `GET` returning `{"profile": null}` is the documented completion signal. No UI. |
| Group lifecycle | Thirteen authenticated operations; public admission, private invitation with approval, pages, transfer and departure proven ([doc10](../delivery/doc10-groups-lifecycle-proof.md)) | Ready. No UI. |
| Catalog discovery | `GET /mods` with text, Minecraft version, loader, offset, sort, category, environment and author; fixed 20 per page ([doc09](../delivery/doc09-catalog-discovery.md)). `GET /mods/:idOrSlug` for one project | Ready. Delivered in the mod browser ([#82](https://github.com/msti1899/modpack-creator-version-final/pull/82)); the mod detail surface is the only missing part. |
| Pack assembly and draft | `GET`/`PUT /groups/me/pack`, `POST /groups/me/pack/export`, `POST /packs/resolve`, `POST /packs/export`; selection validation and revision conflicts ([doc11](../delivery/doc11-pack-assembly.md)) | Ready. No UI. |
| Publishing and sharing | List, read, export, publish and independent active-version selection; member-only access ([doc12](../delivery/doc12-published-sharing.md)) | Ready. No UI. |
| Voting | List, open, ballots, cancel and owner incorporation with a frozen electorate ([doc13](../delivery/doc13-voting-obligations.md)) | Ready. No UI. |
| Provider linking and recovery | Clerk owns the flows; the configured instance was not inspected for these rules | Not ready as a product surface. |
| Account deletion | No interface, and the product question is undecided ([M8](backend-completion.md)) | Must not be promised in any screen. |

### Screens that exist

| Surface | Location | State |
| --- | --- | --- |
| Home | `apps/web/src/app/page.tsx` | Development scaffold: heading, explanatory copy, account controls and a documentation link. Not product UI. |
| Sign in | `apps/web/src/app/sign-in/page.tsx`, `components/sign-in-card.tsx` | Delivered from an approved direction, with recorded visual parity ([doc15](../delivery/doc15-web-tooling-signin.md)). |
| SSO callback | `apps/web/src/app/sso-callback/page.tsx` | Delivered redirect handler. |
| Mod browser | `apps/web/src/app/mods/page.tsx`, `components/mod-browser.tsx` | Delivered in [#82](https://github.com/msti1899/modpack-creator-version-final/pull/82) and recorded in [doc18](../delivery/doc18-mod-browser.md): a proxied catalog search with facets, paging, selection and both themes. The detail surface F4 also asks for does not exist. |
| Account controls | `apps/web/src/components/auth-controls.tsx` | Delivered Clerk `UserButton`; no application-owned settings surface. |
| Design system | `apps/web/DESIGN.md`, `src/app/globals.css` | Copper Workshop tokens recorded and applied to the theme. |

### Work in progress

| Item | Gate state |
| --- | --- |
| Mod browser detail surface | The search screen shipped; a detail surface with the versions a person can select has no design round and no task document. |
| Sign-in rounds v3 and v4 | Both failed the canvas-artboard check of the local workflow. They changed nothing in the repository: the delivered sign-in came from the approved earlier round. Treat that failing check as an unfinished local round, not as a defect in the shipped screen. |
| App shell | None. There is no navigation, no shared layout for signed-in surfaces, and no client for the authenticated API beyond `/api/me`. |

## The design gate

The gate is a precondition, not a milestone. Before any screen slice is implemented:

1. A design round exists in the local supervised workflow and one direction is approved
   for that round.
2. Its frozen reference copy is intact and read-only. The approved mockup is immutable
   during implementation, and a visual change requires a new round and a new approval.
3. An ODD task document exists for the slice, naming the approved round.

This is why a milestone can hold an approved design and still not ship. The mod browser
is the worked example: it held an approved direction, then satisfied the gate once its
task document existed, and shipped. A milestone below is "ready to implement" only when
both its backend interface and its approved direction exist; until then it is planned,
not scheduled.

## Milestones

Ordering reflects dependency and risk, not API readiness alone. Each delivery ships code,
the component and journey tests that cover it, and its documentation together.

| Milestone | Acceptance criteria | Implementation, verification and delivery |
| --- | --- | --- |
| F1. Application shell and session boundary | A signed-in person lands on a shell with navigation, identity display and sign-out; visiting a protected surface while signed out lands on sign-in and returns to the intended route afterward. Switching accounts never shows the previous person's data. | Partly delivered: design tokens, the shadcn/Radix base, the sign-in screen and the `/api/me` adapter exist. Missing: the shell, the protected-route boundary, a typed client for the authenticated API, and one error surface that renders the API error envelope as a sentence instead of a status code. Check the cached-data boundary between accounts explicitly, because server state is cached by the query client. |
| F2. Profile completion and username | A new account is prompted to choose a username before any group action; a taken name is reported as a taken name; a first rename succeeds immediately and a later one inside 30 days explains the wait instead of failing generically. | No UI. The completion signal is already contracted: `GET /profile` returning `{"profile": null}`. Keep `/me` identity-only. Reuse the existing profile routes; do not add an endpoint. Verify casing display against the stored value and both collision messages. |
| F3. Group lifecycle | An owner creates a group and sees members and join requests; an invitee opens a link, requests to join with a private group and is admitted after approval, or joins a public group directly; the owner revokes an invitation, transfers ownership and leaves with a confirmation that states what happens next; a member who left loses access on the next request. | No UI. Design round and ODD document not started. Reads are paginated: exercise a cursor past the first page, a revoked link and a non-owner attempt rather than only the happy path. Surface "you already have a group" as its own state, because one group per person is a rule, not a failure. |
| F4. Mod browser | A person searches within the locked Minecraft version and loader, moves through result pages, sees empty and upstream-failure states that say which part failed, and opens one mod's detail surface with the versions that can be selected. | Search, paging, the empty and failure states and both themes are delivered ([#82](https://github.com/msti1899/modpack-creator-version-final/pull/82), [doc18](../delivery/doc18-mod-browser.md)) against the task record in [mod-browser](../../odd/tasks/mod-browser.md). Missing: the detail surface with selectable versions. The backend has served sort, category, environment and author since catalog discovery ([doc09](../delivery/doc09-catalog-discovery.md)), and the shipped screen uses them. |
| F5. Pack assembly and draft save | An owner adds a mod from the browser, confirms or cancels its required dependencies explicitly, removes a selection, and changes the Minecraft version or loader: an incompatible change is refused with the stored draft unchanged. Saving a stale revision explains the conflict without discarding the person's work. | No UI. Depends on F4 for the adding journey, not on new backend behavior. Reuse the resolver and explicit-selection validation. Prove that a rejection leaves no partial selection, which is the failure this screen can cause. |
| F6. Publishing and sharing | An owner publishes an immutable version, sees earlier versions preserved, selects the active version as a separate action, and exports an archive; a previous member opening the same surface is told access ended rather than shown an empty page. | No UI. Depends on F5. Publishing must not appear to activate the version: the two actions stay visibly separate. Verify denial with a signed-out and a former-member request. |
| F7. Voting | The owner opens a proposal with a chosen duration; the frozen electorate sees it, casts and changes a ballot until the majority, sees the early-approval result, and the owner cancels or incorporates; incorporation never silently edits, publishes or activates a version. | No UI. Depends on F5 and F3. Deadline rejection is derived on access, so the screen must not imply a scheduled job fired. |
| F8. Account settings and exceptional states | A signed-in person reaches their account settings, sees which sign-in methods are attached, and any action the product has not decided appears as absent rather than as a disabled promise. | Depends on D-F3 and provider configuration. Only implement what the configured Clerk instance actually enforces; do not build an application-owned account-management surface to work around it. |

Cross-cutting acceptance applies to every milestone rather than forming its own: the
surface is keyboard reachable with visible focus and passes axe-core; each interactive
journey has a Playwright test, and component logic has a Vitest test; authenticated
journeys need a test account, which this environment does not have yet; and the
implemented screen is compared against the approved mockup at desktop and narrow widths.

## Dependencies and open decisions

Resolve a choice before implementing behavior that depends on it.

- **D-F1. Catalog filter scope.** Resolved by delivery, not by a recorded decision.
  Catalog discovery shipped sort, category, environment and author
  ([doc09](../delivery/doc09-catalog-discovery.md)), and the mod browser shipped with the
  approved facet layout on top of them. What stays open is whether that resolved scope is
  recorded as a decision in its own right. It no longer blocks F4.
- **D-F2. Group discovery.** There is no public group directory, and its absence was
  recorded as a scope choice, not a defect. Decide invite link and known identifier only,
  or authorize a directory. F3 is implementable either way; the navigation depends on it.
- **D-F3. Account deletion.** Undecided at the product level and involving destructive
  data. Settings must not present it until it is decided.
- **D-F4. Dependency confirmation interaction.** Resolved on 2026-11-16. D2 requires
  explicit owner confirmation before a required dependency is added; the confirmation is
  one modal dialog opened by the action that adds a mod, and it is the only confirmation
  point in the journey.
  - It opens only when the resolver returns newly required dependencies for that mod. A
    mod with no new required dependency is added directly, without a dialog.
  - It lists the mod being added first, then each required dependency by project title and
    version number, with the number of entries the addition would make.
  - Confirming adds the mod and every listed dependency as one save. Cancelling adds
    nothing: no request that stores anything is made, and the stored draft, the selection
    state and the draft revision stay exactly as they were. Choosing the mod again asks
    again; an approval is not remembered for a later addition.
  - Required dependencies are accepted together or not at all. Accepting a subset is not
    offered, because the save and the export both reject a selection whose required
    dependencies are incomplete.
  - A failed resolution shows the failure as a sentence naming what failed, offers a retry
    and adds nothing, including on the upstream-failure and timeout paths.
  - There is no second confirmation at save time; the save submits exactly the version IDs
    the dialog approved.
  - The dialog is keyboard reachable, keeps focus inside while open, closes on Escape
    without adding, and passes axe-core like every other surface.
- **D-F5. Authenticated test account.** Playwright runs with provider credentials cleared
  because no test account exists, so no authenticated journey is covered today. A
  configured test instance and a dedicated account are prerequisites for F2 onward being
  verified rather than only reviewed.
- **D-F6. Visual regression baseline.** The design workflow compares implementation
  against the approved mockup manually. Decide whether those comparisons stay local
  evidence or become a tracked check, before announcing a screen as visually verified.

## Next action

The mod browser gate is closed: its task document and its screen exist. D-F4 was resolved
on 2026-11-16, so the dependency confirmation no longer blocks F4 or F5, and
[ADR0006](../decisions/0006-selector-data-and-versions.md) decided the selector data and the
exact-version picker the same day. F4 now includes a version list inside the detail surface
and F5 reads its settings from the delivered list rather than from a hardcoded default. What
still blocks that path is not a documentation gap: the detail surface and the pack screen
have no design round. All three read contracts ADR0006 names are merged, so the API no longer
blocks F4, F5 or F6. F2 needs no open decision, and F3 is implementable whichever way D-F2
resolves.

## Change log

- 2026-11-14: Initial proposed plan. Records the backend readiness inventory, the
  delivered and in-progress surfaces, the design gate as a precondition, eight journey
  milestones and six open decisions.
- 2026-11-16: Corrected the mod browser status against the delivered code. The surface was
  recorded as blocked; it shipped in #82 with its task document and now appears under the
  screens that exist, with the missing detail surface named as the remaining gap. Two
  premises were wrong: catalog discovery had already shipped sort, category, environment
  and author, and D-F1 no longer blocks F4. The initial inspection point `afea8bf` is kept
  as written.
- 2026-11-16: Resolved D-F4 in favour of one modal confirmation dialog opened by the add
  action. Records the trigger, contents, cancel semantics, all-or-nothing acceptance, the
  failure path and the accessibility expectation. F4 and F5 no longer depend on it.
- 2026-11-16: On the same day as D-F4, [ADR0006](../decisions/0006-selector-data-and-versions.md)
  decided the selector data and the exact-version picker: the Minecraft version list comes
  from Modrinth releases, a mod's exact version is chosen on the detail surface, and the
  loader build is discovered from each loader's metadata. F4 therefore gains a version list
  and F5 no longer hardcodes its defaults; the three backend read slices are still
  unimplemented, so the design round stays the remaining frontend blocker.
