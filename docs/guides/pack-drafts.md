# Save and export a group's draft

Owners can persist one draft per group with exact approved Modrinth version IDs.
Members can read/export their group's draft, but only its current owner can edit.
This is a backend draft workflow, not publishing, activation or a frontend.

## Prerequisites

- A profile and group from the [group workflow](groups.md).
- A verified Clerk session with signed `role: "authenticated"` and configured
  Clerk-to-Supabase trust, as described in [local identity](local-identity.md).
- The tracked groups and pack-drafts migrations applied to the selected database.
  Hosted application requires explicit authorization; local checks alone do not
  apply the new migration to an external project.

## Read, approve, save

1. Call `GET /groups/me/pack` with the Clerk bearer. The result contains
   `groupId`, `role` and `draft`, initially null.
2. Use the existing public `/packs/resolve` flow in the
   [creation guide](create-modpack.md) with the current draft's exact settings/IDs.
   Ask the owner to approve newly required dependencies. If declined, do not save.
3. As owner, send the entire approved selection:

   ```http
   PUT /groups/me/pack
   Authorization: Bearer <Clerk session token>
   Content-Type: application/json

   {"gameVersion":"1.21.1","loader":"fabric","versionIds":["main-version-id","dependency-version-id"],"expectedRevision":0}
   ```

   IDs above are placeholders for exact IDs returned by Modrinth, not project
   IDs, names or `latest`. Use 0 only before creation. Later saves send the last
   read revision. A successful save returns the new full draft and revision.
4. On 409, read again. A stale tab must reconcile with the new draft; do not
   automatically overwrite it or retry. An incompatible selection must be fixed
   and approved explicitly. A lost database response can follow a committed
   write, so check the stored revision before resubmitting after a transport error.

The API validates the complete selection without adding/upgrading dependencies.
Changing Minecraft version or loader follows the same validation: rejection
preserves every stored setting/version. Explicit removals are allowed only if
the remaining selection still contains all required dependencies. Explicitly
saving an empty selection is allowed; no automatic clearing takes place.

## Export the saved draft

Call `POST /groups/me/pack/export` with only
`{ "name": "Friends pack", "version": "preview-1", "loaderVersion": "0.16.0" }`.
The group member's token selects the draft; callers cannot override its mods,
game version or loader. The existing exporter validates exact metadata and
returns the `.mrpack` attachment. Empty drafts cannot be exported. No export
publishes, activates, or creates a shared-version link.

## Ownership and storage

Ownership transfer immediately moves edit permission to the new owner. A former
owner still in the group can read but cannot save. A sole owner's departure
cascades group deletion to its draft; an owner cannot leave other members behind.

Draft tables are RPC-only with RLS enabled and direct client privileges revoked.
RPCs check the signed Clerk subject, current membership/ownership and expected
revision inside the database. Only the HTTP workflow performs external Modrinth
compatibility checks; direct owner RPC writes are not a catalog-validation receipt.

See the [API reference](../reference/backend-api.md#group-pack-drafts) for limits,
errors and response shapes, and [draft tasks](../../odd/tasks/pack-drafts.md) for
the exact verification and pending hosted/native-review state.
