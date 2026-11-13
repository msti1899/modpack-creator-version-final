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

Resolve returns `{ versions: [{ id, projectId, projectTitle, name, versionNumber }], addedDependencies }`.
`name` is the Modrinth version's display name and `projectTitle` its project title, so
each proposed mod and dependency can be shown by name without another lookup.
`addedDependencies` contains new
required dependency version IDs, excluding the requested mod and previous selections.
The candidate includes recursive dependencies; optional and embedded dependencies are
not added. Existing exact versions remain pinned. A missing project's newest compatible
version is chosen by publication date. Conflicts fail rather than replacing a pinned mod.

**Confirm dependencies before accepting the candidate.** Present every returned
`projectTitle` with its `versionNumber` for approval. If the user cancels, keep the
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

## Next steps

See the [API reference](../reference/backend-api.md) for complete contracts,
errors, and limits, and the [backend architecture](../architecture/modrinth-backend.md)
for boundaries and verification.
