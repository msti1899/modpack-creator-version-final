# Application shell (F1)

Slice: frontend milestone F1 in [the frontend roadmap](../../docs/plans/frontend-roadmap.md#milestones).
Branch: to be cut by the implementing agent from `main` at `99ee7aa` in its own
worktree. Delivery strategy: `ask-on-risk`. Test runners: `bun test` for
`apps/web/tests/*.test.ts(x)`, Vitest for `apps/web` component suites, Playwright for
browser checks.

Objective: give the signed-in surfaces one frame — group-scoped navigation, identity,
sign-out, the session boundary and one error surface — without inventing the group,
proposal, mod or pack screens that later milestones own.

Status: the owner authorized the implementation of this slice on 2026-11-18, and the
design gate is closed. Publication, merge and deployment remain separate owner
decisions that this document does not cover. No code changes are part of writing it.

## Provenance

Every spec below is derived from a source that exists today. Nothing here is a proposal
promoted to a requirement.

| Source | What it fixes |
| --- | --- |
| [Frontend roadmap, F1](../../docs/plans/frontend-roadmap.md) | The acceptance criteria and the four named gaps |
| [Frontend roadmap, group-scoped navigation](../../docs/plans/frontend-roadmap.md#group-scoped-navigation-and-proposal-approval) | Navigation is group-scoped, account controls separate, no global catalog |
| [Handoff, current checkpoint](../../docs/handoff.md) | One next action: finish the F1 design review |
| `design/b2-mods-integration/a.html`, artboard `a` of round `v3` (approval `A2`) | Composition, states, copy and responsive behaviour of the integrated frame |
| [Web-to-API transport](../../docs/guides/web-api-transport.md) | The handler idiom every new surface follows |
| [Backend API reference](../../docs/reference/backend-api.md) | `GET /me` and `GET /groups/me` shapes |
| [DESIGN.md](../../apps/web/DESIGN.md), `apps/web/src/app/globals.css` | Colour, typography, radius and the dark theme values |
| [Frontend tooling](../../docs/guides/frontend-tooling.md) | Check commands, viewports, the Playwright harness |
| Design approval `A2` in the workflow's approval store | Which direction is approved for this slice, what was frozen and on what basis |
| `design/b2-mods-integration/handoff-a.md` and `approval-note.md`, in the design worktree on 2026-11-18 | The integration rules the approval implies; policy, not a workflow gate receipt |

Each spec is one `- **S<n> …**` entry because the design-gate parser counts spec bullets
in this form, not headings.

## Specs

- **S1 — Slice scope.** The frame, its states and the boundary, plus the approved
  integration of the existing catalog into that frame. In scope: the command bar (brand,
  group navigation, theme control, identity chip with account menu), the content region
  and its context line, the signed-out, no-group, unconfigured and error states, the
  typed client for the authenticated group read, the server-cache boundary between
  accounts, and the catalog's placement under one global bar as approval `A2` draws it —
  filters in the left content column, results to its right, and the catalog's own brand,
  theme control and header removed, with its title and locked context chips carried once
  by the frame's context line (**S2**, **D1**).
  Out of scope, each owned by a later milestone: the group page and its lifecycle (F3),
  the mod browser's detail surface and any change to its search, facets, sorts, paging,
  selection or pack wiring (F4), pack assembly (F5), publication (F6), voting and pending
  proposals (F7), profile completion and username (F2), account settings (F8). No
  `/g/...` route is created here.
  The frame mounts on `/mods`, the one authenticated surface that already exists
  (**D1**). The integration changes that screen's composition, not its behaviour: the
  same controls, data, states and Add to pack footer remain. The first group route and
  the shell's landing target remain F3's.

- **S2 — Approved design reference.** The approved direction is artboard `a`, file
  `a.html`, title `A · Shared top bar and left filters`, in design round `v3` on canvas
  `b2-mods-integration`. Approval `A2` was recorded on 2026-11-18 and froze four read-only
  files (mode 0444 in a 0555 directory) whose sizes match the canvas: `a.html` 165037,
  `b.html` 180713, `c.html` 237655 and `design.json` 635. The manifest is
  `design/b2-mods-integration/design.json` and declares the same three variants.
  Only `a.html` is the approved reference. Approval `A1` for round `v2`, direction `b`,
  governs the previous frame and remains recorded as history; it does not govern this
  slice (see **B1**).
  The artboards are local and git-ignored (`.git/info/exclude`), so they exist only in
  the main checkout, not in any worktree. Implementation must read the approved artboard
  at the absolute path of the main checkout's `design/b2-mods-integration/a.html` and
  compare against it at the three viewports in S13.
  The artboard shows the existing catalog inside the frame, with sample rows, counts and
  identities. Those samples are illustrative: the API does not supply facet counts and
  nothing in this slice turns them into live data. The artboard's written tablet rule
  also contains an error; **S13** records the verified behaviour and the frozen artboard
  is not edited.

- **S3 — Identity, role and the group read.** `GET /api/me` already returns the minimal
  identity `{ user: { id, email } }` and stays identity-only; no username is added to it
  (F2 owns the username).
  The role and group name the bar displays need one read the web does not have. Add
  `apps/web/src/app/api/groups/me/route.ts` as a server handler over `GET /groups/me`,
  following the transport idiom exactly: validate `API_URL` the way `endpoint` does,
  send only `Accept` plus `Authorization: Bearer <token>`, one 5-second deadline,
  `redirect: "error"`, `Cache-Control: no-store`, fixed failure messages, and a streamed
  byte cap. The cap is 256 KiB, chosen because the API embeds up to 50 members and up to
  50 join requests in this payload and the shell needs none of them.
  The handler re-validates the payload and reduces it. The shell may receive only
  `{ group: { id, name, role } }` with `role` either `owner` or `member`, or
  `{ group: null }`. Members, join requests, cursors, `ownerId`, `visibility`,
  `createdAt` and the invitation token are discarded at the handler. A `200` whose body
  is neither shape is `502`, so a malformed payload can never reach the frame.
  Identity display, per the approved artboard: a disc with initials, the email, and a
  role label reading `Owner`, `Member` or `No group`. `No group` is the label when the
  read returns `{ group: null }`; it is never an invented group name. The initials
  derive from the email local part because no display name exists: take the first
  character of up to two dot-, underscore- or hyphen-separated segments, uppercase, and
  fall back to the first character of the email. F2 replaces this source when a username
  exists.

- **S4 — Navigation.** Group-scoped, with one destination. One global top bar carries the
  brand, the group's name as the group entry, the theme control and the identity chip.
  Account controls live in the chip's menu, never beside the group navigation, and there
  is no global catalog entry. The catalog keeps no second brand or theme control: its own
  header is removed where the global bar already carries those controls.
  The catalog's filter column is content, not global navigation. It holds catalog filters
  and sorting only, and it must not become a navigation landmark or carry destinations.
  The approved artboard also shows a `Pending proposals` entry with a count. This slice
  does not render it: its page does not exist, its read does not exist, and member
  proposals are recorded as an unimplemented backend dependency in the roadmap.
  Rendering a link to a missing route, or a count with no data behind it, would be a
  promise the product cannot keep. The navigation is written as a container that accepts
  entries so F7 adds that one without restructuring the bar. The phone strip in **S13**
  likewise contains the group only. See **D2**.

- **S5 — The signed-out boundary.** The boundary is application-level, not middleware.
  `apps/web/src/proxy.ts` runs `clerkMiddleware` without route protection and stays that
  way: this slice adds no `auth.protect()`, no rewrite and no redirect at the edge.
  Behaviour, from F1's acceptance criteria and the artboard's signed-out state: an
  unauthenticated person who reaches a protected surface stays on that page. The bar,
  the brand, the theme control and the context line render; a prompt card occupies the
  content region with the approved copy ("Sign in to continue", "This group and its mods
  stay private until you sign in.") and one `Sign in` action pointing at
  `/sign-in?redirect_url=<the current route>`. Private data is absent: no group name, no
  role, no content, and no request that needs a session is issued from that state.
  The signed-out state is derived from `/api/me` answering `401`, not from a Clerk
  client hook and not from a redirect, so the same decision holds on first paint and
  after a session expires.
  A `503` from `/api/me` is a distinct state, not a signed-out one: it means Clerk is
  not configured. The frame renders the brand, the theme control and one sentence naming
  the configuration problem, with no sign-in action that cannot work.

- **S6 — Return to the intended route.** The `redirect_url` parameter is Clerk's own
  name for the post-authentication destination, so it is not a new convention. Read it
  on the sign-in completion path and navigate to it only after it passes validation: it
  must be a same-origin path beginning with a single `/`, not `//`, not a scheme, not a
  backslash, and not an absolute URL. Anything else falls back to `/`. This is the
  open-redirect guard, and it is unit-tested rather than reviewed by eye.

- **S7 — The no-group state.** Signed in with `{ group: null }`: the account stays
  visible with the `No group` label, no group name appears anywhere, and the content
  region shows the artboard's card as drawn — a group mark, the title "No group yet",
  the sentence "A group owns the pack and its mods. Create one on its own page, or open
  a link you were given.", and its two actions: `Create a group` as the primary and
  `Open a link` as the outline control.
  Both destinations belong to F3, so both actions are inert in this slice (**D3**,
  decided 2026-11-18). Inert has one meaning here and the implementation must not soften
  it: pressing either performs no navigation, issues no request, changes no application
  state, and shows no spinner, no success message and no optimistic result. There is no
  `href` to a route that does not exist, because a 404 is a broken promise dressed as
  navigation.
  Unavailability is carried by the accessible name and description — each control is
  marked unavailable to assistive technology and explains that the page is not ready
  yet — while the visual composition stays faithful to the artboard.

- **S8 — Account menu and sign-out.** The chip opens a menu containing the identity
  (email and role label), the group entry marked `aria-current="page"` when it is the
  current destination, a separator, and `Sign out`. `Sign out` calls Clerk's `signOut`
  with `redirectUrl: "/"`. The menu closes on Escape and on selecting an item, and focus
  returns to the chip.
  Sign-out also clears the client cache (S11). It never depends on a full page reload to
  forget the previous person.

- **S9 — Theme control.** Light is the working default and dark is a first-class equal.
  The control toggles `.dark` on the document root, carries `aria-pressed`, and is the
  same control in every state. Token values are the ones already in
  `apps/web/src/app/globals.css`; the slice adds no colour, no third hue family and no
  per-surface theme scope.
  The theme applies once at the root and survives a navigation and a return visit. The
  choice is stored in a cookie read on the server (**D4**), so the first paint already
  carries the chosen theme; `localStorage` is not used because it renders the light theme
  first and then swaps.

- **S10 — The typed client.** Add `apps/web/src/lib/groups.ts` as the web-side contract
  for the one group read, mirroring `apps/web/src/lib/mods.ts`: the API's field names and
  nullability, a parser that rejects anything else, and no dependency on the server
  environment. The browser calls only the relative `/api/groups/me` with
  `cache: "no-store"`. No client component imports `API_URL`, a Clerk secret or the API
  module.
  The identity read stays on the existing `/api/me`; this slice adds no second identity
  surface.

- **S11 — Server state and the account boundary.** `@tanstack/react-query` is a
  dependency of `apps/web` and no provider exists in `apps/web/src/app/layout.tsx`, so
  nothing is cached today and the account boundary is unproven rather than broken.
  Add the provider and make the boundary explicit: every query key includes the caller's
  identity id, and the cache is cleared when the identity changes or the session ends.
  F1's acceptance criterion — switching accounts never shows the previous person's data —
  is proven by a test that renders the frame as one identity, signs out, renders it as a
  second, and fails if the first person's group name, role or email is reachable. Cover
  the query cache and not only component state, because the query client is the thing
  that outlives a component.

- **S12 — One error surface.** One component renders a failed `/api/*` response as a
  sentence and one `Retry` action, inside the content region, with the bar, the group,
  the account and the context line left in place. It is the artboard's failed-read state.
  Rules: a status code is never rendered, upstream text is never shown, and the sentence
  is fixed per condition — `401` is the signed-out state from S5, `503` is S5's
  configuration state, `502` and `504` each have their own sentence. `Retry` re-runs the
  failed read and nothing else. Later surfaces reuse this component instead of growing
  their own; F4's upstream-failure state stays F4's work.
  The artboard's sentence names the group's mods because the frame there sits over the
  mod browser. In this slice the component takes its subject as a parameter, so the
  shell's own default is neutral and F4 passes its own wording rather than editing this
  component.

- **S13 — Responsive.** Reviewed at 1440x900, 768x1024 and 390x844. Desktop keeps the
  global bar and the left filter column beside the results; the catalog's own `Filters`
  trigger disappears there because the column is always visible. From 768 to 1023 the
  filters open as the approved sheet instead of the column. At phone width the same sheet
  carries the filters, the group entry appears in a strip below the bar containing the
  group only
  and no pending proposals, and the account menu keeps the identity, `Sign out` and the
  group entry, because the approved artboard draws both. Its own annotation records that
  the strip and the menu entry were not reconciled and that the proposal does not choose
  between them; the approval adds the strip to the existing frame and this spec does not
  remove the menu entry the artboard also depicts. The sheet has an accessible name,
  moves focus into it on open, closes on Escape or its close control, returns focus to
  the trigger, and leaves the background unavailable while open; the skip link and
  keyboard navigation are preserved.
  Tablet columns follow the existing catalog, which was verified in code: at 1024–1279
  the row keeps the version and hides category and author; category and author appear
  from 1280. The frozen artboard's written rule says the version is hidden instead; that
  sentence is wrong and is not edited, and this spec records the observed behaviour.
  The artboard draws only 1440 and 390; the intermediate widths were not drawn or
  visually verified and must be verified before delivery without inventing new design
  decisions. No horizontal overflow, overlap or clipping at any of the three widths, in
  either theme.

- **S14 — Accessibility.** A skip link to the content region, a labelled group
  navigation landmark, a labelled account menu with `aria-expanded` and `aria-controls`
  on the chip, visible focus on every control, Escape closing the menu with focus
  returned to the chip, and an axe run with no serious or critical violation. The bar's
  role label is text, not a colour or an icon alone. Light and dark both meet AA
  contrast with the paired surface tokens.
  The two actions in S7 are exposed as unavailable, not as usable controls: they carry
  their unavailable state to assistive technology and a description naming what is
  missing, and neither keyboard activation nor a pointer press produces a visible
  outcome that could be read as success.

- **S15 — Verification, and what it cannot prove today.** Vitest covers the pure parts:
  the redirect guard, the group-response reduction, the initials derivation, and the
  cache boundary from S11. Playwright covers the widths, themes and axe expectations of
  S13 and S14, and `bun run check` plus `bun run test:web` pass.
  Two limits are recorded here so they are not discovered as gaps at delivery:
  - The Playwright harness runs the build with provider credentials cleared
    (`apps/web/playwright.config.ts`). In that configuration `/api/me` answers `503`, so
    the harness can prove the unconfigured state, the bar, the theme, the responsive
    layout and the error surface — not the signed-out prompt, which needs Clerk
    configured and no session.
  - No authenticated journey can be automated: there is no test account (D-F5). The
    signed-in, no-group and account-switch journeys therefore stay component-tested and
    manually compared, and must not be reported as browser-verified.
  The comparison against the frozen reference copy happens at the three viewports, and
  its result is recorded as local evidence, not committed.

- **S16 — No backend change.** Nothing under `apps/api`, `supabase/` or the migrations
  changes. `GET /groups/me` already exists and is documented; the shell consumes it
  through a new web handler.

- **S17 — Existing artifacts this slice changes.** `apps/web/src/app/page.tsx` is a
  development scaffold whose copy two suites assert: `apps/web/e2e/home.spec.ts` and
  `apps/web/tests/page.test.tsx`. If this slice replaces that page, both change in the
  same commit; if it mounts the frame elsewhere, both stay. Neither may be left
  asserting copy the app no longer renders.
  `docs/guides/web-api-transport.md` gains the third handler in its table, and the
  delivery record is written in the same change as the code.

## Tasks

| ID | Specs | Route | Status |
| --- | --- | --- | --- |
| T1 | S1, S2, S3, S10 | delegated (explore) | pending — code map against the decided hosting route |
| T2 | S3, S10, S12 | delegated (worker) | pending — `/api/groups/me`, `lib/groups.ts`, error surface |
| T3 | S4, S5, S6, S7, S8, S9, S13, S14 | delegated (worker) | pending — the frame and its states |
| T4 | S11 | delegated (worker) | pending — provider and the account boundary |
| T5 | S13, S14, S15 | delegated (verify) | pending — viewports, axe, comparison |
| T6 | S15, S17 | inline | pending — checks, records, delivery |

## Acceptance

Observed, not assumed:

1. A signed-in person sees the bar with the group's name, their email, their role and a
   working sign-out. (Blocked for observation: **B4**.)
2. A person with no session who reaches a protected surface stays on that page, sees one
   prompt sentence and a `Sign in` action, and no private value is present in the markup.
3. Choosing that action opens `/sign-in` and, after a successful sign-in, returns to the
   route they attempted.
4. A `redirect_url` pointing outside the origin is refused and lands on `/`.
5. Switching accounts never renders the previous person's group, role or email.
6. A failed group read renders one sentence and a `Retry`, with the bar intact and no
   status code on screen.
7. Signed in without a group, the card renders as the artboard draws it, and neither
   action navigates, issues a request, changes state or reports success.
8. The frame matches the frozen `A2` reference at 1440x900, 768x1024 and 390x844, in
   light and dark.
9. axe reports no serious or critical violation, and `bun run check` and
   `bun run test:web` pass.
10. The catalog renders inside one global bar: no second brand, theme control or header,
    the title and locked context appear once in the frame's context line, filters in the
    left column from 1024 and a sheet below it, and the existing search, the 12
    categories, environment, author, clear and active filters, the five sorts, results,
    selection, load more, the Add to pack footer and its not-connected message all still
    behave as before.
11. At 390 the group strip below the bar shows the group only, with no pending
    proposals; at 1024–1279 the row keeps the version and hides category and author.

Items 1, 3 and 5 need a configured test account; see **B4**.

## Decisions and blockers

Resolve each open item before the named task starts. Nothing below is answered by this
document; an item appears as closed or decided only because the evidence was observed or
the decision was reported together with its author.

Where the decisions come from is part of the record, because they do not share a source.
D3 is a direct authorization from the owner. D1, D2, D4 and D5 were taken by Misato under
a delegation the owner gave her; that delegation is reported to this session but is not
recorded in this repository, so the attribution stops at Misato and is not extended to
the owner.

- **B1 — Design gate: closed on 2026-11-18 with approval `A2`.** `A2` records round `v3`
  on canvas `b2-mods-integration`, direction `A · Shared top bar and left filters`, with
  a frozen read-only reference copy in the workflow's design store: four files at mode
  0444 inside a 0555 directory, sizes matching the canvas, and the manifest declaring
  `a.html` as the approved artboard. A gate check run from the implementer's worktree at
  head `b909903` reports `design_approved` with verdict `PASS` and the mockup intact.
  The approval basis records that the owner gave it in conversation to Rei Ayanami,
  relayed to Misato, with the F1 integration choice relayed in a card, and that the
  owner's visual access to the artboards was not independently confirmed. That limit is
  part of the record and does not widen what the approval authorizes.
  History, kept because it explains the current state: approval `A1` recorded round `v2`,
  direction `b`, earlier the same day, with five 0444 files in a 0555 directory. It
  governed the previous frame and is superseded by `A2` here, not erased.
  Two things this does not change. Each frozen folder holds every artboard of its round —
  `v2` includes the superseded `b.html`; `v3` holds `a.html`, `b.html` and `c.html` — and
  only the direction named by the approval is the reference. And the approval closes the
  design gate; authorisation to implement this slice is the owner's separate 2026-11-18
  decision recorded in L6, not the approval itself.
- **B2 — Checkout base: resolved for the implementer on 2026-11-18.** The
  implementer's branch was cut from `99ee7aa`, the same commit as `main` then, so it
  carries `f5aca61` — the 2026-11-17 group-scoped scope and the F1 signed-out
  clarification — and the gate check reports head `b909903`, the app-shell implementation
  commit. The other worktrees still sit at `98b1d6d`; that matters only if another task
  is picked up from one of them, which must then be synced first. The uncommitted
  `apps/web/package.json` and `bun.lock` remain local to the main checkout and unrelated
  to this slice.
  The spec revision this entry describes is mirrored into that worktree as an untracked
  file, because the design-gate parser reads `odd/tasks/app-shell.md` from the checkout it
  runs in.
- **B3 — The design reference is absent from worktrees.** `design/` is ignored through
  `.git/info/exclude` and exists only in the main checkout. Follow the precedent the mod
  browser recorded: keep the artboards in the main checkout and give the branch worktree
  a symlink `design/b2-mods-integration` to the main checkout's folder, then run the
  design tooling from the worktree. The implementer's worktree already carries that
  symlink, next to the earlier `design/app-shell` one.
  One exception, verified in the workflow code: the approval step refuses to freeze a
  source directory that is a symlink. Approving therefore runs from the main checkout,
  where `design/b2-mods-integration` is a real directory; the symlink is only for the
  branch worktree the implementer works in.
  The frozen copy lives in the workflow's own design store, not in `design/`, so
  comparison uses the store path for the approved bytes and the main checkout for the
  manifest and the other variants.
- **B4 — No authenticated proof.** D-F5 is open; no test account exists, and the
  Playwright harness runs with provider credentials cleared. Acceptance items 1, 3 and 5
  cannot be observed until that changes.
- **D1 — Which route hosts the frame: decided 2026-11-18.** The frame mounts on `/mods`,
  leaving that screen's behaviour unchanged. The screen's composition is the integration
  approved later the same day (**S1**, **S2**); the route and the behaviour are D1's part.
  F3 owns the first group route and F1's landing target, so no `/g/...` route is created
  here.
  The alternative is recorded as not chosen: a dedicated `/app` landing with no product
  content, which would add a route and an empty screen.
- **D2 — The `Pending proposals` entry: decided 2026-11-18.** It is not rendered, exactly
  as S4 already specifies: its page and its read do not exist, and an unavailable
  destination is absent rather than a disabled promise. The navigation stays written as
  an entry container so F7 adds the entry without restructuring the bar.
  The alternative is recorded as not chosen: render the entry inert.
- **D3 — The no-group card: decided 2026-11-18.** The owner decided this one directly.
  The frame renders the card as the artboard draws it, with `Create a group` and
  `Open a link` present and inert until F3 delivers those pages. The behaviour that makes
  it honest is specified in S7: no navigation, no request, no state change, no spinner,
  no success message and no link to a missing route.
  The alternative is recorded as not chosen: the frame would show only the `No group`
  label and leave the whole card to F3, which is closer to the absent-not-disabled rule
  but departs from the approved artboard.
- **D4 — Theme persistence: decided 2026-11-18.** A cookie read on the server, so the
  first paint is already in the chosen theme.
  The alternative is recorded as not chosen: `localStorage`, which renders the light
  theme first and then swaps.
- **D5 — Initials source: decided 2026-11-18.** Derived from the email local part as S3
  describes, replaced by the username when F2 delivers it. An email-derived monogram is
  accepted for the interval.
- **D6 — The phone Load more vertical offset: accepted 2026-11-18.** At 390 px wide the
  Load more control and its caption sit lower than in the `A2` reference. The QA
  revalidation of `114a404` reported this as the only visual discrepancy left, and the
  owner accepted it through a card in Rei Ayanami's conversation, relayed to this
  document the same day.
  Measurement taken from the QA screenshots retained in the QA worktree under
  `qa-evidence/` (implementation 390x844, reference 390x845, both captured from the top
  of the page): the caption's text occupies rows 671-683 against 670-682, and the button
  box starts at `y` 695 against 693, with its painted background beginning at row 696
  against 694. Both painted backgrounds end at row 731, so the control is the same 38 px
  high and the same 96 px wide: the reference paints its background under a 1 px
  transparent border and the implementation clips it to the padding box, which accounts
  for the two-row difference in the painted background. The discrepancy is therefore
  vertical placement, not control size. The search field's top edge measures `y` 170
  against 171, so the displacement accumulates down the page rather than being a constant
  shift.
  The acceptance covers that vertical offset at this viewport and nothing else. It does
  not cover acceptance items 1, 3 and 5, which stay unobserved while **B4** is open, and
  it authorizes no merge, push, release, deployment or task closure.
  The alternative is recorded as not chosen: re-space the block to the pixel, which would
  change a measured, working component for a difference the owner accepted.

## Log

- L1 (2026-11-18): specification written from the approved sources listed above, after
  confirming that no `odd/tasks/app-shell.md` exists in the main checkout or in any
  worktree, so nothing is overwritten. Read-only inspection of the roadmap, the handoff,
  the approved artboard, the API reference, the transport guide, the tooling guide,
  `apps/web/src`, the API router composition and the existing suites. No code, test,
  migration, configuration, commit, push, publication or deployment is part of this
  change.
- L2 (2026-11-18): the spec format follows the design-gate parser, which counts bullets
  written as `- **S<n> ` and reads the document from `odd/tasks/<task>.md` in the
  checkout it runs in. Writing the specs as headings would have left the gate reporting
  no task document despite the file existing, so every spec is a bullet.
- L3 (2026-11-18): two facts found by inspection and not previously written down. The
  Playwright harness answers `503` rather than `401`, so the signed-out prompt is not
  reachable in it. And every worktree predates the 2026-11-17 scope commit.
- L4 (2026-11-18): the approval step and the reference symlink cannot share a checkout.
  The freeze walks the source directory and refuses a symlink, so `approve` has to run
  from the main checkout while the branch worktree keeps the symlink. Both facts come
  from the workflow's own code, not from a convention.
- L5 (2026-11-18): B1 updated after verifying the approval rather than taking it on
  report. Approval `A1` for round `v2`, direction `b`, is recorded with a frozen copy of
  five 0444 files in a 0555 directory whose sizes match the canvas, and a gate check run
  from the implementer's worktree returns `design_approved`, `PASS`, mockup intact. Only
  the gate state changed: S2-S17, the acceptance criteria, B2-B4 and D1-D5 are as
  written, and the approval is not treated as authorization to implement. The frozen
  folder also contains the superseded `b.html`, so that distinction is recorded in B1.
- L6 (2026-11-18): the owner authorized the implementation of this slice and decided D3
  in favour of the card as the artboard draws it, with both actions present and inert.
  S7 now states that behaviour, S14 and acceptance item 7 make it observable, and D3
  records the decision with the alternative that was not chosen. The authorization is
  limited to implementing the slice: publication, merge and deployment are not part of
  it. No other open decision was answered, and D1, D2, D4, D5 and B3-B4 stay as written.
- L7 (2026-11-18): B2 corrected against the checkouts rather than the earlier report.
  The implementer's worktree is now at `99ee7aa`, equal to `main`, and the gate check
  reports that head; the other eight worktrees remain at `98b1d6d`. The dirty
  `apps/web/package.json` and `bun.lock` stay local to the main checkout.
- L8 (2026-11-18): D1, D2, D4 and D5 recorded as decided by Misato under a delegation the
  owner gave her. The delegation is reported to this session and is not recorded in this
  repository, so the attribution stops at Misato; D3 stays attributed to the owner
  directly. Effects on the specs: S1 names `/mods` as the hosting route, S9 names a
  server-read cookie as the storage, S4 already matched D2 and is unchanged, and S3
  already derived the initials from the email so D5 confirms it. The rejected
  alternatives stay recorded for each. B3 and B4 remain open.
- L9 (2026-11-18): the owner approved direction A of the B2 and mods integration and chose
  F1 as the slice that registers and implements it now. Approval `A2` was verified in the
  workflow's approval store rather than taken on report: task `app-shell`, round `v3`,
  canvas `b2-mods-integration`, direction `A · Shared top bar and left filters`, frozen
  four 0444 files in a 0555 directory with sizes equal to the canvas, and a gate check run
  from the implementer's worktree reports `design_approved` `PASS` at `b909903` with the
  mockup intact. Effects: S1 adds the approved integration of the existing catalog to the
  scope without adding catalog behaviour; S2 names `a.html` of `v3` as the reference and
  keeps `A1`/`v2` as history; S4 states one global bar, that the filter column is content
  and not navigation, and that the phone strip holds the group only; S13 records the phone
  strip, the 768–1023 filter sheet and the verified 1024–1279 columns; acceptance items 8,
  10 and 11 make the integration observable; B1, B2 and B3 were updated to the current
  evidence. The frozen artboard draws both the phone strip and a group entry in the account
  menu, and its annotation says the two were not reconciled; the spec records both rather
  than choosing, so no navigation is removed without a new decision. Two limits recorded
  rather than glossed: the approval basis says the owner's
  visual access was not independently confirmed, and the frozen artboard's written tablet
  rule wrongly hides the version — the verified catalog keeps the version and hides
  category and author below 1280, so S13 records that and the frozen artboard was not
  edited. Tablet and intermediate widths were not drawn or visually verified. This change
  touches documentation only: no code, test, design file, gate, commit, push, merge,
  publication or deployment. The revision is mirrored uncommitted into the implementer's
  worktree because the gate reads the task document from the checkout it runs in.
- L10 (2026-11-18): the QA revalidation of `114a404` was reported by Asuka and relayed
  by Rei, not run by the document's author. What the report states: the load-more control
  is visible and works on desktop, the phone sort control measures the 116 px the
  reference draws, and 36 browser checks pass. The only visual discrepancy reported is
  the phone vertical offset, which the owner accepted; D6 records it. The measurement
  taken from the QA screenshots in the `asuka-114a404` worktree confirms a 1 px caption
  offset and a 2 px offset at the button's top edge, with no difference in the control's
  size. Not observed and not claimed: the authenticated flows behind acceptance items 1,
  3 and 5, because **B4** is still open, and the real backend, because the browser checks
  ran against mocked data. No merge, push, release, deployment or task closure was
  requested or performed, and the board item stays in `Backlog`. This revision is
  mirrored uncommitted into the implementer's worktree because the gate reads the task
  document from the checkout it runs in.
