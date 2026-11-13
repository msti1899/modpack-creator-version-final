# Current handoff

Checkpoint: 2026-11-12. `main` at `becd201` contains milestone 3 ([PR #45](https://github.com/msti1899/modpack-creator-version-final/pull/45),
merge `b648c21`), milestone 4 ([PR #46](https://github.com/msti1899/modpack-creator-version-final/pull/46),
merge `2ae50e7`), milestone 5 ([PR #49](https://github.com/msti1899/modpack-creator-version-final/pull/49),
merge `e60a816`), milestone 6 ([PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48),
merge `ea2c43f`), the milestone-6 documentation record ([PR #50](https://github.com/msti1899/modpack-creator-version-final/pull/50),
merge `5c83c5c`) and the local database proof ([PR #51](https://github.com/msti1899/modpack-creator-version-final/pull/51),
merge `becd201`). Verify the branch and HEAD against this snapshot before resuming.
This is a resume point, not a session history.

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

## Milestone 6, voting

Milestone 6 was implemented on `feat/voting`, created from `d5d3c40` and carrying a
merge of `main` at `e60a816` before it landed. The four lifecycle rules the roadmap required were
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

## Local database proof

Docker was installed with owner authorization on 2026-11-12, so a real local stack
became available and the database evidence listed as missing below was executed.
Evidence and caveats are in [doc07](delivery/doc07-local-database-proof.md) and the
[feature log](../odd/tasks/backend-proof-completion.md).

What now runs and passes against the local stack: actual pgTAP (six suites, 193
tests), the profile upgrade regression, real multi-session races for public admission,
publication sequencing and concurrent ballots, and signed-token PostgREST checks that
exercise the authorization branch instead of only the Hono fallback. `bun run check`
still passes 125 tests / 2310 assertions.

## Missing proof

Still unproven after the local database work:

- The full Clerk→Hono→PostgREST chain with one token. Locally Hono accepts only an RSA
  public key while the local PostgREST accepts only the stack's symmetric secret, so
  the two validators cannot share one signing key without a configuration change.
- Mutation testing of the lock discipline: the new race checks are designed so that
  removing a lock or the one-group index changes the observed result, but no mutation
  was run.
- A real-session group flow, hosted application of the publication and votes
  migrations, and the upgrade runner against hosted data. Hosted work needs explicit
  authorization; the Docker upgrade runner itself now passes locally.
- Native candidate review for milestone 5, and closure of the milestone 3 review that
  stopped after three of four lenses with no receipt.
- Full Google/Discord OAuth completion and real email delivery, which need provider
  accounts rather than code.

## Delivery state

- Milestone 5: merged to `main` as `e60a816`; the Backend CI run on that commit passed.
- Milestone 6: merged to `main` through
  [PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48) as `ea2c43f`.
  The pre-merge verification ran on the branch head with `main` already integrated, and
  the Backend checks run on the merge commit passed.
- Local database proof: merged to `main` through
  [PR #51](https://github.com/msti1899/modpack-creator-version-final/pull/51) as
  `becd201`; the Backend checks passed in 50 seconds on the branch head. Native review
  of that slice is still open.
- No hosted change and no deployment is recorded for milestones 5 or 6.

Next action: start the native review of the merged database-proof slice, close the
milestone 3 and milestone 5 review gaps, and verify the publication and voting flows
against the hosted project now that its migrations are applied.

## Resume

1. Verify the branch, commit and local changes against this snapshot. Preserve
   unrelated untracked work: `.agents/`, `.atl/`, `apps/web/AGENTS.md`,
   `skills-lock.json`, and the separate worktrees for merged branches.
2. For scope, read [roadmap milestone 6](plans/backend-roadmap.md#delivery-order) and
   [voting tasks](../odd/tasks/voting.md); merged milestones link their own records. The
   local database proof lives in [doc07](delivery/doc07-local-database-proof.md).
3. The local stack is available now: `bun run db:start` brings it up, `bun run db:test`
   runs pgTAP, `bun run db:test:upgrade` runs the disposable upgrade regression, and
   `bun run db:test:concurrency` plus `bun run db:test:postgrest` need the `docker` group,
   so run them through a shell that carries it. `bun run check` still needs no Docker.
4. Hosted state moved on 2026-11-13: all nine repository migrations are now applied to
   the selected test project, including the publication and votes migrations. The owner
   authorized that application, the project was linked with the owner's CLI session, and
   the schema was read back afterwards. Hosted functional proof of the publication and
   voting flows is still unproven and needs a real signed session. Do not access ambient
   CLI sessions or credentials beyond authorized test projects.
5. Remaining unverified areas that need separate accounts or mailboxes are unchanged:
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
