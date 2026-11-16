# Task record: loader builds for export and publication

Source: [ADR0006](../../docs/decisions/0006-selector-data-and-versions.md), "Loader build"
and its Contracts section. Board item #121.

## Specs

- S1. `GET /loader-builds?loader=&gameVersion=` returns `{ recommended, builds: [{ build,
  stable }] }`, newest first, with `recommended` naming the newest build the source marks
  stable, or `null` when it marks none.
- S2. Both parameters are required, each once, and any other parameter is a 400 before any
  upstream request.
- S3. A pair the loader publishes nothing for returns an empty list and a null
  recommendation; the source is never asked to guess, and no build is invented.
- S4. An upstream failure is a 502, a timeout a 504, malformed data a 502 and an oversized
  body a 502. Nothing is written.
- S5. One entry per loader and game version is cached for one hour, shared by every caller.
  A failed refresh keeps the last good answer for that pair.
- S6. The response is capped at the newest 100 builds.

## How each loader maps a build to a game version

The four sources disagree; this is the recorded mapping, and each shape has a fixture test.

| Loader | Source | Game-version mapping | Stability signal |
| --- | --- | --- | --- |
| Fabric | `meta.fabricmc.net/v2/versions/loader/{gameVersion}` | The pair is the request path | The source's own `loader.stable` boolean |
| Quilt | `meta.quiltmc.org/v3/versions/loader/{gameVersion}` | The pair is the request path | None published; a build without `-alpha`, `-beta`, `-pre`, `-rc` or `-snapshot` is reported stable |
| Forge | `files.minecraftforge.net/.../promotions_slim.json` | Keys are `{gameVersion}-latest` and `{gameVersion}-recommended` | The promoted `recommended` build is stable; `latest` is not, when the two differ |
| NeoForge | `maven.neoforged.net/.../neoforge/maven-metadata.xml` | The artifact version starts with the game version minus a leading `1.`, so `1.21.1` matches `21.1.*` and `26.3` matches `26.3.*`. The whole artifact version is the build a pack declares | None published; same suffix convention as Quilt, applied to the suffix after the prefix |

Ordering is newest first by the loader's own numbering, compared numerically per segment, so
`0.20.1` sorts above `0.19.5` and `21.1.266` above `21.1.265`. A prerelease of a higher
version therefore sorts above the previous release, which is why `stable` is reported
separately instead of changing the order.

## Evidence

- `bun test apps/api/tests/loader-builds.test.ts`: 10 tests, 44 assertions.
- Real calls on 2026-11-16: Fabric and Quilt answered about 600 KiB and 900 KiB for one game
  version, which set the 2 MiB body bound; Forge returned 2 builds for 1.21.1 with
  `recommended` 52.1.20 and `latest` 52.1.21; NeoForge returned the capped 100 with
  `21.1.266` recommended; a repeated pair was served from the cache.

## Log

- 2026-11-16: Slice implemented against ADR0006 with the mapping above. Merged to `main`
  through PR #127 as `af7822b`.
