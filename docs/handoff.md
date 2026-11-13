# Current handoff

Checkpoint: 2026-11-12. `main` at `e60a816` contains milestone 3 ([PR #45](https://github.com/msti1899/modpack-creator-version-final/pull/45),
merge `b648c21`), milestone 4 ([PR #46](https://github.com/msti1899/modpack-creator-version-final/pull/46),
merge `2ae50e7`) and milestone 5 ([PR #49](https://github.com/msti1899/modpack-creator-version-final/pull/49)).
Milestone 6 is implemented on `feat/voting`, which now merges that `main` and is
published as [PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48).
Verify the branch and HEAD before resuming. This is a resume point, not a session
history.

## Merged milestones

- Milestone 3, groups and permissions: thirteen authenticated operations, owner and
  member rules, direct public admission, owner-approved private joining. Evidence in
  [doc02](delivery/doc02-groups-permissions.md) and [groups tasks](../odd/tasks/groups-permissions.md).
- Milestone 4, persisted draft: one exact approved draft per group, owner-only saves,
  compatible Minecraft and loader changes, member read and export. Evidence in
  [doc04](delivery/doc04-pack-drafts.md) and [draft tasks](../odd/tasks/pack-drafts.md).
- Milestone 5, published versions: immutable publications, an owner-selected active
  version that publishing never changes, and reads or exports limited to current group
  members. Evidence in [doc05](delivery/doc05-published-versions.md) and
  [publication tasks](../odd/tasks/published-versions.md).

Those records own their own proof and gaps; this checkpoint does not restate them.

## Current work: milestone 6, voting

Milestone 6 is implemented on `feat/voting`, created from `d5d3c40` and now carrying a
merge of `main` at `e60a816`. The four lifecycle rules the roadmap required were
decided and recorded in D7. Votes are owner-created concrete proposals with a chosen
1–720 hour duration, a frozen electorate that includes the owner, absolute majority
with early approval, owner cancellation, deadline rejection, and a separate owner
incorporation action. Approval never edits, publishes or activates a pack version. See
[voting tasks](../odd/tasks/voting.md), [doc06](delivery/doc06-voting.md) and the
[voting guide](guides/voting.md).

Because milestone 5 merged first, this branch renumbers two identifiers: the votes
migration is `20261112233000_group_votes.sql` and its delivery record is
`doc06-voting.md`. The publication delivery keeps `20261112230000` and `doc05`.

## Proof for this checkpoint

- Merged `main` re-checked on this branch: `bun run check` passes 125 tests / 2310
  assertions with both application typechecks. Before the merge the branch alone
  passed 108 tests / 1945 assertions.
- All nine migrations apply in order in one isolated PGlite 0.5.16 session, and the
  publication, votes and draft SQL suites all pass in the same session. The votes suite
  fails when its migration is skipped. This is supplemental evidence, not pgTAP.
- Independent verification of the voting slice reproduced no blocker: S1–S5 met,
  179 SQL checks, 11 HTTP probe tests and 55 byte-identical comparisons of existing
  routes against the base revision.
- Native review of the voting candidate approved it and burned its acknowledgement with
  no correction round; six advisories are recorded in doc06.

## Missing proof

Actual pgTAP (`bun run db:test` needs Docker and a local stack, both absent), the
Docker-dependent upgrade runner, PostgREST and a signed Clerk→Hono→PostgREST request,
real multi-connection races for admission, publication and voting, hosted application
of the publication and votes migrations, and native candidate review for milestone 5.
PGlite is single-connection, so lock ordering is argued structurally, not raced.

## Delivery state

- Milestone 5: merged to `main` as `e60a816`; the Backend CI run on that commit passed.
- Milestone 6: [PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48)
  is open on the merged head; its previous run passed on the pre-merge commit, so the
  post-merge run is the current evidence.
- No hosted change and no deployment is recorded for milestones 5 or 6.

Next action: review and merge PR #48 once its post-merge checks pass, then decide
separately whether to apply the publication and votes migrations to the selected test
project.

## Resume

1. Verify the branch, commit and local changes against this snapshot. Preserve
   unrelated untracked work: `.agents/`, `.atl/`, `apps/web/AGENTS.md`,
   `skills-lock.json`, and the separate worktrees for merged branches.
2. For scope, read [roadmap milestone 6](plans/backend-roadmap.md#delivery-order) and
   [voting tasks](../odd/tasks/voting.md); merged milestones link their own records.
3. Hosted state is unchanged from the earlier checkpoints: the profile, group and draft
   migrations are applied to the selected test project, and the publication and votes
   migrations are not. Applying them needs explicit authorization. Do not access ambient
   CLI sessions or credentials beyond authorized test projects.
4. Remaining unverified areas that need separate accounts or mailboxes are unchanged:
   full Google/Discord OAuth completion and real email delivery.

## Application checkpoint

Recorded before the numbered documentation deliveries; not rerun for this checkpoint.

- Clerk owns accounts and sessions. Hono verifies Clerk tokens for `/me` and protects
  profile endpoints; Supabase remains the profile database. Public Modrinth search,
  resolution and `.mrpack` export remain implemented.
- Hosted profile and group work was verified with explicit authorization: the profile,
  group and draft migrations are applied to the selected test project, Clerk Development
  signs `role: "authenticated"`, Supabase trusts the Clerk issuer, and real-session
  lifecycle plus cross-user isolation passed. Fixtures were removed and `public.profiles`
  is back to zero rows.
- Offline JWT expiry still limits immediate revocation. Earlier merge and review records
  remain historical evidence in [the archived handoff](handoff-history-2026-11-12.md) and
  the feature logs. No deployment has been recorded, and service liveness is not
  verified here.

## Documentation maintenance

Use [the documentation index](README.md) to choose the owning document. Complete work
units get a [numbered delivery record](delivery/README.md); interruptions update this
checkpoint. No retrospective doc numbers are assigned to earlier work.
