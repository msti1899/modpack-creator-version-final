# Build a pack without accounts

The Hono API searches Modrinth, resolves a candidate selection, and exports approved
exact versions as a `.mrpack`. It stores nothing between requests and does not download
or redistribute mod binaries. The frontend is not required to use these endpoints.

## Local use

From the repository root, run `bun run dev:api`. The API listens on port 3001 by
default. Use `Content-Type: application/json` for POST requests.

```sh
curl 'http://127.0.0.1:3001/mods?query=sodium&gameVersion=1.21.1&loader=fabric&offset=0'
```

Search returns `{ hits: [{ projectId, title, description, slug }], total, offset }`.
Each response contains at most 20 hits. Pass the next offset to retrieve more.
Only mods matching the requested game version and loader are searched.

```sh
curl -X POST http://127.0.0.1:3001/packs/resolve \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"MODRINTH_PROJECT_ID","gameVersion":"1.21.1","loader":"fabric","versionIds":[]}'
```

Resolve returns `{ versions: [{ id, projectId, name, versionNumber }], addedDependencies }`.
`name` is the Modrinth version's display name. `addedDependencies` contains new
required dependency version IDs, excluding the requested mod and previous selections.
The candidate includes recursive dependencies; optional and embedded dependencies are
not added. Existing exact versions remain pinned. A missing project's newest compatible
version is chosen by publication date. Conflicts fail rather than replacing a pinned mod.

**Confirm dependencies before accepting the candidate.** If the user cancels, keep the
previous `versionIds` unchanged. No server rollback is necessary because resolution
never saves a pack. If the Minecraft version or loader changes, start a new selection.

```sh
curl -X POST http://127.0.0.1:3001/packs/export \
  -H 'Content-Type: application/json' \
  -d '{"name":"Friends pack","version":"1.0.0","gameVersion":"1.21.1","loader":"fabric","loaderVersion":"EXACT_COMPATIBLE_LOADER_VERSION","versionIds":["APPROVED_VERSION_ID"]}' \
  -o friends.mrpack
```

Replace placeholders with IDs from resolution and an exact, compatible loader version.
Supported loader names are `fabric`, `forge`, `neoforge`, and `quilt`; they cannot be
mixed in a pack. Loader metadata is not fetched, so a syntactically valid loader version
is not a guarantee it exists or supports the chosen Minecraft version.

Export re-fetches and validates the approved selection and dependency closure. It rejects
missing dependencies instead of adding unapproved mods. The response is an attachment
with MIME `application/x-modrinth-modpack+zip`; its ZIP contains `modrinth.index.json`,
verified SHA1/SHA512 metadata, client/server support, and Modrinth CDN download URLs.
It does not guarantee runtime compatibility between arbitrary mods.

## Errors and limits

Failures return `{ "error": "..." }`: 400 for invalid input, 409 for incompatible or
unresolvable selections, 502 for upstream failures (including rate limits), and 504
for timeouts. Inspect the status before treating an export response as a ZIP.

- At most 50 mods including required dependencies, 100 upstream lookups per operation.
- Request bodies are limited to 16 KiB; pack names and queries to 100 characters.
- Metadata lookups have an 8-second timeout and a 20-second operation deadline.
- Only HTTPS `cdn.modrinth.com` download metadata is accepted; no arbitrary URLs or JARs
  are fetched. File names, collisions, hashes, and sizes are checked before exporting.
- Required/incompatible declarations are honored; undocumented runtime conflicts are
  outside this stateless flow. Packs and selections disappear when the client discards them.

## Verification and rollback

`bun test apps/api/tests` exercises the public Hono routes with deterministic fixtures.
Python 3's independent ZIP reader checks archives for all four loader keys. Tests print
ZIP scratch directories so the parent workflow can remove them. `bun run --filter
@modpack/api typecheck` checks TypeScript. Existing `/health` and unknown-route behavior
remain unchanged. Runtime smoke can use the curl requests above against the local server.

The rollback unit is `src/modrinth.ts`, `src/zip.ts`, the added routes/factory in
`src/index.ts`, `tests/packs.test.ts`, and this guide. Removing it restores the initial
health-only API without changing frontend files or dependencies.

## Primary references

- [Modrinth API](https://docs.modrinth.com/api/)
- [Search](https://docs.modrinth.com/api/operations/searchprojects/)
- [Project versions](https://docs.modrinth.com/api/operations/getprojectversions/)
- [Version metadata](https://docs.modrinth.com/api/operations/getversion/)
- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)
