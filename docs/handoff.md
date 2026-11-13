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
- A real-session group/publication/voting flow. The publication and votes migrations
  were applied with authorization on 2026-11-13; schema readback is not functional proof.
  The upgrade runner passes in its disposable local container; it is not a hosted-data
  upgrade exercise. Additional hosted operations need bounded authorization.
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

State: published and awaiting merge; database pgTAP was not rerun because the slice
changes no SQL, and no deployment, hosted setting or external service was touched.

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
5. Hosted state moved on 2026-11-13: all nine repository migrations are now applied to
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
