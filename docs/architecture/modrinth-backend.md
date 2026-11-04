# Stateless Modrinth backend

The Hono API owns catalog access, dependency resolution, and archive generation.
The Next.js frontend remains a scaffold; no builder integration is implemented.
There are no accounts, database, saved packs, or cross-request selection state.

## Request flow

1. `/mods` validates filters and searches Modrinth for compatible mod projects.
2. `/packs/resolve` loads existing exact version IDs and resolves the requested
   mod's required dependency closure. It returns a candidate, not a saved pack.
3. The caller confirms dependencies or discards the candidate. Cancellation
   requires no rollback because resolution has not stored anything.
4. `/packs/export` re-fetches and validates the approved selection and emits a
   stored ZIP containing `modrinth.index.json`. It does not fetch JAR files.

## Modules and boundaries

- `apps/api/src/index.ts`: Hono routes, body limits, errors, and injectable
  `createApp(fetcher)` factory. The default export uses the runtime fetch.
- `apps/api/src/modrinth.ts`: catalog requests, per-operation cache and budgets,
  exact-version selection, dependency closure, and export metadata validation.
- `apps/api/src/zip.ts`: single-entry ZIP encoding, including CRC32.
- `apps/api/src/dev.ts`: local Bun server, separate from the production entrypoint.

## Invariants and limitations

Each pack has one Minecraft version, one loader, and at most one version per mod
project. Existing exact versions stay pinned; conflicts fail instead of replacing
them. Export never silently adds dependencies the caller has not approved.

Request-local caching is not persistence. Downloads in the index are restricted
to Modrinth CDN URLs and safe, non-colliding mod paths. Metadata checks do not
prove that arbitrary mods work together at runtime. Loader version discovery and
frontend confirmation are outside the implemented backend boundary.

## Verification

`apps/api/tests/packs.test.ts` exercises public routes with injected catalog
fixtures. Python's independent ZIP reader checks the archive and manifest for all
four loaders. Existing health and unknown-route behavior are preserved.

See the [API reference](../reference/backend-api.md) for contracts and limits,
the [guide](../guides/create-modpack.md) for usage, and the
[decision baseline](../decisions/0001-project-baseline.md) for product choices.

## Verification commands and rollback boundary

Run `bun test apps/api/tests` and `bun run --filter @modpack/api typecheck`
from the repository root. Python 3 is required for the independent ZIP test.
Tests print external scratch directories for cleanup.

The backend rollback boundary comprises `apps/api/src/modrinth.ts`,
`apps/api/src/zip.ts`, the added routes/factory in `apps/api/src/index.ts`, and
`apps/api/tests/packs.test.ts`. Restore the health-only entrypoint together with
removing those modules; frontend files and dependency manifests are unaffected.
