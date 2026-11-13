# doc10: Pack assembly and dependency approval

Date: 2026-11-13
Scope: completion plan M4 — proposal inspection, accept and cancel, explicit removal,
compatible Minecraft and loader changes, and atomic rejection for group pack drafts.
No new route, no database change, no UI.
Baseline: `origin/main` at `bce2fb7`, checked before the work.

## Objective

M4 requires that a client can propose a mod, inspect required dependencies, accept or
cancel, remove a selection, change compatible settings and save, and that a rejection
or a stale revision never partially changes the stored selections. The recorded
decision for M4 was to reuse the resolver, the explicit-selection validation and the
draft replacement instead of adding parallel interfaces.

Most of that journey already existed. The resolver returned the candidate closure,
saving validated the complete selection without resolving dependencies, and the
database compare-and-swap made a rejected write atomic. The gap was inspection: a
proposal identified dependencies only by ID and version display name, so presenting
what the user is approving needed one extra catalog lookup per candidate.

## Changes and rationale

- `POST /packs/resolve` now returns `projectTitle` for every proposed version:
  trimmed, non-empty, at most 300 characters and free of control characters. This is
  what turns approve-or-cancel into a real decision; every other key, the version
  order and `addedDependencies` are unchanged.
- An unusable upstream title returns 502 `Modrinth returned an invalid project title.`
  rather than a partially enriched proposal, so a client never approves a list it
  cannot render.
- The title rule is one helper shared with vote proposals, so both paths enforce the
  same contract. The vote path keeps its baseline precedence: when a title and a
  version name are malformed at the same time, the title error is still reported.
- No interface was added for accept, cancel or removal. Accept is the existing
  `PUT /groups/me/pack` carrying the proposal's `versions[].id` set; cancel stores
  nothing because resolution never writes; removal is the same replacement with a
  shorter `versionIds`. Settings changes still revalidate the whole selection, and the
  database compare-and-swap remains authoritative for concurrent writers.

Behavior and contract live in the [backend API reference](../reference/backend-api.md),
the [draft guide](../guides/pack-drafts.md) and the
[creation guide](../guides/create-modpack.md).

## Verification

Environment: local Bun 1.4.4. No Docker, no hosted database, no real Modrinth API and
no provider credentials were used.

- `bun run check` passes 157 tests and 2699 assertions with both application
  typechecks, up from the 153-test / 2655-assertion baseline.
- RED was observed before the change: both title assertions failed with `projectTitle`
  undefined, and independent verification reproduced the same failures against
  `bce2fb7`.
- The additive guarantee was checked two ways. The exact resolve payload pin was
  updated only for the fixture titles, and the public regression test recomputed every
  golden hash: only the `POST /packs/resolve` response hash changed, with the other
  nine request hashes unchanged.
- Size, measured with documented fixtures: a 50-version closure is 8895 bytes with
  30-character titles and names, and 24095 bytes when every title sits at the
  300-character ceiling. No response bound is specified or enforced; the measurement
  exists because the completion plan asks for it.
- The journey pins hold through HTTP against one in-memory draft row. Accept stores
  exactly the proposal with the revision read, removal is a shorter replacement, a
  removal that breaks a remaining required dependency returns 409, a compatible
  settings change saves, an incompatible one returns 409, and every rejection leaves
  the row hash identical with no `save_pack_draft` call. A stale revision and a
  51-entry selection issue no catalog request at all.
- The vote precedence pin is discriminating: restoring the previous check order makes
  it fail, and that order was reverted after the observation.
- Independent verification covered the first work unit (`928cf97`) over all seven
  specs and found no blocker. Its three advisories — vote error precedence, overstated
  task wording and an undescribed size fixture — were taken in `95bb452`. That
  correction batch was not independently re-verified; its scope was exactly those
  three items and `bun run check` plus the mutated precedence pin cover them.
- Not exercised: the live Modrinth API, the real PostgreSQL compare-and-swap and row
  lock for this journey, Docker or a hosted database, and the 504 timeout path.

## Delivery state

- Implementation and documentation: complete on `feat/pack-assembly` in three
  commits: code, tests and contract documentation (`928cf97`), the verification
  correction (`95bb452`), and this record with the handoff checkpoint. Not published,
  not merged.
- Verification: independent, S1–S7 met with no blocker on the first work unit; the
  three advisories were corrected afterwards.
- Review: the native candidate assessment of the committed range returned medium risk
  with `under_budget`, so no candidate review was due for this slice.
- Deployment: none. No migration, hosted setting or provider was touched, so the
  pgTAP, upgrade and concurrency runners do not apply.

## Remaining work

- No client consumes `projectTitle` yet, so the field is a contract addition until a
  UI presents it.
- Minecraft and loader selector data and an exact-version picker remain undecided, as
  recorded in the completion plan.
- The journey is proven against HTTP fixtures and an in-memory draft row. The database
  compare-and-swap and row lock are proven separately in
  [doc04](doc04-pack-drafts.md) and [doc07](doc07-local-database-proof.md) but were not
  re-exercised for this slice.
- Publication and merge remain separate decisions.

## References

- [Completion plan, M4](../plans/backend-completion.md)
- [Backend API reference](../reference/backend-api.md)
- [Draft guide](../guides/pack-drafts.md)
- [Creation guide](../guides/create-modpack.md)
- [Drafts delivery record](doc04-pack-drafts.md)
- [Feature log](../../odd/tasks/pack-assembly.md)
