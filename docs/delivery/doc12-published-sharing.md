# doc12: Published versions and sharing

Date: 2026-11-13
Scope: Test coverage, failure-contract evidence and a live-check script for the
completion plan's M6 over the publication endpoints that already exist. No new
endpoint, migration, product rule or frontend work, and no stronger file-manifest
persistence.
Baseline: `origin/main` at `5f68d7b`; work on `feat/published-sharing` in an isolated
worktree.

## Objective

M6 asks that "Publish/list/read/activate/export work with real signed sessions; a
nonmember/previous member cannot read or export. Draft changes do not rewrite
historical selections or activation. Unavailable upstream versions fail predictably."
The publication feature shipped inside roadmap milestone 5 and is merged, so this slice
adds the missing evidence for those four statements instead of new behavior.

## Changes and rationale

- [pack-publications.test.ts](../../apps/api/tests/pack-publications.test.ts) grew from
  17 to 20 tests. The new cases pin the denial contract at the HTTP boundary (a caller
  without a group and an unknown or foreign publication are documented 404s, a denied
  export performs no Modrinth lookup and returns no archive), and the unavailable-upstream
  mapping for export: a missing version or project, a version that dropped the frozen
  loader, malformed metadata, an upstream server error, a timeout and a transport fault.
  Each failure case also reads the publication again to show the frozen version stays
  available.
