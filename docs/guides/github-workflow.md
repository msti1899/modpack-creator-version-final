# Report, review, and check changes on GitHub

Use issues to describe work, pull requests to review changes, and Backend CI to
check the API. There is no CD or deployment automation in this configuration.

## Report work

Choose **Bug report** or **Feature request** when opening an issue. Bugs require
reproduction steps, expected behavior, and environment information. Features
require a problem, proposal, and acceptance criteria. Never post credentials or
private information. Templates intentionally do not depend on repository labels,
assignees, or GitHub Projects being configured.

The issue forms live in `.github/ISSUE_TEMPLATE/`. The PR template lives in
`.github/pull_request_template.md` and requests scope, issue links, evidence,
rollback risk, and optional chain context. For feature-branch chains, identify
the tracker and parent and target the intended parent branch, not always `main`.

## Run backend checks

Backend CI runs on pull requests targeting any branch, pushes to `main`, and
manual dispatch. There are no path filters, so a selected check is not skipped
because a PR only changes documentation. It does not build or test the frontend.

The Ubuntu 24.04 job checks Python 3 availability for ZIP validation, installs
Bun 1.4.4, and executes these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @modpack/api typecheck
bun test apps/api/tests
```

The root lockfile covers all workspace dependencies, so installation includes
frontend packages even though verification targets only the backend. Tests use
fixtures instead of contacting Modrinth. Temporary ZIP files go into runner
temporary storage; the hosted runner is disposable.

The job has a ten-minute timeout and read-only repository permissions. Checkout
does not persist credentials. Actions are pinned to commit SHAs; review and
update those pins intentionally. Keep the Bun version aligned with `package.json`.

## Activation and boundaries

These files must be pushed to GitHub before a hosted run can be observed.
Issue and PR templates must be available on the default branch for normal
template selection; manual workflow dispatch also requires the workflow there.
An existing hosted result is not implied by local checks.

No repository settings, required checks, branch protection, labels, secrets,
issues, or pull requests are created or modified by adding these files. Making
`Backend checks` mandatory is a separate repository-settings decision. There are
no deploy jobs, credentials for external services, releases, or Vercel changes.

## Official references

- [Issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [PR templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)
- [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Bun on GitHub Actions](https://bun.sh/guides/runtime/cicd)
