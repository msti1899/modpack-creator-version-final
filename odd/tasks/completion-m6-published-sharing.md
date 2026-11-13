# Backend completion M6: published versions and sharing

Branch: `feat/published-sharing`, cut from `origin/main` at `5f68d7b`. Worktree:
`/home/matias/projects/modpack-creator-version-final-worktrees/published-sharing`.
Delivery: ask-on-risk. Forecast: 700-900 authored changed lines.
Runners: `bun test apps/api/tests/pack-publications.test.ts`, `bun run check`,
`bun run db:test`, `bun run db:test:postgrest`, and
`bun scripts/test-publication-session.ts --live` only under separate authorization.

## Specs

- S1: Completion-plan milestone M6 accepts when "Publish/list/read/activate/export
  work with real signed sessions; a nonmember/previous member cannot read or export.
  Draft changes do not rewrite historical selections or activation. Unavailable
  upstream versions fail predictably."
- S2: Completion-plan M6 delivery notes: "Depends on M4/M5. Hosted schema application
  is recorded already; it is not a pending migration step. Stronger file-manifest
  persistence is a separate decision."
- S3: Existing documented publication contract to preserve: only current group members
  read or export a published version and a share link carries no authority by itself;
  publishing never activates a version and activation stays an owner action; export
  uses the frozen metadata and accepts no overrides; a publication whose pinned
  versions Modrinth no longer serves fails with a documented conflict and stays
  readable, with repair through a new draft and a new publication.
- S4: Denial contract at the HTTP boundary: a caller without a group receives 404
  `Group required.`, another group's or an absent publication is indistinguishable at
  404 `Publication not found.`, no publication data is returned, and a denied export
  performs no Modrinth lookup and produces no archive. A member whose membership ended
  is denied on the next request.
- S5: Availability mapping stays as documented and is pinned, not changed: a pinned
  version or project that upstream no longer serves is 409 `A selected mod or
  dependency is unavailable.`, a version that no longer supports the frozen Minecraft
  version and loader is 409 `A mod version does not support the selected Minecraft
  version and loader.`, an upstream 5xx is 502, malformed metadata is 502 and a
  timeout is 504. A failed export returns no archive bytes and no attachment headers.
- S6: The hosted live check needs its own bounded authorization. It refuses without
  `--live`, refuses non-development credentials and a local database URL, prints no
  secret or token, closes every group it creates through the API, deletes every provider
  account it created, and writes the profile cleanup SQL it does not run because no
  profile deletion endpoint exists. Its refusal guards are pinned by a provider-free
  test.
- S7: Scope boundaries: no new endpoint, migration, product rule or stronger
  file-manifest persistence. Frontend, deployment, publication, merge and native
  review remain separate decisions.

## Tasks

- T1 [S1, S3, S4, S5] Pin the HTTP denial and unavailable-upstream export behavior in
  `apps/api/tests/pack-publications.test.ts`, including no Modrinth lookup and no
  archive on denial. Route: inline. Status: complete: 20 tests / 538 assertions, and
  three source mutations made the new cases fail before being reverted. Risk: item 3
  (shared export contract) and item 6.
- T2 [S1, S3, S4] Extend pgTAP `pack-publications.test.sql`: a draft edit or later
  publication leaves the historical selection and active pointer untouched, and a
  member who left a surviving group is denied. Route: inline. Status: complete: ten
  new assertions, `db:test` PASS, and two migration mutations made them fail. Risk:
  item 1 and item 2.
- T3 [S1, S4] Extend the signed-token PostgREST suite with publication publish, read,
  activation refusal, foreign/absent denial and previous-member denial, and verify no
  publication fixture survives cleanup. Route: inline. Status: complete: 72 of 72
  checks. Risk: items 1, 2 and 6.
- T4 [S1, S6] Add `scripts/test-publication-session.ts` for the hosted live check with
  real Clerk sessions. Build and review it; run it only after explicit authorization.
  Route: inline. Status: complete on 2026-11-13 under authorization: 30 of 30 checks
  passed against the development Clerk instance and the selected test project, and the
  fixtures were removed. Risk: item 2 and item 5.
- T5 [S1-S7] Record `doc12-published-sharing.md`, the delivery index, the handoff
  checkpoint and any guide clarification, and close this log. Route: inline.
  Status: complete. Risk: none.
- T6 [S1-S7] Independent read-only verification of the high-risk items named above,
  after the slice's own checks. Route: delegated verification. Status: complete on
  `94b0b6c`: every claimed count reproduced, no production defect, two evidence gaps and
  three advisories recorded, correction batch applied. Hosted leg stays open by design.

## Log

- L1: 2026-11-13: Owner asked for backend M6. On `origin/main` M1-M5 are merged, so M6
  is the completion plan's "Published versions and sharing". The publication feature
  itself shipped inside roadmap milestone 5; M6 asks for the missing proof and the
  availability contract, so this slice starts as evidence work over existing
  interfaces.
- L2: Baseline inspected at `5f68d7b`: `apps/api/src/pack-publications.ts` routes,
  `apps/api/tests/pack-publications.test.ts` (17 tests), pgTAP
  `supabase/tests/database/pack-publications.test.sql`, the 58-check signed-token
  PostgREST suite and the group live-check script. Standalone worktree created under
  `modpack-creator-version-final-worktrees/`; the unmerged `feat/frontend-tooling`
  checkout is untouched.
- L3: T1 and T2 added 3 HTTP tests and 10 pgTAP assertions. RED was shown by mutation,
  not by a missing route: API mutations changed the unavailable-version status, trusted
  malformed metadata, and remapped `Group required.`; migration mutations made
  `save_pack_draft` rewrite stored publications and made `my_pack_publication` ignore
  the caller. Each mutation failed the intended assertions and was reverted; the schema
  was restored with `bun run db:reset`.
- L4: T3 extended the signed-token PostgREST suite from 58 to 72 checks, including a
  draft-edit immutability comparison of the raw list payload and a departed-member
  refusal. Cleanup verification now counts publications and drafts.
- L5: T4 added the hosted live script without running it. Its refusal path rejects a
  missing `--live` flag and a non-development secret. `bun run check` passes both
  typechecks, 160 tests and 2872 assertions plus the web suite.
- L6: T5 recorded doc12, the delivery index, the export failure wording in the guide and
  reference, and this checkpoint section. Remaining: the hosted live run under
  authorization, native review, publication and merge as separate decisions.
- L7: T6 ran as an independent read-only verifier on `94b0b6c`. It reproduced every
  claimed count, confirmed the diff touches no production source or migration, and
  reproduced three mutations. It reproduced no production defect. It recorded two
  evidence gaps (the hosted leg still needs its own authorization, and the live script
  leaves profile rows that its printed SQL removes) and three advisories. The correction
  batch added three presentation-preservation assertions, the foreign-group refusal the
  PostgREST suite claimed, a provider-free test of the live check's refusal guards, and
  corrected S6 and the delivery wording. The hosted leg stays open by design.
- L8: T4 ran live under authorization on 2026-11-13 and passed 30 checks. The first
  attempt failed one check with the pinned 409 rejection because the edit dropped a
  required dependency; the script now edits the same complete selection in reversed order,
  which also proves the frozen order is independent of the draft. Six profile rows from
  both attempts were deleted with one exact-id statement under the same authorization;
  readback is zero in all six fixture tables and the provider instance holds no account
  created by this run.
