# Mod browser screen

Branch `feat/mod-browser`, cut from `origin/main` at `aad3ae3` in its own worktree.
Delivery strategy: `ask-on-risk`. Test runners: `bun test` for `apps/api` and root
`tests/`, Vitest for `apps/web`, Playwright for browser checks.

Objective: design, get approved and implement the screen where an owner browses the
Modrinth catalog to choose mods for the current pack.

## Specs

- **S1 — Screen scope.** A browse screen that searches the catalog for mods compatible
  with the pack's locked settings and lets the owner inspect and select one. Text query,
  category, environment and author facets, and sort are interactive. Results are paged by
  the API, 20 per page. Adding the selected mod to the pack is represented in the design;
  its wiring is a later task.
- **S2 — API contract.** `GET /mods` accepts `query`, `gameVersion`, `loader`, `offset`,
  `sort`, `category`, `environment` and `author`, and rejects unknown query parameters
  with 400. `sort` is one of `relevance`, `downloads`, `follows`, `newest`, `updated`.
  The response is `{ hits, total, offset }`. The API sends no CORS headers, so the browser
  reaches it through a server route handler under `apps/web/src/app/api/`, following the
  `/api/me` precedent (`src/lib/identity.ts`): `no-store`, a 5-second abort and a JSON
  `{ error }` on failure.
  Each hit is a `ModSummary`: `projectId`, `slug`, `title`, `description`, `iconUrl`,
  `downloads`, `follows`, `author`, `categories`, `clientSide`, `serverSide`,
  `latestVersion`. `GET /mods/:idOrSlug` returns one summary, 404 for a missing or non-mod
  project, 502 when upstream fails. Version and loader are required and scope every query
  as facets; they are the pack's own settings and are not free selectors in this screen.
- **S3 — Visual system.** `apps/web/DESIGN.md` governs every visual decision: its colour,
  typography and shape rules are binding, and the token values in
  `apps/web/src/app/globals.css` are their machine form. One copper primary action per view;
  no third hue family and no status colours beyond `destructive`; text always uses the
  foreground of its own surface; `border`/`input` stay hairlines and never carry meaning or
  serve as the only focus/error signal; one type family with at most two weights per view and
  no uppercase running text; controls at the `lg` radius with compact chips stepping down to
  `md`/`sm`; a left rail uses the `sidebar` tokens so it reads as an adjacent surface. Light
  is the working default; the preferred direction also renders in dark using the documented
  dark token values, applied once at the root and never per surface. shadcn/ui and Tailwind
  only.
- **S4 — Three directions.** Round `v1` in Design Canvas shows exactly three variants that
  differ in composition, layout and hierarchy, not colour. The canvas follows
  `design/README.md`: `design/mod-browser/design.json` is the manifest (`version`, `title`,
  `kind`, `description`, `artboards` with `id`, `title`, `file`, `width`, `height`, `group`),
  `design/canvas.json` marks the workspace, every artboard is one self-contained offline HTML
  page with `data-dc-id` on everything the owner may comment on, and no network resource is
  referenced. Artboards are never committed.
- **S5 — States.** Every direction represents: initial loading skeleton, no results for the
  active filters, the upstream-failure message, end of results, selected/added feedback and
  an icon fallback for a missing `iconUrl`. Nulls inside a summary render without breaking
  the row.
- **S6 — Responsive.** Reviewed at 1440x900, 768x1024 and 390x844. No overflow, overlap or
  clipping; the facet surface becomes reachable on a small screen.
- **S7 — Accessibility.** Labelled controls, visible focus, AA contrast, correct list/grid
  semantics and an axe run with no serious or critical violation.
- **S8 — Gates.** Implementation starts only after an explicit approval that names one
  variant. `impl`, `qa` and `delivery` gates record observed evidence. Mockups, approvals
  and screenshots stay local and never enter a commit.
- **S9 — Deferred decisions.** The data source for Minecraft/loader option lists, the
  exact-version picker and caller-selected page size remain undecided product questions.
  This screen neither answers them nor blocks on them. No web state holds the pack's
  `gameVersion` and `loader` today; the design shows them as supplied context, and the
  implementation source is decided with the implementation task, not invented here.
