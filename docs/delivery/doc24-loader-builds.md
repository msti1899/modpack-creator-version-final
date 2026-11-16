# doc24: Loader builds for export and publication

- Date: 2026-11-16
- Scope: the third read slice decided by
  [ADR0006](../decisions/0006-selector-data-and-versions.md), board item #121.
- State: merged to `main` through
  [PR #127](https://github.com/msti1899/modpack-creator-version-final/pull/127) as
  `af7822b`, after Backend checks, Web checks and Browser journeys passed.
- Outcome: the API discovers the loader build a pack has to declare, so exporting or
  publishing no longer requires a person to know a version like `0.20.1` from outside the
  product. Manual entry stays valid and remains the fallback.

## What changed

- `apps/api/src/loader-builds.ts` adds `createLoaderBuilds`, the per-loader parsers and the
  query validation. `apps/api/src/index.ts` registers `GET /loader-builds`.
- [The API reference](../reference/backend-api.md) documents the route, and
  [the task record](../../odd/tasks/loader-builds.md) records how each loader maps a build to
  a game version.
- The mapping is the part that is not obvious: Fabric and Quilt answer per game version,
  Forge publishes promotions keyed by game version, and NeoForge lists every artifact in one
  Maven metadata file where the game version is a prefix of the artifact version.

Behaviour worth naming:

- `recommended` is the first build the source marks stable. When a source publishes no
  stability flag (Quilt, NeoForge), a build without a prerelease suffix is reported stable;
  when no build qualifies, `recommended` is `null` rather than the newest build.
- Ordering is newest first by the loader's numbering, so a prerelease of a higher version
  sorts above the previous release. That is why `stable` travels separately.
- A pair with no published build is an empty list with a null recommendation, never a guess.
- One cache entry per loader and game version, held for an hour, shared by every caller and
  kept across a failed refresh as the last good answer.

## What was checked

- `bun test apps/api/tests/loader-builds.test.ts`: 10 tests, 44 assertions. One fixture per
  loader shape, the null recommendation, the empty pair for two sources, the parameter
  rejections, the 502/504/malformed/oversized mappings, the 100-build cap and the cache
  window, the per-pair key and the stale answer after a failed refresh.
- `bun test` and `bun run test:web` report their suites green; `bun run typecheck` and
  `bun run lint` are clean.
- Real calls on 2026-11-16 through the slice's own module:
  - Fabric `1.21.1`: 100 builds returned from 255, `0.20.1` recommended, 518 ms.
  - Quilt `1.21.1`: 100 returned from 310, newest `0.31.0-beta.6`, `0.30.2` recommended.
  - Forge `1.21.1`: 2 builds, `52.1.20` recommended and `52.1.21` newest, 197 ms.
  - NeoForge `1.21.1`: 100 returned from 261, `21.1.266` recommended, 872 ms.
  - A repeated Fabric pair was served from the cache in 20 ms.
  - Fabric and Quilt answer about 600 KiB and 900 KiB per game version, which is why the body
    bound is 2 MiB rather than the first guess of 512 KiB.

## Not proven

- No hosted or deployed check ran; every automated test uses a fixture.
- Quilt and NeoForge publish no stability flag, so the suffix convention is a recorded
  derivation, not the source's own statement. A build labelled stable by convention may not
  be what the loader author would recommend.
- The 100-build cap is not paginated; older builds of a heavily published loader are
  unreachable. For Fabric and Quilt this means the list is already truncated today.
- The route is unauthenticated, so an unseen loader and game-version pair costs one upstream
  request. Caching bounds memory, not request rate: the abuse limits belong to M9 and are not
  implemented here.
- Nothing consumes the route yet. The export and publication screens belong to F6.

## Remaining work

- F4, F5 and F6 still need their design rounds and their implementation slices.
- Whether a picker should prefer the newest release over a newer prerelease is still the open
  product question recorded in [doc23](doc23-project-versions.md), and it applies here too.
