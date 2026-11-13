# Publish and share a group's pack version

Owners publish immutable versions of their group's draft and choose which version is
active. Only current members of that group can read or export a published version,
so a share link never grants access by itself. This is a backend workflow: there is
no frontend, no anonymous download and no deployment step.

## Prerequisites

- A profile, a group and an approved draft from the
  [group workflow](groups.md) and the [draft workflow](pack-drafts.md).
- A verified Clerk session with signed `role: "authenticated"` and configured
  Clerk-to-Supabase trust, as described in [local identity](local-identity.md).
- The tracked pack-publications migration applied to the selected database. Applying
  it to a hosted project requires explicit authorization; local checks alone do not
  change an external project.

## Publish a version

1. Read the draft with `GET /groups/me/pack` and keep `draft.revision`.
2. Choose the presentation metadata: `name`, `version` and `loaderVersion`. These
   identify the downloadable `.mrpack` and are frozen at publication. Names allow up
   to 100 characters and the other two up to 50, measured exactly like the public
   pack export, so anything accepted here can be exported later.
3. Publish the exact stored selection as the current owner:

   ```http
   POST /groups/me/pack/publications
   Authorization: Bearer <Clerk session token>
   Content-Type: application/json

   {"name":"Friends pack","version":"1.0.0","loaderVersion":"0.16.0","expectedRevision":1}
   ```

   A successful publish returns 201 with the new publication. Its `sequence`
   increases per group and `active` is always false at creation.
4. A stale `expectedRevision` returns 409 before any Modrinth lookup. Read the draft
   again and publish the state you actually reviewed; do not retry the same revision.
   A missing draft returns 404 and an empty draft returns 400. The complete stored
   selection is revalidated against Modrinth before the publishing RPC runs.

Publishing snapshots the draft. Later draft saves never change an existing
publication, and publishing the unchanged draft again creates another version.

## Choose the active version

```http
PUT /groups/me/pack/active-version
Authorization: Bearer <Clerk session token>
Content-Type: application/json

{"publicationId":"<publication id>"}
```

Only the current owner may activate. Activation is independent of the newest
publication, keeps exactly one active version per group and never happens as a side
effect of publishing, so the first publication leaves the group without an active
version until the owner chooses one. Activating an older publication is allowed.

## Share a link

The shareable value is the publication ID. Any current member of that group can open
it; everybody else receives no publication data:

- `GET /groups/me/pack/publications/<id>` returns the version for a member.
- A caller without a group receives 404 `Group required.`
- A caller in another group receives 404 `Publication not found.`

Membership is the access rule, not possession of the link. A recipient first joins
the group through the [group workflow](groups.md): direct admission for a public
group, owner approval for a private one.

## Read the history

`GET /groups/me/pack/publications?limit=20&before=<nextBeforeSequence>` lists versions
newest first with at most 50 entries per page. The response carries `groupId`,
`role`, `activePublicationId`, `publications` and `nextBeforeSequence`. The cursor is
the previous page's `nextBeforeSequence` and the field is null on the last page.
Members read the same history as the owner; only publishing and activation are
owner-only.

## Export a published version

`GET /groups/me/pack/publications/<id>/export` returns the `.mrpack` attachment of
that publication. The archive uses the frozen name, version, loader version,
Minecraft version, loader and exact Modrinth version IDs. The route accepts no body
and no query parameters, so a caller cannot substitute a different selection.

If Modrinth no longer serves one of the pinned versions, the export fails with a
documented conflict instead of producing a different pack. The publication remains
listed and readable; repair is a new draft and a new publication. A value stored
outside this workflow by a direct database call may exceed the export length limit:
it stays readable but cannot be exported.

The documented failure mapping is: `409 A selected mod or dependency is unavailable.`
when upstream no longer serves a pinned version or project, `409` with the compatibility
message when a version dropped the frozen Minecraft version or loader, `502` for an
upstream server error or malformed metadata, and `504` when the catalog does not answer
in time. A failed export returns no archive bytes and no attachment headers, and its
publication stays read-only available.

## Ownership and storage

Ownership transfer moves publish and activation rights immediately. A former owner
who remains a member can still read and export the history. A sole owner's departure
deletes the group and with it the draft and every publication.

Publication tables are RPC-only with row level security enabled and direct client
privileges revoked. The RPCs resolve the caller from the signed Clerk subject and the
current membership, never from a supplied user or group ID. Only the HTTP workflow
performs Modrinth compatibility checks, so a direct owner RPC call is not a catalog
receipt.

See the [API reference](../reference/backend-api.md#published-pack-versions) for
limits, errors and response shapes, and
[publication tasks](../../odd/tasks/published-versions.md) for the exact verification
and pending evidence.