- **S10 — No backend change.** Nothing under `apps/api`, `supabase/` or the migrations
  changes.
- **S11 — Web integration contract.** `GET /api/mods` is a server route handler that proxies
  `GET /mods` following the `/api/me` idiom (`no-store`, 5-second abort, `{ error }` JSON,
  only the eight allowed parameters forwarded after local validation). `ModSummary` is
  redeclared in `apps/web/src/lib/mods.ts` with the exact API field names and nullability. The
  browse route is `/mods` and reads `gameVersion` and `loader` from its own search parameters,
  defaulting to `1.21.1` and `fabric`, then renders them as the locked context chips; no pack
  state is invented and no draft is read or written. The primary action is enabled only with a
  selection, and reports through the footer's existing status slot that pack editing is not
  connected yet; it never writes a draft.
- **S12 — Verification for the slice.** Vitest covers the pure parts: parameter building,
  count formatting and null handling. Playwright covers `/mods` at 1440x900, 768x1024 and
  390x844 in both themes, with an axe run that reports no serious or critical violation.
  `bun run check` and `bun run test:web` pass, and the implementation is compared against the
  frozen reference copy at the same three viewports.

## Tasks

| ID | Specs | Route | Status |
| --- | --- | --- | --- |
| T1 | S1, S2, S3 | delegated (explore) | pending — technical code map |
| T2 | S4, S5, S6 | delegated (worker) | pending — round v1, three artboards |
| T3 | S4, S6, S7 | delegated (verify) | pending — inspect the three variants |
| T4 | S8 | inline | pending — owner approval |
| T5 | S1, S2, S3, S5, S7 | delegated (worker) | pending — implement the approved variant |
| T6 | S6, S7, S8 | delegated (verify) | pending — implementation, qa and delivery gates |

## Log

- L1 (2026-11-14): the owner asked to design the mod browser screen and to do the work on
  an isolated branch. The branch and worktree were created from `origin/main` at
  `aad3ae3`, which already carries the web stack, the Copper Workshop tokens, the sign-in
  screen and the Clerk proxy fix.
- L2 (2026-11-14): the earlier scope note stands — this repository's completion plan
  records the mod browser as missing web wiring over a merged API (`GET /mods` and
  `GET /mods/:idOrSlug`, M3). No endpoint changes are needed for this screen.
- L3 (2026-11-14): references gathered. 21st.dev supplied a list-view page header with
  search, sort and view toggle; an animated active-filter chip bar with remove and
  clear-all; a facet chip group with overflow; and a minimal dropdown filter row. The
  Lazyweb inspiration library returned no browsable examples for its filters-and-sorting
  category, so it contributes no visual reference. The Awwwards element corpus is retired
  and returned no results.
- L4 (2026-11-14): interpretation. Because the API scopes every search to the pack's
  version and loader, the screen presents them as fixed, non-interactive context beside
  active filters; the interactive facets are category, environment, author, sort and the
  text query. This keeps the unresolved selector-data decision out of the design.
- L5 (2026-11-14): the technical map corrected S2 and S9. The query parameter is
  `gameVersion`, and the API sends no CORS headers, so the web must proxy through a server
  route handler as `/api/me` already does. Two facts constrain the later implementation:
  `ModSummary` is declared only in the API and must be redeclared for the web, and no web
  state holds the pack's `gameVersion` or `loader`. Neither fact changes the design round.
- L6 (2026-11-14): the first design delegation was cancelled before writing anything because
  its brief omitted the governing design document. `apps/web/DESIGN.md` existed only as an
  uncommitted file in the previous worktree, so cutting this branch from `origin/main` left
  the design authority out of the tree. The document is now present in this worktree as an
  untracked file, S3 and S4 name it as binding, and the canvas contract in `design/README.md`
  is part of S4. Two consequences for the round: the single copper action, the absence of a
  third hue or extra status colours, paired surface/foreground text, hairline borders, the
  one-family type scale and the `sidebar` tokens for a left rail are hard requirements, not
  preferences.
