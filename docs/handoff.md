# Current handoff

Checkpoint: 2026-11-13. `main` at `717da47` contains milestone 3 ([PR #45](https://github.com/msti1899/modpack-creator-version-final/pull/45),
merge `b648c21`), milestone 4 ([PR #46](https://github.com/msti1899/modpack-creator-version-final/pull/46),
merge `2ae50e7`), milestone 5 ([PR #49](https://github.com/msti1899/modpack-creator-version-final/pull/49),
merge `e60a816`), milestone 6 ([PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48),
merge `ea2c43f`), the milestone-6 documentation record ([PR #50](https://github.com/msti1899/modpack-creator-version-final/pull/50),
merge `5c83c5c`), the local database proof ([PR #51](https://github.com/msti1899/modpack-creator-version-final/pull/51),
merge `becd201`), the hosted schema application (PR #53), the account and session proof
([PR #55](https://github.com/msti1899/modpack-creator-version-final/pull/55), merge
`21c91f8`), the profile conflict contract ([PR #56](https://github.com/msti1899/modpack-creator-version-final/pull/56),
merge `9067562`), catalog discovery ([PR #58](https://github.com/msti1899/modpack-creator-version-final/pull/58),
merge `b9167c0`) the completion-plan M5 group lifecycle proof
([PR #60](https://github.com/msti1899/modpack-creator-version-final/pull/60), merge
`4e03da0`) and the completion-plan M4 pack assembly slice
([PR #62](https://github.com/msti1899/modpack-creator-version-final/pull/62), merge
`d970c39`) and the completion-plan M6 publication proof
([PR #64](https://github.com/msti1899/modpack-creator-version-final/pull/64), merge
`717da47`), plus the completion-plan M7 voting-obligation slice
([PR #66](https://github.com/msti1899/modpack-creator-version-final/pull/66), merge
`e5246e0`). Verify the branch and HEAD against this snapshot before resuming. This is a resume point, not a session history.

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
still passes 127 tests / 2339 assertions.

## Missing proof

Still unproven after the local database work:

- The full Clerk→Hono→PostgREST chain with one token is now proven on the selected test
  project for the read path ([doc08](delivery/doc08-account-session-proof.md)). A local
  stack still cannot share one signing key between Hono's RSA verification and
  PostgREST's symmetric secret, so that limitation only applies locally.
- Mutation testing of the lock discipline: the new race checks are designed so that
  removing a lock or the one-group index changes the observed result, but no mutation
  was run.
- Real-session publication and voting are now proven with hosted Clerk sessions
  ([doc12](delivery/doc12-published-sharing.md), [doc13](delivery/doc13-voting-obligations.md)).
  Deadline expiry stays a read-time derivation proven in pgTAP only, because a hosted
  proof would need a one-hour wait or a database write. The upgrade runner passes in its
  disposable local container; it is not a hosted-data upgrade exercise. Additional
  hosted operations need bounded authorization.
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
- Hosted schema application for milestones 5 and 6 was recorded on 2026-11-13 through
  PR #53; no hosted functional journey or application deployment is claimed.
- Account and session proof: merged to `main` through
  [PR #55](https://github.com/msti1899/modpack-creator-version-final/pull/55) as
  `21c91f8`, with the Backend checks passing on the merge commit.
- Profile conflict contract: merged to `main` through
  [PR #56](https://github.com/msti1899/modpack-creator-version-final/pull/56) as
  `9067562`, with the Backend checks passing on the merge commit. `main` runs 131 tests.
- Catalog discovery (completion plan M3): merged to `main` through
  [PR #58](https://github.com/msti1899/modpack-creator-version-final/pull/58) as
  `b9167c0`, with the Backend checks passing on the merge commit in 45 seconds. `main`
  runs 153 tests and 2655 assertions.
- Group lifecycle proof (completion plan M5): merged to `main` through
  [PR #60](https://github.com/msti1899/modpack-creator-version-final/pull/60) as
  `4e03da0`, with the Backend checks passing in 44 seconds on the branch head. It adds
  tests, runners and documentation only; `main` still runs 153 tests.
- Pack assembly (completion plan M4): merged to `main` through
  [PR #62](https://github.com/msti1899/modpack-creator-version-final/pull/62) as
  `d970c39`, with the Backend checks passing in 42 seconds on the branch head after
  `main` was integrated. `main` runs 157 tests and 2699 assertions.
- Published versions and sharing (completion plan M6): merged to `main` through
  [PR #64](https://github.com/msti1899/modpack-creator-version-final/pull/64) as
  `717da47`, with the Backend checks passing in 43 seconds on the branch head. `main`
  runs 161 tests and 2880 assertions.

## Proposed next backend phase

On 2026-11-13 the owner requested a whole-backend assessment and broader plan, including
session/logout and mod filtering. The [completion proposal](plans/backend-completion.md)
now inventories user journeys, existing API behavior, missing web integration, assurance
gaps and optional product scope. It is proposed, not implementation authorization.
The audit was static; no new runtime or hosted checks ran for it. Prior review gaps
remain open, but review closure alone does not complete the product.
Publication and merge of the planning document were authorized on 2026-11-13;
implementation and unresolved product choices remain separate decisions.

### Account and session assurance slice

On 2026-11-13 the owner authorized starting the first backend-plan item on an isolated
branch, and a live check against the configured development instance. `feat/backend-account-session`
is cut from `origin/main` at `576ddfd` and carries two work units; it is not merged.

The first commit adds two tests and no application behavior: one pins the
environment-driven API configuration (escaped-newline PEM, comma-separated authorized
parties with trimming, unlisted origin rejected), the other pins a failed web session
lookup as a 502 rather than a sign-out and checks that no identity stays cached between
the signed-in, failed and signed-out results. Both were shown to fail when the behavior
they pin is mutated. The second commit adds the live check and [doc08](delivery/doc08-account-session-proof.md).

Recorded runtime results, with a real Clerk session token against the local API and the
test Supabase project: email/password sign-in completes including the new-device trust
challenge; `GET /me` accepts the token with the same subject, `no-store` and
`Vary: Authorization`; missing credentials return 401; `GET /profile` reaches the
database with that same token; revoking the session stops new tokens; a token copied
before revocation still verifies until it expires. `bun run check` passes 127 tests.

Observed limitations, not asserted defects: the session token template omits the email
claim, so `/me` returns null, and automated registration returns the provider's
`action_blocked` abuse response. The app's own account controls were then exercised in a
real browser against unmodified application code: "Sign in" opens the modal with the
configured Discord, Google and email/password methods, email/password sign-in completes
including the new-device trust code, `/api/me` returns the signed-in subject with
`no-store`, and signing out from the account menu returns the page to the signed-out state
with `/api/me` answering 401.

An earlier entry in this checkpoint reported two web defects from that attempt. Both are
withdrawn: the app had been opened at `127.0.0.1`, which Next 16 blocks from its
development resources, so the client never hydrated and the controls were inert. The same
steps on `localhost` work, and no application change was shipped. See
[doc08](delivery/doc08-account-session-proof.md).

Next action: fix nothing on the account surface; start the catalog-discovery milestone, or
decide the remaining open product questions. Preserve the separate approvals needed for
implementation, external settings, deployment and publication.

## Backend completion M2: profile contract (PR #56)

The second milestone of the [completion plan](plans/backend-completion.md) is
implemented on `feat/backend-profile-completion` and published as
[PR #56](https://github.com/msti1899/modpack-creator-version-final/pull/56). The
branch was cut from `576ddfd` and has `main` merged in, so it carries the
account/session slice that landed as `21c91f8`.

The slice completes the profile-onboarding contract without changing `/me`.
`GET /profile` returning `{"profile": null}` is documented as the completion
signal. A creation conflict now distinguishes `Profile already exists.` from
`Username is already taken.` using one owner-scoped follow-up read; a failed
classification keeps the generic message, and rename conflicts are reported as a
taken username without an extra call. Group creation without a profile remains the
pinned `409 Profile required.` rejection. See
[profile tasks](../odd/tasks/backend-profile-completion.md).

Proof: `bun run check` passes 131 tests with both typechecks on the branch with
`main` integrated. RED was observed before the implementation. Independent
verification met S1–S5 with no blocker, kept all non-conflict responses
byte-identical to the baseline in a 34-scenario differential, and its one advisory
was fixed and pinned. Native risk assessment returned medium / under budget, so no
candidate review was due.

State: merged to `main` through
[PR #56](https://github.com/msti1899/modpack-creator-version-final/pull/56) as
`9067562`, with the Backend checks passing on the merge commit. Database pgTAP was not
rerun because the slice changes no SQL, and no deployment, hosted setting or external
service was touched.

## Backend completion M3: catalog discovery (feat/catalog-discovery)

The third milestone of the [completion plan](plans/backend-completion.md) is implemented
on `feat/catalog-discovery`, cut from `main` at `6a552bf`, and merged to `main` through
[PR #58](https://github.com/msti1899/modpack-creator-version-final/pull/58) as `b9167c0`
with the Backend checks passing on the merge commit.

`GET /mods` now rejects unknown query parameters and accepts `sort`, `category`,
`environment` and `author` alongside the existing query, version, loader and offset.
`GET /mods/:idOrSlug` returns one mod summary and distinguishes not-found from upstream
failure, and every result carries an enriched summary. The environment filter means
"runs on that side" (required or optional), not "exclusive to that side". See
[doc09](delivery/doc09-catalog-discovery.md) and
[catalog tasks](../odd/tasks/catalog-discovery.md).

Proof: `bun run check` passes 153 tests and 2655 assertions with both typechecks, up from
131. The pinning tests were shown to fail when their behavior was mutated, and the
mutations were reverted. A page of 20 enriched hits measured 14473 bytes. The public
regression golden was recaptured and only the `GET /mods` hash changed.

Independent verification met S1–S8 with no blocker: it reproduced the suite, showed the
branch tests fail against the baseline source, and confirmed that baseline-valid requests
change only by the added payload keys and an upstream `index=relevance` parameter. Three
advisories were corrected in `ced57f8`; the rest are recorded limits in
[doc09](delivery/doc09-catalog-discovery.md).

Remaining: selector data for Minecraft and loader options and an exact-version picker
are still undecided; no web client consumes the new fields; no real-upstream, hosted or
deployed check ran. Native review approved the slice on 2026-11-13 over three lenses and
burned its acknowledgement; its eight informational advisories are recorded in
[doc09](delivery/doc09-catalog-discovery.md) as later work, including the missing cap on
distinct `category` values and the lack of per-hit degradation on upstream schema drift.

Next action: the slice is merged; the review advisories in
[doc09](delivery/doc09-catalog-discovery.md) are the next optional work, and selector data
and the exact-version picker still need a product decision.

## Backend completion M4: pack assembly (feat/pack-assembly)

The fourth milestone of the [completion plan](plans/backend-completion.md) is merged to
`main` through [PR #62](https://github.com/msti1899/modpack-creator-version-final/pull/62)
as `d970c39`, with the Backend checks passing in 42 seconds on the branch head. The
branch was cut from `origin/main` at `bce2fb7` and integrated `main` before merging; that
merge renumbered this slice's record to doc11 because the M5 proof took doc10.

`POST /packs/resolve` now returns `projectTitle` for every proposed version, validated
and fail-closed, so required dependencies can be presented for approval without a
lookup per candidate. The rest of the milestone reuses existing interfaces: accept is
`PUT /groups/me/pack` carrying the proposal's version IDs, cancel stores nothing,
removal is a shorter replacement, a compatible Minecraft or loader change revalidates
the whole selection, and every rejection leaves the stored row untouched. See
[doc11](delivery/doc11-pack-assembly.md) and
[assembly tasks](../odd/tasks/pack-assembly.md).

Proof: `bun run check` passes 157 tests and 2699 assertions with both typechecks, up
from 153 tests. RED preceded the change, and the public regression golden changed only
for `POST /packs/resolve`. The journey pins exercise accept, cancel, removal, settings
changes and every rejection through HTTP over one in-memory draft row. A 50-version
closure measures 8895 bytes with realistic values and 24095 bytes at the
300-character title ceiling. Independent verification met S1–S7 with no blocker and its
three advisories were corrected; that correction batch was not independently
re-verified. Native assessment returned medium risk with `under_budget`, so no
candidate review was due.

Remaining: no client consumes `projectTitle` yet, selector data and the exact-version
picker are still undecided, and the hosted compare-and-swap, cross-user isolation and
token revocation were not re-exercised for this journey.

Hosted session proof ran on 2026-11-13 with a real browser session against the
configured Clerk development instance and the hosted test project: `/me`, profile
creation, group creation, a live Modrinth proposal with real titles, save, removal,
three atomic rejections, export and the group-delete cascade all behaved as documented.
The first draft read timed out at the 5-second route limit before a retry succeeded,
which is recorded as an observed limit. One profile row (`m4proof13`) remains because
no deletion endpoint exists; removing it needs privileged database access. Details and
limits are in [doc11](delivery/doc11-pack-assembly.md).

State: merged. Publication and merge happened on 2026-11-13 under explicit owner
authorization; the hosted session proof above ran before the merge. Next action:
continue with the next completion-plan milestone, or take the recorded limits as later
work; no deployment is recorded.
## Backend completion M5: group lifecycle proof (feat/group-lifecycle)

The fifth milestone of the [completion plan](plans/backend-completion.md) was authorized
as isolated work on `feat/group-lifecycle`, cut from `origin/main` at `bce2fb7` in its own
worktree. It adds evidence, not behavior: no endpoint, migration, validation rule or
response shape changed. pgTAP gained 24 assertions for pending-request cursors, page
clamping, empty pages past the end and rotated or revoked tokens, and the signed-token
PostgREST script became a 58-check multi-subject lifecycle suite covering admission,
invitation, request, approval, rejection, rotation, revocation, member pages, immediate
ownership transfer and both departure paths. The runner now also fails when a probe
fixture survives cleanup.

Observed on 2026-11-13 with the local disposable stack: `bun run db:test` PASS with 217
tests, `bun run db:test:postgrest` 58 of 58 checks, `bun run check` 153 tests and 2655
assertions with both typechecks. Two local-only database mutations (removing the
transfer-before-leaving refusal and ignoring `revoked_at`) produced nine pgTAP and six
PostgREST failures; `bun run db:reset` restored the migrations and both suites returned
to PASS. See [doc10](delivery/doc10-groups-lifecycle-proof.md) and the
[feature log](../odd/tasks/completion-m5-group-lifecycle.md).

The hosted proof that the local stack cannot assemble was then authorized and run:
`bun scripts/test-group-session.ts --live` passed 30 checks with three real Clerk
sessions through a locally running API against the selected test project, including
immediate role changes and both departure paths. Every group was closed through the API,
the three profiles were removed with one exact-id delete, and hosted readback showed zero
rows in all five group/profile tables; the Clerk instance again holds only the owner
account. Two behaviours are recorded in doc10: a development browser token serves one
sign-in flow, and a failed account creation now still registers its id for cleanup.

State: merged to `main` through
[PR #60](https://github.com/msti1899/modpack-creator-version-final/pull/60) as `4e03da0`,
with the Backend checks passing in 44 seconds on the branch head. It was published as four
commits, one per artifact, after the native assessment returned medium with
`under_budget`, so no candidate review was due. Next action: re-run the live check after
any change to the group routes, RLS grants or Clerk token template; no deployment is
recorded.

## Backend completion M6: published versions and sharing (feat/published-sharing)

The sixth milestone of the [completion plan](plans/backend-completion.md) is implemented
as evidence work on `feat/published-sharing`, cut from `origin/main` at `5f68d7b` in its
own worktree. No endpoint, migration, product rule or response shape changed. The
publication feature itself shipped in roadmap milestone 5; this slice closes M6's four
statements with tests and a recorded failure contract.

`apps/api/tests/pack-publications.test.ts` grew from 17 to 20 tests: a caller without a
group or an unknown publication is refused with the documented 404s, a denied export
never reaches Modrinth, and an unavailable pinned version maps to the documented
conflicts and upstream statuses while the frozen publication stays readable. pgTAP gained
thirteen assertions showing that a later draft edit and a later publication leave every
frozen selection, its presentation metadata and the active pointer untouched, and that a
member who left a surviving group is refused on the next read. The signed-token PostgREST
suite grew from 58 to 73 checks over the same surface, distinguishing a caller without a
group from a caller in another group, and a provider-free test pins the live check's
refusal guards. See [doc12](delivery/doc12-published-sharing.md) and the
[feature log](../odd/tasks/completion-m6-published-sharing.md).

Proof: `bun run check` passes both typechecks, 161 tests and 2880 assertions, up from 157
and 2699, plus the web suite. `bun run db:test` PASS with six files and 217 tests;
`bun run db:test:postgrest` 73 of 73. Five local-only mutations, three in API source and
two in migrations, each made the new assertions fail and were reverted with
`bun run db:reset`. The publication guide and API reference now name the export failure
statuses; only wording was added.

Hosted live run on 2026-11-13, authorized for this slice: `bun
scripts/test-publication-session.ts --live` passed 30 checks with three real Clerk
sessions against the selected test project through a locally running API, covering a live
Modrinth proposal, publish without activation, member read and `.mrpack` export, member
and foreign-group refusals, separate owner activation, a draft edit that left the frozen
selection and the active pointer untouched, and a departed member refused on the next
request. The first attempt failed one check with the documented 409 rejection because the
edit dropped a required dependency; the script now reverses the complete selection. Six
profile rows from both attempts were removed with one exact-id delete under the same
authorization, and readback shows zero rows in the profile, group, request, publication
and draft tables.

Remaining: the unavailable-version cases are stub-driven, no upstream version was removed
during this slice, and export still re-fetches download metadata because manifest
persistence is a separate decision.

State: merged to `main` through
[PR #64](https://github.com/msti1899/modpack-creator-version-final/pull/64) as `717da47`,
with the Backend checks passing in 43 seconds on the branch head. It was published as
eleven commits, one coherent work unit each. Native risk assessment returned medium with
`under_budget`, so no candidate review was due. No deployment is recorded. Next action:
re-run the live check after any change to the publication routes or the token template.

## Backend completion M7: voting obligations and lifecycle (feat/voting-obligations)

The seventh milestone of the [completion plan](plans/backend-completion.md) is
implemented on `feat/voting-obligations`, cut from `origin/main` at `ddd1b8f` in its own
worktree. The vote feature itself shipped in roadmap milestone 6, so this slice adds the
decision M7 requires and the evidence the plan asks for.

D7 now records, dated 2026-11-13, that binding is an obligation rather than a gate: an
`approved` vote with `incorporatedAt: null` is pending, it is read from the existing vote
list, it blocks no draft save, publication, activation, membership change or ownership
transfer, ordering across several approved votes is the owner's choice, and the current
owner is the only incorporator after a transfer. A conflicting pending addition is
resolved by the draft's atomic contract: a different revision, changed settings and a
partial overlap are 409 refusals that write nothing, while an addition already present in
full is satisfied, records `incorporatedAt` and leaves the draft and its revision
untouched. The new migration `20261113190000_vote_incorporation_satisfied.sql` carries
that branch and was applied to the selected test project as the only pending migration.

Proof on this branch: `bun run check` passes both typechecks with 165 tests and 2962
assertions, up from 161 and 2880. The pgTAP vote suite gained 26 assertions, the independent verifier's probes became
a seventh suite, and `bun run db:test` PASS with seven files and 228 tests. The
signed-token PostgREST suite grew from 73 to 97 checks, and the real multi-session race
suite from eight to sixteen, including a save against an incorporation, two independent
incorporations, a duplicate approved addition and one vote incorporated twice. Two mutations, one in the new SQL branch and one in the HTTP error
map, made the new assertions fail and were reverted. The hosted live check passed 42
checks with three real Clerk sessions and a live Modrinth proposal after the review fixes,
and hosted readback after cleanup shows zero rows in every fixture table except the
pre-existing `m4proof13` profile. See [doc13](delivery/doc13-voting-obligations.md) and the
[feature log](../odd/tasks/completion-m7-voting-obligations.md).

Native review ran the full four-lens pass at the owner's request and approved the
candidate, burning its acknowledgement with no correction round. Fifteen of its sixteen
informational advisories were fixed in a follow-up slice
([PR #68](https://github.com/msti1899/modpack-creator-version-final/pull/68), merge
`2c8636e`) and the sixteenth is a pre-existing contract;
[doc13](delivery/doc13-voting-obligations.md) records both.

State: merged to `main` through
[PR #66](https://github.com/msti1899/modpack-creator-version-final/pull/66) as `e5246e0`,
with the Backend checks passing on the branch head and on the merge commit. Next action:
re-run the live check after any change to the vote routes, the incorporation function or
the token template, and treat the recorded review advisories as later work.

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
4. A browser check of the web app must use `http://localhost:3000`. Next 16 blocks its
   development resources for `127.0.0.1`, which leaves the page unhydrated with inert
   controls and a Clerk instance that never loads. That artifact produced and later
   withdrew a false defect report in [doc08](delivery/doc08-account-session-proof.md); an
   unhydrated page is evidence about the harness first, not about the app.
5. Hosted state moved on 2026-11-13: all ten repository migrations are applied to the
   selected test project, including the publication, votes and vote-satisfaction
   migrations, and the publication and voting journeys have hosted real-session proof in
   [doc12](delivery/doc12-published-sharing.md) and
   [doc13](delivery/doc13-voting-obligations.md). Do not access ambient CLI sessions or
   credentials beyond authorized test projects.
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
