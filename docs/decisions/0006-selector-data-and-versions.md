# 0006: Selector data, exact mod versions and loader builds

- Date: 2026-11-16
- Status: Accepted for the three read contracts and the loader-metadata sources described
  below. Authorizes no screen, design round, deployment or publication.
- Source: Backend completion plan, open decisions; frontend roadmap blockers for the mod
  detail surface (F4), pack assembly (F5) and publishing (F6). Board item #100.
- Relates to: D1 (web first), D2 (catalog and contents, one loader per pack, explicit
  dependency confirmation), D6 (published versions), D8 (independent frontend and API),
  ADR0001. The dependency confirmation itself is the separate frontend decision D-F4.

## Decision and consequences

Three questions were open together, and each is decided here. Two of them gate the mod
detail surface and pack assembly; the third gates publishing and sharing.

**Minecraft version list.** The API exposes the list by proxying Modrinth's game-version
tags. It returns release versions only (`version_type: "release"`), newest first, and is
the only source the web uses: no version list is written into the client. The response is
cached in process for one hour and shared across requests. When the upstream fails, the
endpoint answers with the last successful list from that same process when one exists, and
otherwise fails with the existing error envelope, so a screen can say which part failed.
Snapshots are out of scope: a pack targets a released game version.

**Exact mod version.** A person chooses the exact version of each added mod instead of
receiving whichever build was newest at that moment. The choice lives on the mod detail
surface (F4): a list of that project's versions that support the selected Minecraft
version and loader, newest first, with prereleases marked, defaulting to the newest
compatible one. This adds one read endpoint over a project's versions. The chosen version
ID is what resolution receives and what a save submits; nothing chooses a different build
afterwards. D2's rule that an incompatible Minecraft version or loader change never
substitutes an approved version is unchanged, and so is the rule that a save never adds a
dependency on its own.

**Loader build.** The API discovers the loader build instead of requiring a person to know
it, and keeps manual entry as the override. For each supported loader it reads that
loader's own metadata: Fabric meta, Quilt meta, Forge promotions and NeoForge Maven
metadata. It answers with the newest stable build compatible with the selected Minecraft
version and loader, cached for one hour per pair. A failed upstream never yields an
invented value: the field falls back to manual entry and says why. Export and publication
keep accepting an exact caller-supplied loader version, so a manually entered build stays
valid and this decision removes no contract.

Sequencing: the two version contracts gate the mod detail surface and pack assembly. The
loader build gates publishing and sharing, and may land after pack assembly because a
stored draft does not need it.

## Contracts

The shapes follow the existing projection conventions; the API reference records them when
each slice is implemented.

- `GET /minecraft-versions` returns `{ versions: [{ version, releasedAt }] }`, releases
  only, newest first.
- `GET /mods/:idOrSlug/versions?gameVersion=&loader=` returns
  `{ versions: [{ id, projectId, name, versionNumber, releaseType, publishedAt }] }` for
  the project when it supports that pair, newest first, filtered by both parameters. An
  unknown project is `404`; a pair the project supports nothing for is an empty list, not
  an error.
- `GET /loader-builds?loader=&gameVersion=` returns `{ recommended, builds: [{ build,
  stable }] }`, newest first. A pair the loader publishes nothing for is an empty list with
  no recommended build, so the caller can only offer manual entry.

All three are reads: no caching state becomes a stored row, and no write path changes. They
share the existing limits and error envelope, and they never retry a timed-out upstream
request.

## Rejected alternatives

- A hardcoded version list in the client: it ages between releases and forces a code change
  for every Minecraft update.
- Free-text Minecraft versions: it validates syntax, not existence, so a typo becomes a pack
  that resolves nothing.
- Newest-compatible-only mod versions: cheapest, but it leaves no way to avoid a broken or
  withdrawn build, which is common in modded Minecraft.
- Manual loader build only: it makes publishing require knowledge the product is supposed
  to remove, and a wrong build produces an archive that fails at launch.

## What stays open

Nothing in this decision. Where the pack settings live (their own screen or the pack
screen) belongs to F5's design round, and the dependency confirmation is already decided in
D-F4.

## Verification

Planned, per slice: contract tests for release-only filtering, ordering, the one-hour cache
hit and miss, stale serving after an upstream failure, and the error envelope; per-project
version listing filtered by the pair, with prerelease marking, empty results and an unknown
project; and one loader-metadata fixture per loader shape, each asserting the recommended
build and the manual fallback when the upstream fails. No check here replaces the hosted
proof each slice owes when it merges.