- L7 (2026-11-14): L3 is corrected. Lazyweb was under-queried, not empty: an abstract
  "best UI patterns" query returns research articles, while a flow-shaped query returns its
  Flow Library. Three references exist and were read as descriptions, not images:
  Fashionphile's designer browse and filter flow (results view, then condition/type/price
  filters), Acadex's filter-modules flow (filter selections plus separate empty states for
  on-track, at-risk and completed work) and Backmarket's Discover flow (category browsing,
  category selection, then product listings). Their screen images sit behind a free signup,
  and the Inspiration Library's filters-and-sorting category is gated the same way. The one
  pattern this changes: a result area needs distinct empty states for "nothing matched" and
  "filters are too narrow". Verify checks that expectation against the three directions.
- L8 (2026-11-14): artifact ownership was corrected. The canvas manifest and the round record
  had been written by the direction-A worker, while the workflow contract assigns both to the
  orchestrator and forbids a worker from writing them. The orchestrator rewrote both files
  with the same verified content, the manifest still resolves all three artboards, the round
  record still declares three variants, and the CLI reports `design_options` with `v1`
  pending approval. Two sentences in `references/workflow-contract.md` that described the
  round file and the manifest without naming a writer now name the orchestrator.
- L9 (2026-11-14): the artboards were invisible to the Design canvas because they had been
  written inside the isolated worktree, while the canvas indexes `design/` in the workspace
  the session is rooted at (the main checkout). They now live in the main workspace under
  `design/mod-browser/`, which stays git-ignored, and the branch worktree holds a symlink to
  that folder so the workflow CLI, which needs the ODD document and the artboards in one tree,
  validates the round. Operational rule: run the workflow CLI from the branch worktree. The
  manifest also dropped the fixed 900px height, because each artboard carries the state
  specimens below its 1440x900 composition and a fixed frame hid them from review.
- L10 (2026-11-14): `main` moved to `afea8bf` while this round was in progress and now carries
  `apps/web/DESIGN.md` as a tracked file (PR #80). This branch fast-forwarded to that commit
  and the untracked copy used earlier was removed, so the design authority is tracked rather
  than duplicated.
- L11 (2026-11-14): the owner named direction A as the preferred visual and asked for a dark
  theme of it plus a verification pass. A stated preference is not an approval: no approval is
  recorded, the round stays in `design_options`, and implementation still waits for an explicit
  approval that names the variant. The dark theme is treated as a correction inside round v1,
  limited to direction A, and must use the dark values documented in `apps/web/DESIGN.md` at a
  single root scope with the composition, layout and copy unchanged.
- L12 (2026-11-14): verification of direction A returned FAIL on one item and ten advisories.
  The blocker was the theme toggle's focus ring being copper. It is a defect of the
  orchestrator brief, not of the artboard: the `ring` token is copper in both themes by
  DESIGN.md, and the existing sign-in page already focuses with `outline-primary`, so a copper
  focus ring is the product idiom. The one-copper rule governs action fills, not focus
  indicators; a non-copper ring would require a new token, which is a design-system change and
  not part of this round. No correction is sent and the blocker is withdrawn with that reason.
  Observed on the corrected artboard: 25 of 25 dark tokens match the Themes table, zero text
  pairs below 4.5:1 in either theme (lowest 4.92 light, 6.95 dark, both the copper action),
  exactly one primary fill per view in both themes, no horizontal overflow at 1440, 768 or 390,
  a pixel-identical light round-trip, and axe with no serious or critical violation. Advisories
  recorded: a single empty state without the narrow-filters distinction from L7, a moderate
  `landmark-unique` from the always-rendered sheet specimen, three duplicated colour literals
  outside the token scopes, and a pre-existing scroll-edge fade. The round stays in
  `design_options`; no approval is recorded.
- L13 (2026-11-14): approval `A1` was recorded through the CLI for round `v1`, direction A
  with light and dark, with the reference copy frozen read-only. The owner explicitly approved
  the implementation. Two integration questions the design left open are decided here so the
  implementation does not invent product state: the browse route takes `gameVersion` and
  `loader` from its own search parameters with `1.21.1` and `fabric` as defaults, and the
  primary action reports that pack editing is not connected instead of writing a draft. Both
  are recorded as S11 and are reversible once pack state exists on the web.
