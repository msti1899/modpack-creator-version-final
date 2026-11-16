# doc23: Per-project versions for the mod picker

- Date: 2026-11-16
- Scope: the second read slice decided by
  [ADR0006](../decisions/0006-selector-data-and-versions.md), board item #120.
- State: merged to `main` through
  [PR #125](https://github.com/msti1899/modpack-creator-version-final/pull/125) as
  `be643e2`, after Backend checks, Web checks and Browser journeys passed.
- Outcome: the API lists one mod's versions that support a chosen Minecraft version and
  loader, newest first, so a screen can offer an exact version instead of accepting whichever
  build resolution happened to pick.

## What changed

- `apps/api/src/modrinth.ts` adds `projectVersions` and a shared `versionSummary` projection.
  A slug resolves to the project first, so the version lookup always uses the project ID.
- `apps/api/src/index.ts` registers `GET /mods/:idOrSlug/versions` ahead of the single-project
  route.
- [The API reference](../reference/backend-api.md) documents the route.

Behaviour worth naming:

- Both parameters are required, each once, and any other parameter is a 400 before an
  upstream call; the same rule `/mods` already applies.
- Only versions that list both the chosen Minecraft version and the chosen loader are
  returned, filtered again after the upstream query rather than trusted from it.
- `releaseType` is passed through, so a caller can mark a beta or alpha. It never filters and
  never changes ordering: the list is strictly newest first.
- An unknown project, or one that is not a mod, is a 404 before the version lookup, so a
  missing mod is never reported as an empty selection.
- A malformed entry fails the whole response with 502; a shortened list would hide versions
  a person could have chosen.
- The response is capped at the newest 100 versions. Older versions of a heavily published mod
  are therefore unreachable through this route.

## What was checked

- `bun test apps/api/tests/project-versions.test.ts`: 8 tests, 57 assertions. Ordering and
  projection, the slug path, the empty compatible set, the 404 for unknown and non-mod
  projects, the parameter rejections, the malformed entry, the cap and both the 502 and 504
  mappings.
- `bun test`: 213 tests, 3299 assertions. `bun run test:web`: 81 tests. `bun run typecheck` and
  `bun run lint` are clean.
- Real calls on 2026-11-16 against the live service, using the slice's own module:
  - `sodium` on the newest release (`26.3`) with `fabric`: 7 versions in 42 ms, newest first.
  - `sodium` on `1.20.1` with `fabric`: 13 versions, newest `mc1.20.1-0.5.13-fabric`.
  - The `26.3` set is one release, five betas and one alpha, so the newest-compatible default
    the decision names selects a beta for that mod today.

## Not proven

- No hosted or deployed check ran; every automated test uses a fixture.
- No screen consumes the route yet. The mod detail surface that reads it still needs its
  design round.
- The 100-version cap is not paginated. A mod with more compatible versions than that cannot
  reach the older ones from a picker built on this contract.
- The observation that the newest compatible version of a popular mod can be a beta is
  recorded, not decided. Whether a picker should prefer the newest release and fall back to a
  prerelease is a product question outside this slice.

## Remaining work

- #121 discovers loader builds for export and publication.
- F4 still needs an approved design round before its detail surface can consume this route.
