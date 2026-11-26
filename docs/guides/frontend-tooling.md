# Frontend tooling

Status: delivered on 2026-11-14 through PR #73 (stack), PR #74 (test harness),
PR #75 (tokens) and PR #76 (sign-in screen). The frontend workflow below still
requires an approved mockup before any screen work starts.

## Package manager and scope

`bun` 1.4.4 stays the only package manager and `apps/*` the only workspace layout.
Most dependencies were added to `apps/web` with `bun add --exact`; `radix-ui`,
`tw-animate-css` and `shadcn` carry caret ranges because the CLI installed them that
way. `apps/api`, `supabase/` and the migrations were not modified.

## Installed dependencies

| Purpose | Packages |
| --- | --- |
| Accessible component base | `shadcn` (CLI and theme), `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `cn` |
| Icons | `lucide-react` |
| Forms and validation | `react-hook-form`, `zod`, `@hookform/resolvers` |
| Server state | `@tanstack/react-query` |
| Component tests | `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitest/coverage-v8` |
| Browser tests and accessibility | `@playwright/test`, `@axe-core/playwright` |
| Performance | `@lhci/cli` |

`Playwright MCP` is deliberately not installed. Playwright is used as a test runner
only, and the Next DevTools server already provides the `agent-browser` bridge.

## shadcn/ui configuration

`apps/web/components.json` records style `radix-nova`, `tsx`, `rsc`, the
`neutral` base colour, CSS variables and the `lucide` icon library. Aliases map
`@/…` to `src/…`; `apps/web/tsconfig.json` declares `paths` without `baseUrl`,
which TypeScript 7 removed.

Two generated changes were reverted or corrected, and both are deliberate:

- The initializer added `Geist` from `next/font/google` to `layout.tsx`. This Next
  build does not export `Geist` from that module, and the import broke a pinned web
  test. The layout keeps its current typography.
- The generated theme set `--font-sans: var(--font-sans)`, which is circular. It now
  names the Tailwind default sans stack, so `font-sans` keeps behaving as before.

`src/lib/utils.ts` and `src/components/ui/button.tsx` are the generated source files
that shipped. The theme values were later replaced by the approved Copper Workshop
palette, recorded in the tracked `apps/web/DESIGN.md`.

## Test runners

Two runners are intentional and the boundary is enforced by configuration:

| Area | Runner | Command |
| --- | --- | --- |
| `apps/api`, root `tests/`, `scripts/tests/`, `apps/web/tests/*.test.ts(x)` | `bun test` | `bun run test` |
| `apps/web` component and hook tests (`tests/ui`, `tests/lib`) | Vitest + React Testing Library | `bun run test:web` |
| `apps/web` browser tests (`e2e`) | Playwright | `bun run test:e2e` |
| `apps/web` authenticated browser journeys (`e2e/authenticated`) | Playwright with `@clerk/testing` | `bun run test:e2e:auth` |

`apps/web/tests/*.test.ts(x)` stay on `bun:test`. Their assertions depend on
Bun-native globals: one test spawns a fixture with `Bun.spawnSync`, and another
compares against a `DOMException` that is an `instanceof Error` under Bun and Node
but not under jsdom. Moving them to jsdom changed what the suite proved, so Vitest
owns only `tests/ui/` and `tests/lib/`.

`bunfig.toml` lists `apps/web/tests/ui`, `apps/web/tests/lib` and `apps/web/e2e` in
`[test] pathIgnorePatterns`. Bun's runner therefore keeps running every Bun suite,
including the web ones, without tripping over files that import another runner.

`bun run check` runs both typechecks, the lint, every Bun suite and the Vitest
suites. Each runner executes once per CI run: `bun test` for the Bun suites and
`bun run test:web` for the Vitest suites, so a failing component test names its own
step instead of hiding inside the Bun gate.

## CI workflows

Three workflows split the gate by the surface each one owns. None repeats another's
commands, so a pull request pays for every check once.

| Workflow | Job | Commands | Trigger |
| --- | --- | --- | --- |
| `Frontend CI` | Web checks | `bun run lint`, the web typecheck, `bun run test:web`, `build:public` | every pull request and push to `main` |
| `Frontend CI` | Browser journeys | `playwright install --with-deps chromium`, `bun run test:e2e` | every pull request and push to `main` |
| `Frontend CI` | Lighthouse | `bun run --filter @modpack/web audit` | push to `main` and manual dispatch |
| `Backend CI` | Backend checks | API typecheck, `bun test`, `db:test:upgrade` | every pull request and push to `main` |
| `Database CI` | Database checks | `db:start`, `db:test`, `db:test:concurrency`, `db:test:postgrest`, `db:stop` | every pull request and push to `main` |

The browser install runs from the workspace binary
(`./node_modules/.bin/playwright install --with-deps chromium`) rather than through
`bunx`, so the browser version matches the pinned Playwright dependency. Local
`bunx playwright install chromium` remains enough for a one-off setup.

`bun test` stays in `Backend CI` because Bun is one runner across the repository: it
also executes the `apps/web/tests/*.test.ts(x)` cases that need Bun-native globals.
Splitting that command by path would make a new test file easy to forget, so the
shared runner reports under a broader name instead.

Lighthouse gates `main` rather than pull requests. Accessibility is an error-level
assertion and the per-pull-request accessibility gate is the axe scan inside the
browser journeys; performance varies between runs, so gating every pull request on it
would fail on noise.

## Lint

`bun run lint` runs Biome over `apps/web`: one development dependency, no plugin graph
and no formatter, so the gate arrived without a repository-wide rewrite.
`bun run lint:fix` applies the automatic fixes locally and never runs in CI.

`biome.json` scopes the linter to `apps/web/src`, `apps/web/tests` and `apps/web/e2e`
and skips CSS, because Biome's CSS parser rejects Tailwind 4 directives such as
`@theme` and `globals.css` belongs to the PostCSS build. `apps/api` is outside the
linter and needs its own slice.

A rule that fires on purpose carries an inline
`// biome-ignore lint/<group>/<rule>: <reason>` at the line instead of a switch in the
config. The two `role="group"` containers in the mod browser keep their element
because a `<fieldset>` would add a border and a minimum width to a layout an approved
design round froze, and the control-character pattern in `src/lib/mods.ts` exists to
reject exactly those characters.

## Playwright

`apps/web/playwright.config.ts` drives `http://localhost:3000` and never
`127.0.0.1`, because Next 16 does not serve its development resources to that host.

The web server is built and started with the provider credentials cleared, which is
the same configuration the Backend CI build gate uses. The original reason was a
defect: with a configured Clerk instance every routed request re-entered the proxy
until the 30 second proxy timeout and answered `500`. That loop is fixed in
[doc14](../delivery/doc14-clerk-proxy-loop.md); the credentials stay cleared because
the public journeys need no account, and clearing them keeps CI free of provider
secrets even when a developer has an `apps/web/.env`.

`bun run test:e2e:auth` is the second mode. It creates one throwaway `+clerk_test`
account in a Clerk development instance, signs in through `@clerk/testing`, runs the
journeys under `apps/web/e2e/authenticated`, and deletes the account afterwards. It
also starts the API, because those journeys reach it. It is owner-run and local: it is
not a CI gate and it is not part of `bun run test:e2e`. Decision and guards in
[ADR0007](../decisions/0007-authenticated-e2e-account.md), evidence in
[doc27](../delivery/doc27-authenticated-e2e.md).

Chromium was installed once with `bunx playwright install chromium` into the
Playwright browser cache. No system Chrome is installed. In CI the browser job installs
it on every run with `bunx playwright install --with-deps chromium`, so the journeys and
their axe scans execute on each pull request.

## Lighthouse CI

`apps/web/lighthouserc.cjs` audits the public page at desktop preset and asserts
accessibility as an error and performance, best practices and SEO as warnings. It
resolves `CHROME_PATH` from the Playwright browser cache when the variable is not
set, and clears the provider credentials because no test session is available.

The audit runs in the `Lighthouse` job on pushes to `main` and on manual dispatch, not
on pull requests; the per-pull-request accessibility gate is the axe scan inside the
browser journeys.

Observed categories on the public page on 2026-11-16, with Bun 1.4.4: performance 100,
accessibility 100, best practices 96, SEO 100.

## Commands

| Command | Effect |
| --- | --- |
| `bun run check` | Typechecks, lint, and every Bun and Vitest suite |
| `bun run lint` | Biome over `apps/web` |
| `bun run lint:fix` | Biome with the automatic fixes applied, local use only |
| `bun run test` | Bun suites only |
| `bun run test:web` | Vitest suites only |
| `bun run test:e2e` | Playwright plus axe-core, from `apps/web`, provider credentials cleared |
| `bun run test:e2e:auth` | The authenticated journeys: creates and deletes one throwaway account, local and on demand |
| `bun run --filter @modpack/web audit` | Keyless build, then Lighthouse CI |
| `bun run --filter @modpack/web build:public` | Build without provider credentials |

## MCP servers

| Server | Endpoint | State |
| --- | --- | --- |
| `lazyweb` | `https://www.lazyweb.com/mcp/public` | connected, no account and no key |
| `21st` | `https://21st.dev/api/mcp` | configured; needs a sign-in before it connects |
| `penpot` | `https://design.penpot.app/mcp/stream?userToken=…` | connected; outside the screen workflow |

`lazyweb` uses the keyless public discovery endpoint because the product endpoint
answers `401`. The authenticated endpoint is recorded as an upgrade path only.

`21st` is configured with OAuth, which the server advertises through
`/.well-known/oauth-protected-resource`, so no API key is stored in any file.
Sign in through `/mcps` and then select `21st`. Free tier: search and logo search
are unlimited, and component code retrieval allows 2 retrievals per day across web,
MCP and CLI. Inspect previews before spending a retrieval.

Configuration lives in the global OpenCode configuration, not in the repository,
because these are personal research servers. `penpot` stays connected but the screen
workflow below does not use it.

## Workflow of record

1. Research with `lazyweb` and `21st`.
2. Produce three directions in Paseo Design Canvas, following the local supervised
   frontend workflow.
3. Get owner approval of one direction for the current round.
4. Implement the approved composition with shadcn/ui and Radix primitives.
5. Validate with Agent Browser for interactive inspection, Playwright for behaviour,
   axe-core for accessibility and Lighthouse CI for performance.

A screen is not implemented before its mockup is approved, and the approved mockup
stays immutable during implementation. The workflow state lives outside the
repository.