- [pack-publications.test.sql](../../supabase/tests/database/pack-publications.test.sql)
  gained thirteen pgTAP assertions. Saving a new draft and publishing again must leave
  every stored selection, the presentation metadata and the active pointer untouched; a
  later publication must preserve the first publication's name, version and loader
  version; and a member who joins, reads and then leaves a surviving group must be
  refused with `Group required.` on the next list and detail read. Two existing expectations moved
  with the extra publication (next sequence, and the new owner's expected revision).
- [test-postgrest.ts](../../scripts/test-postgrest.ts) grew from 58 to 73 checks on the
  real PostgREST surface with locally signed tokens: the owner stores a draft and
  publishes, a member reads the history and one version, a member cannot activate, a
  caller without a group and a caller in another group are refused differently, the
  owner activates separately, a later draft edit leaves the frozen selection and the
  active pointer equal, a member who leaves is refused, and the remaining owner still
  reads. Cleanup verification now also counts publications and drafts.
- [test-publication-session.ts](../../scripts/test-publication-session.ts) adds the
  hosted live check. Three disposable `+clerk_test` accounts complete a real
  email/password sign-in; the owner creates a group, resolves a live Modrinth proposal,
  saves the draft, publishes, activates and exports; the member reads and is refused
  activation; a third account in another group is refused; a draft edit changes neither
  the frozen selection nor the active version; and a departed member is refused on the
  next request. It refuses without `--live`, refuses non-development credentials and a
  local database URL, prints no secret or token, deletes every account it created, and
  writes the profile cleanup SQL instead of running it, because no profile deletion
  endpoint exists. It has not been executed. Its refusal guards are pinned without a
  provider call by
  [publication-session.test.ts](../../scripts/tests/publication-session.test.ts).
- The [publication guide](../guides/pack-publications.md) and the
  [API reference](../reference/backend-api.md#published-pack-versions) now name the
  export failure statuses explicitly. Only wording was added; no route, message or
  status changed.

## Verification

Environment: local disposable Supabase stack, Bun 1.4.4, no hosted project and no
provider account touched.

- Baseline before any change: `bun run db:test` PASS, six files and 217 tests;
  `bun run db:test:postgrest` 58 checks; `bun run check` 157 tests and 2699 assertions.
- `bun test apps/api/tests/pack-publications.test.ts`: 20 tests / 538 assertions.
- `bun run db:test`: PASS, six files and 217 tests in the same per-file TAP shape as
  before, now carrying ten more assertions inside the publication suite.
- `bun run db:test:postgrest`: 73 of 73 checks passed.
- `bun run check`: both application typechecks exit 0, 161 Bun tests and 2880
  assertions pass, and the web suite passes.
- Sensitivity was observed, not assumed. Five local-only mutations were applied and
  reverted; none reached a commit. In API source: treating a missing upstream version as
  a server error failed the unavailable-upstream case, trusting malformed version
  metadata as a client error failed the same case, and mapping `Group required.` to 502
  failed the new denial cases plus the existing mapping test. In migrations, making
  `save_pack_draft` also update stored publications failed "a draft edit preserves every
  frozen publication and the active version", and making `my_pack_publication` resolve
  any group failed "Expected rejection: Group required." for the departed member.
  `bun run db:reset` restored the schema and both database suites returned to PASS.
- The refusal path of the live script was exercised without touching a provider:
  both the missing `--live` flag and a non-development secret are rejected with exit 2.
- Hosted live run on 2026-11-13 with authorization: `bun scripts/test-publication-session.ts
  --live` passed 30 checks with three real Clerk sessions, through a locally running API
  using the repository environment files, against the selected test project. The run
  proved the host chain the local stack cannot assemble (one token accepted by Hono and
  forwarded to PostgREST), a live Modrinth proposal with real version IDs, publish without
  activation, a member read and a real `.mrpack` export, member refusal on activation, a
  caller in another group refused for list, read and export, separate owner activation, a
  draft edit that changed the stored order while the frozen publication kept its own, a
  departed member refused on the next request, and both groups deleted through the API.
- The first hosted attempt failed one check and the failure was the documented contract,
  not a defect: editing the draft to a single version removed a required dependency and
  returned the pinned 409 rejection. The script now edits to the same complete selection
  in reversed order, which also proves the frozen order is independent of the draft.
- Cleanup: the two runs left six profile rows, which were removed with one exact-id
  delete under the same authorization. Readback afterwards shows zero rows in
  `profiles`, `groups`, `group_members`, `group_join_requests`, `pack_publications` and
  `pack_drafts`; the provider instance holds no account created by this run.

## Limits

- The hosted proof ran once against the development instance and the selected test
  project. It is not a production run, and re-running it needs the same bounded
  authorization plus disposable fixtures. The local PostgREST suite still proves the
  database half with locally signed tokens, as doc07 and doc10 record, because the local
  Hono verifier and PostgREST cannot share one signing key.
- The unavailable-version cases are stub-driven. No upstream version was actually
  removed during this slice, so the mapping is pinned, not observed against Modrinth.
- Export still re-fetches download metadata; persisting a complete file manifest would
  make an old publication byte-reproducible and is a separate decision, as M6 states.
- No concurrency run, no mutation of the lock discipline, and no deployment.
- Publication, merge and native review are separate decisions and are not claimed here.

## Delivery state

Implementation and evidence on `feat/published-sharing`, cut from `origin/main` at
`5f68d7b` in an isolated worktree, merged to `main` through
[PR #64](https://github.com/msti1899/modpack-creator-version-final/pull/64) as `717da47`
with the Backend checks passing in 43 seconds on the branch head. It was published as
eleven commits, one coherent work unit each. No deployment is recorded. The feature log
is [completion-m6-published-sharing](../../odd/tasks/completion-m6-published-sharing.md).

## Remaining work

- Re-run `bun scripts/test-publication-session.ts --live` under explicit authorization
  after any change to the publication routes, the export path or the token template, then
  remove the profile rows it lists.
- Re-run the local database suites and the live check after any change to the
  publication RPCs, the export path or the Clerk token template.
- Resume from the [current handoff](../handoff.md).

## References

- [Publication guide](../guides/pack-publications.md)
- [API reference: published pack versions](../reference/backend-api.md#published-pack-versions)
- [doc05: Published versions and sharing](doc05-published-versions.md)
- [doc11: Pack assembly and dependency approval](doc11-pack-assembly.md)
- [Publication tasks](../../odd/tasks/published-versions.md)
