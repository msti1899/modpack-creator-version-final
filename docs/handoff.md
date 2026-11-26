# Current handoff

Checkpoint: 2026-11-26. `main` at `e979318` (merge of #140), plus the documentation commit
that contains this file. The merged milestones and backend completion slices are recorded in
[the delivery index](delivery/README.md); each record owns its own proof and gaps. Verify the
branch and HEAD against this snapshot before resuming. This is a resume point, not a session history: per-delivery
narratives from milestone 6 to the 2026-11-17 product-scope clarification are in
[the handoff history](handoff-history-2026-11-17.md), and earlier sessions are in
[the history through 2026-11-12](handoff-history-2026-11-12.md).

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

## Current product scope

On 2026-11-17 the owner confirmed group-scoped mod access: the browser is reached
from the group, not a global catalog entry. Only the owner directly edits the
pack; members submit proposals pending owner approval. That approval opens voting,
and incorporation after a successful vote remains a separate owner action. The
product scope is recorded in [D7](decisions/0001-project-baseline.md#d7-voting) and
the [frontend scope clarification](plans/frontend-roadmap.md#group-scoped-navigation-and-proposal-approval).
The existing public browser and owner-created votes do not implement this whole
journey. No application, database, hosted configuration or publication change is
part of this design update.

F1's signed-out journey was clarified on 2026-11-17: a protected action shows a
sign-in prompt in the current page, and the sign-in page opens only when the person
chooses it. The intended return and privacy requirements remain. This is planned
behavior, not an implemented or verified application journey. The no-group prompt
similarly leads to a separate group-creation page, which is not implemented yet.

The API reads those screens depend on are delivered: the Minecraft release list
([doc22](delivery/doc22-minecraft-versions.md)), a project's compatible versions
([doc23](delivery/doc23-project-versions.md)), loader-build discovery
([doc24](delivery/doc24-loader-builds.md)) and the link-only group summary
`GET /groups/:groupId` ([doc26](delivery/doc26-group-summary.md)). What remains for
F4, F5 and F6 is their design rounds and their implementation. The group-summary
migration is applied locally only.

## Delivery state

- Every documented slice through doc26 is merged to `main`; the [delivery
  index](delivery/README.md) is the list, and [the handoff history](handoff-history-2026-11-17.md)
  holds the per-merge narratives.
- Latest records: doc26 group summary (`7d6c0f0`, PR #134), doc25 database CI, doc21
  frontend CI workflow, doc20 web component suites, doc19 web-to-API transport,
  doc18 mod browser.
- Hosted: the migrations recorded through the account-deletion slices ([doc16](delivery/doc16-account-deletion.md),
  [doc17](delivery/doc17-account-reconciliation.md)) are applied to the selected test
  project. No deployment is recorded and service liveness is not verified here.
- Merged as `e979318` (#140): [doc27](delivery/doc27-authenticated-e2e.md) and its
  [ADR0007](decisions/0007-authenticated-e2e-account.md) give the browser suite a real
  signed-in session through one throwaway account per run, created and deleted locally. The
  public suite passes 29 tests and the authenticated mode passes 2. The native candidate
  review approved the slice with twelve advisory findings (`review-e67aacdc103e273d`),
  tracked as #141.

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
- The authenticated browser suite ([doc27](delivery/doc27-authenticated-e2e.md)) runs
  locally and on demand only. It is not a CI gate, no writing journey yet proves its own
  database cleanup, and the recovery paths after a failed or interrupted deletion are pinned
  by unit tests with the provider mocked rather than by a killed authenticated run. The
  review advisories that harden it are #141.

## Next action

Finish the F1 design review with the confirmed group and role rules; specify the
pending-proposal backend extension separately before implementation.

## Resume

1. Verify the branch, commit and local changes against this snapshot. Preserve
   unrelated untracked work: `.agents/`, `.atl/`, `apps/web/AGENTS.md`,
   `skills-lock.json`, and the separate worktrees for merged branches.
2. For scope, read [the frontend roadmap](plans/frontend-roadmap.md) for F1 and the
   [project board](https://github.com/msti1899/projects/1) for the next queued item.
   Merged milestones link their own records; the local database proof lives in
   [doc07](delivery/doc07-local-database-proof.md).
3. The local stack is available now: `bun run db:start` brings it up, `bun run db:test`
   runs pgTAP, `bun run db:test:upgrade` runs the disposable upgrade regression, and
   `bun run db:test:concurrency` plus `bun run db:test:postgrest` need the `docker` group,
   so run them through a shell that carries it. `bun run check` still needs no Docker.
   `bun run test:e2e:auth` runs the authenticated browser journeys: it needs both `.env`
   files, port 3000 free, and the test instance, and it creates and deletes one account per
   run ([doc27](delivery/doc27-authenticated-e2e.md)).
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
6. Remaining unverified areas that need separate accounts or mailboxes are unchanged:
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
checkpoint. When this file grows past the current state, move the settled narrative to
[the handoff history](handoff-history-2026-11-17.md) instead of appending another
"Next action". No retrospective doc numbers are assigned to earlier work.
