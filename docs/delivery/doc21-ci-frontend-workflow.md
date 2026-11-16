# doc21: Frontend CI workflow and the web linter

Date: 2026-11-16
Scope: delivery configuration, one repository development dependency, and the
documentation that described the gate. No application contract, API, database,
migration or runtime dependency change. Four source files in `apps/web` carry a
documented suppression or a one-attribute fix.
Baseline: `main` at `2ceac19`, after the dedicated web test step landed
([doc20](doc20-ci-web-suites.md)).

## Objective

One workflow named `Backend CI` was gating the whole repository: it typechecked both
workspaces, built the web app and ran the web component suites. Two consequences
followed. A frontend failure reported under a backend name, and the two checks that
only a browser can make — the Playwright journeys with their axe scans, and the
Lighthouse audit — never ran on a pull request, although the
[frontend roadmap](../plans/frontend-roadmap.md) makes a Playwright test per journey
an acceptance criterion and makes accessibility a cross-cutting one.

There was also no linter anywhere in the repository. React hook rules, JSX
accessibility attributes and Next-specific markup rules are exactly the class of
defect a typecheck cannot see.

## Decisions

- **Two workflows, each owning one app.** `.github/workflows/frontend-ci.yml` owns
  `apps/web`; `.github/workflows/backend-ci.yml` keeps the API, the Bun suites and the
  disposable-PostgreSQL upgrade test. Neither runs the other's app-specific checks, so
  no command executes twice per pull request.
- **`bun test` stays in one job.** Bun is one runner across the repository, including
  the `apps/web/tests/*.test.ts(x)` cases that need Bun-native globals. The command
  runs unchanged in the backend job rather than being split by path, because a path
  list that goes stale would silently stop running a new test file, while a shared
  runner only reports under a broader step name.
- **Lighthouse gates `main`, not pull requests.** Accessibility is already an error-level
  assertion, and the per-PR accessibility gate is the axe scan inside the browser
  journeys. Performance figures move between runs, so a pull-request gate on them
  would fail on noise. The audit therefore runs on pushes to `main` and on manual
  dispatch.
- **Biome as the linter.** One development dependency, no plugin graph and no
  reformatting: the formatter stays disabled so the change adds a lint gate without
  rewriting the codebase. ESLint with `eslint-config-next` would add the Next-specific
  rules too; those stay an option, not a requirement, and the lint step is the seam
  where either runner fits.
- **CSS is outside the linter.** Biome's CSS parser rejects Tailwind 4 directives such
  as `@theme`, so `globals.css` stays under the PostCSS build rather than being
  half-parsed by a linter that cannot read it.

## Changes

- `.github/workflows/frontend-ci.yml` — three jobs. `Web checks` runs the lint, the
  web typecheck, Vitest and the credential-free build. `Browser journeys` installs
  Chromium and runs the Playwright suite with its axe scans. `Lighthouse` audits the
  public page on `main`.
- `.github/workflows/backend-ci.yml` — the web build and the web component step move
  out; the typecheck narrows to `@modpack/api`; `bun test` and the upgrade test stay.
- `biome.json`, `package.json` and `bun.lock` — the linter, its pinned version and the
  `lint`, `lint:fix` scripts. `bun run check` now includes the lint.
- `apps/web/src/components/auth-controls.tsx` — the account-creation button gains
  `type="button"`, so it cannot act as a submit control if it is ever rendered inside
  a form.
- `apps/web/src/components/mod-browser.tsx` — four documented suppressions: the two
  `role="group"` containers keep their element because a `<fieldset>` adds its own
  border and minimum width inside a layout an approved design round froze; the
  fixed-length skeleton keeps its index key; and the retry effect keeps `retryToken`
  as a trigger, which the effect reads nowhere on purpose. The dead
  `eslint-disable-next-line` on the catalog icon becomes the equivalent Biome
  suppression with the same reason.
- `apps/web/src/lib/mods.ts` — the control-character pattern is the rule's exact
  subject, so it carries a suppression instead of a rewrite.
