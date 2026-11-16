# doc22: Minecraft release selector data

- Date: 2026-11-16
- Scope: the first read slice decided by
  [ADR0006](../decisions/0006-selector-data-and-versions.md), board item #119.
- State: merged to `main` through
  [PR #123](https://github.com/msti1899/modpack-creator-version-final/pull/123) as
  `bfedf74`, after Backend checks, Web checks and Browser journeys passed.
- Outcome: the API serves the Minecraft release list the web must read instead of a
  hardcoded version, cached in process for one hour.

## What changed

- `apps/api/src/selector.ts` adds `createMinecraftVersions`, which fetches Modrinth's
  game-version tags, keeps releases only, orders them newest first and caps the list at 200
  entries. It holds one cache entry and one in-flight refresh per application instance.
- `apps/api/src/index.ts` registers `GET /minecraft-versions` and builds the cache once per
  application, so every caller shares it.
- [The API reference](../reference/backend-api.md) documents the route, its shape, the
  cache window and the failure behaviour.

Behaviour worth naming:

- Snapshots and pre-releases are dropped upstream of the response, so no caller can
  accidentally offer one.
- A malformed tag entry fails the whole request with 502 instead of returning a shorter
  list, because a partial list silently hides versions a person can choose.
- After a successful fetch, a failed refresh serves the last good list for that process.
  With nothing cached the request fails with 502, or 504 on timeout, and never answers an
  empty list.
- Concurrent callers during a refresh share one upstream request.

## What was checked

- `bun test apps/api/tests/selector-data.test.ts`: 9 tests, 26 assertions. Release-only
  filtering, newest-first ordering, release dates, the empty case, the 502 envelope, a
  malformed payload, the 504 mapping, the cache window, the shared refresh, stale serving
  after a failure and the uncached failure.
- `bun test`: 205 tests, 3242 assertions, all passing.
- `bun run test:web`: 81 tests, all passing.
- `bun run typecheck` and `bun run lint`: both clean.
- The test seam is the injected fetcher, as with the rest of the API suite; each test builds
  its own application, so the cache never leaks between tests.
- One real call against the live endpoint ran on 2026-11-16: 103 releases in 93 ms, newest
  `26.3` (2026-09-15), oldest `1.0` (2011-11-17), already newest first, and the second call
  in the same process was served from the cache. The run used the slice's own module and the
  global `fetch`; it is recorded here as a manual observation, not as a test.

## Not proven

- The repeatable evidence is fixture-based. The live call above is a one-off observation, so
  an upstream payload change would surface only when someone runs it by hand; no live check
  runs in CI, because a third-party outage must not fail the gate.
- The route has no hosted or deployed check; the deployed behaviour is unproven.
- The cache lives in the API process. On a serverless deployment each instance keeps its
  own copy, so the one-hour window is per instance, not global. Nobody has observed a live
  refresh yet.
- The web does not read the route; the mod browser still carries its own default version
  until the frontend slice consumes this contract.

## Remaining work

- #120 lists one project's compatible versions for the picker, and #121 discovers loader
  builds for export and publication.
- The web slices that consume these contracts belong to F4, F5 and F6 and still need their
  design rounds.