- `apps/web/tests/**` — two file-level suppressions for test-local components, which
  are the fixture and the assertion themselves, plus a missing `type` on a stub
  button. `apps/web/src/components/ui/button.tsx` narrows one import to a type-only
  import.

## Verification

Local, on the branch, 2026-11-16, with Bun 1.4.4 and Node 22:

- `bun run lint` — exit code 0 with no diagnostics.
- `bun run typecheck` — both workspaces exit 0.
- `bun test` — 196 tests across 28 files, 3216 assertions, exit code 0.
- `bun run test:web` — 5 files, 81 tests, exit code 0.
- `bun run --filter @modpack/web build:public` — exit code 0.
- `bun run test:e2e` — 29 browser cases passed, exit code 0, including three axe runs.
- `bun run --filter @modpack/web audit` — exit code 0. Categories on the public page:
  performance 100, accessibility 100, best practices 96, SEO 100.
- Both workflow files were parsed as YAML and read back for indentation, permissions,
  pinned action SHAs and step order.

Not observed: a GitHub Actions run of either workflow. GitHub executes workflow files
only on a push or a pull request, so the first run of this branch provides that
evidence and this record does not claim it.

Observed on pull request #115, 2026-11-16, after the run-and-fix cycle recorded under
Correction below: `Frontend CI` green with `Web checks` in 33 s and `Browser journeys`
in 93 s, and `Backend CI` green in 34 s. The `Lighthouse` job is skipped there by
design, so its first real execution is still owed by the next push to `main`.

## Accepted differences and advisories

- The browser and Lighthouse jobs each install Chromium and install the workspace
  again. That costs roughly a minute per job and buys parallel jobs with separate
  failure attribution. Caching was not added because a cache action would be a third
  third-party action to pin.
- The Playwright job builds the app for its own server and the Lighthouse job builds
  again. Reusing one build across jobs would need an artifact upload, which is the
  same unpinned-action trade-off.
- `lint:fix` exists for local use and is never run in CI.- Biome 2.6.8 reports `useSemanticElements` and `noArrayIndexKey` as errors; both are
  suppressed inline with the reason, so a reader meets the decision at the line rather
  than in a config file.

## Correction, 2026-11-16

The first GitHub Actions run failed in `Browser journeys` with `Executable doesn't
exist at .../chromium_headless_shell-1254/...`. The install step called `bunx
playwright`, which resolves the latest published Playwright instead of the version the
workspace pins: it downloaded the browser for 1.65.1 (`chromium-headless-shell v1255`),
while the pinned `@playwright/test` 1.65.0 asks for revision 1254. The suite passed
locally only because 1254 was already in this machine's browser cache.

Both jobs now call `./node_modules/.bin/playwright` from `apps/web`, so the browser
revision always matches the pinned runner and no step can drift from `bun.lock`.

## Remaining work

- Observe one pull-request run of `Frontend CI` and one `main` run of its Lighthouse
  job.
- Decide whether these jobs become required status checks in branch protection. That
  is a repository-settings decision, not a workflow one.
- The pgTAP, concurrency and signed-token PostgREST suites still run only against the
  local Docker stack. Adding them to CI means starting the Supabase stack in a job,
  which costs several minutes per pull request; it is a cost decision that stays open.
- `apps/api` is still outside the linter. Its 18 findings are almost all deliberate
  control-character validation, so it needs its own slice and its own reasons.
- The authenticated Playwright journeys and the visual-comparison decision stay open as
  recorded in [doc15](doc15-web-tooling-signin.md) and
  [D-F5](../plans/frontend-roadmap.md).

## References

- [Frontend tooling guide](../guides/frontend-tooling.md) — runner boundary, lint and
  the workflow map.
- [doc20](doc20-ci-web-suites.md) — the dedicated web test step this record builds on.
- [doc18](doc18-mod-browser.md) — the screen whose approved layout the suppressions
  protect.
- [Frontend tooling tasks](../../odd/tasks/frontend-tooling.md) — specs and log.
- [Handoff](../handoff.md) — current checkpoint.
