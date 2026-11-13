# Backend roadmap

Status: Approved; implementation in progress. Scope: backend only, no frontend or CD.
Source: the six-stage proposal approved by the user.
Last checkpoint: [current handoff](../handoff.md). This plan records intent and
milestone progress; the handoff owns environment-specific evidence, delivery
state and the next action. Completed work from the documentation reorganization
onward is indexed in [delivery records](../delivery/README.md).

## Outcome

A registered user can create or join a group and retrieve its exact published
modpack. Owners manage one pack per group; members can participate in binding
votes. Start with working vertical slices rather than modeling every table upfront.

## Delivery order

| Milestone | Scope and acceptance | Current state |
| --- | --- | --- |
| 1. Reproducible database | Pinned local Supabase tooling, tracked migrations, configuration, and documentation. A disposable database can start and rebuild without cloud credentials. | Implemented and verified; [PR #6](https://github.com/msti1899/modpack-creator-version-final/pull/6) merged. |
| 2. Identity and authentication | Clerk owns accounts, sessions and account-management flows. Hono verifies signed Clerk sessions; Supabase remains the profile database with subject-scoped RLS. Preserve username rules and existing rows without automatic linking. | Verified on the selected test project: the Clerk replacement is integrated locally; the three repository migrations are applied; Clerk Development signs `role: "authenticated"`; Supabase third-party Clerk trust is enabled; and real-session profile/RLS isolation passed. Remaining: full Google/Discord OAuth completion and real email delivery. See the [current handoff](../handoff.md#application-checkpoint) and the [hosted verification record](../../odd/tasks/hosted-profile-verification.md). |
| 3. Groups and permissions | One group per person, owner/member permissions, public direct admission, private invitations requiring approval, and immediate ownership transfer before an owner leaves others behind. Test cross-group isolation and concurrent admission. | Implemented and merged to `main` through PR #45 (merge commit `b648c21`) with Backend CI passing, backed by authorized test-project migrations, real SQL isolation checks, local pgTAP and a real multi-session admission race ([doc07](../delivery/doc07-local-database-proof.md)). Native review is incomplete (three of four lenses, no receipt) and a real-session group flow remains unproven. See [doc02](../delivery/doc02-groups-permissions.md) and [groups tasks](../../odd/tasks/groups-permissions.md). |
| 4. Persisted modpack draft | One draft pack per group, owner-only edits, exact approved mod/dependency versions, reuse of existing Modrinth resolution/export. Failed writes leave no partial selection. | Merged to `main` through PR #46 after local checks, authorized hosted PostgreSQL proof and native review approval. Local pgTAP now passes ([doc07](../delivery/doc07-local-database-proof.md)); a real-session HTTP flow remains unproven. See [draft tasks](../../odd/tasks/pack-drafts.md) and [doc04](../delivery/doc04-pack-drafts.md). |
| 5. Published versions and sharing | Preserve earlier publications, explicit active-version selection by the owner, and links respecting access rules. Publishing does not automatically activate a version. | Merged to `main` through [PR #49](https://github.com/msti1899/modpack-creator-version-final/pull/49) as merge commit `e60a816` with Backend checks passing. Local pgTAP, a real publication race and signed-token PostgREST checks now pass ([doc07](../delivery/doc07-local-database-proof.md)); hosted proof and native review remain pending. See [doc05](../delivery/doc05-published-versions.md) and [publication tasks](../../odd/tasks/published-versions.md). |
| 6. Voting | Owner-created concrete proposals and chosen duration, fixed electorate, absolute majority, early approval, and binding owner incorporation without automatic publication. Resolve pending lifecycle rules first. | Merged to `main` through [PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48) as merge commit `ea2c43f` with Backend checks passing. The lifecycle rules were decided on 2026-11-12 and recorded in D7; local pgTAP, a real concurrent-ballot race and signed-token PostgREST checks now pass ([doc07](../delivery/doc07-local-database-proof.md)), while hosted proof and the milestone-5 review gap remain as recorded in [doc06](../delivery/doc06-voting.md). See [voting tasks](../../odd/tasks/voting.md). |

The detailed product rules remain in the
[decision baseline](../decisions/0001-project-baseline.md); this table does not
replace them or introduce new defaults.

## Boundaries and dependencies

- Keep the independent Hono/Bun backend and the existing public Modrinth behavior
  unless a later change explicitly authorizes a contract change.
- Add real migrations with the feature they support. Include permission tests,
  transactional behavior where needed, and documentation with each delivery.
- Local tests, independent verification, native review, hosted CI, publication,
  and merge are separate evidence. Completion of one is not proof of the others.
- Cloud Supabase, Brevo, and OAuth setup require separate authorized account
  configuration. Local success does not prove production email or OAuth delivery.
- Frontend, CD, CurseForge, multiple groups per user, multiple packs per group,
  and the desktop launcher remain outside this roadmap's current scope.

## Resolve before affected milestones

Account onboarding must require a unique username for every authentication
method. Password-based sign-in uses email only, not username; Google and Discord
remain approved sign-in methods. Users may link Google and Discord to an existing
account without creating another account. Linking is manual from account settings
while signed in; do not merge accounts automatically because emails match.
Provider unlinking requires another configured sign-in method to remain.
Username uniqueness is case-insensitive (`Matias` and `matias` collide).
Usernames contain 3–20 characters from `a-z`, `A-Z`, `0-9`, and `_`, without spaces
or accents. Preserve the chosen casing when displaying the username.
The first username change may be immediate after registration; subsequent
changes require 30 days since the last change. Previous usernames become available
for another person after a rename. Username database rules and HTTP profile endpoints are implemented, verified,
reviewed and integrated into main through PR12. Provider-linking rules above are
accepted requirements, not implemented provider workflows.

Sharing access is settled on 2026-11-12 and recorded in D6: only current group members
may read or export a published version. Before production configuration, verify
provider eligibility, budget, and delivery.

Voting lifecycle rules were resolved on 2026-11-12 and are recorded in D7:
ballot changes until the majority, owner cancellation while a vote is open, a frozen
electorate unaffected by departures, independent concurrent votes, and rejection at
the deadline. Expulsion does not exist in the current scope.

## Maintenance

Update only milestones affected by a user-approved scope change. Preserve valid
completed work. Record meaningful changes below and keep the
[handoff](../handoff.md) synchronized after each delivery.

### Change log

- 2026-11-12: Docker became available with owner authorization, so the database evidence that milestones 3-6 recorded as missing was executed on a real local stack: actual pgTAP (six suites, 193 tests), the profile upgrade regression, real multi-session races for admission, publication and voting, and signed-token PostgREST checks. A discovery defect that made `bun run db:test` fail despite passing suites was fixed. Hosted application, native review and provider setup remain open. See [doc07](../delivery/doc07-local-database-proof.md).

- 2026-11-12: Milestone 5 was merged to `main` through [PR #49](https://github.com/msti1899/modpack-creator-version-final/pull/49) as merge commit `e60a816`, after being implemented on its own branch cut from the merged milestone 3 and 4 baseline. Only current group members may read or export a published version; a share link grants no access by itself. Hosted application and native review remain pending.

- 2026-11-12: Milestone 6 was merged to `main` through [PR #48](https://github.com/msti1899/modpack-creator-version-final/pull/48) as merge commit `ea2c43f`, after the branch integrated milestone 5 and renumbered its migration to `20261112233000` and its delivery record to doc06.

- 2026-11-12: Milestone 6 started on its own branch and worktree (`feat/voting`) alongside the milestone-5 work. The four pending vote lifecycle rules were decided and recorded in D7; scope and acceptance are otherwise unchanged.


- 2026-11-12: Milestone 4 was resumed. The owner decided that changing a draft's Minecraft version or loader requires the entire selection to remain compatible: an incompatible change is rejected without clearing or substituting approved versions. Work landed on `feat/pack-drafts` and was merged to `main` through PR #46 (merge commit `2ae50e7`), stacked on the milestone-3 PR #45.

- 2026-11-12: The owner resumed milestone 3 and confirmed immediate ownership transfer without recipient acceptance. Database-only local draft is not a completed delivery; no new hosted change, publication or merge is authorized.

- 2026-11-12: Documentation reorganization leaves approved scope and milestone
  acceptance unchanged. Milestone 2 now links the current checkpoint instead of
  repeating stale PR/publication state and review counts. Earlier observations
  remain in the historical handoff and feature log; this is not new runtime proof.

- 2026-11-10: The user directed replacing all Supabase authentication with Clerk
  and asked to continue. Replace application authentication with Clerk, retain
  database/profile rules and legacy rows, and disable local first-party providers. Publication, hosted setup and merge remain separate decisions. See [replacement tasks](../../odd/tasks/clerk-auth-replacement.md) for current proof.

- 2026-11-05: The user approved returning the session as JSON. Local confirmation
  and recovery endpoints passed functional and independent verification; native
  review is approved and acknowledged; PR15 is published, not merged. No frontend or external service setup.

- 2026-11-05: Reconciled merged profile PR12 and credential PR13. Milestone 2
  remains partial; next unfinished local scope is confirmation callbacks and
  password recovery. Historical delivery logs remain unchanged.

- 2026-11-05: The user confirmed that one sign-in method must remain configured
  before a provider can be unlinked.
- 2026-11-05: The user confirmed manual provider linking from account settings
  while signed in, without automatic email-based merging.
- 2026-11-05: The user confirmed that existing accounts may link Google and
  Discord as additional sign-in methods; the linking flow remains open.
- 2026-11-05: The user confirmed email-only password sign-in, without usernames;
  Google and Discord remain approved methods.
- 2026-11-05: The user confirmed preserving chosen display casing while enforcing
  case-insensitive username uniqueness.
- 2026-11-05: The user confirmed that no cooldown applies to the first username
  change; later changes require 30 days.
- 2026-11-05: The user confirmed that a renamed-away username becomes available
  for another person to use.
- 2026-11-05: The user confirmed a 30-day interval between username changes;
  first-rename timing and previous-name reuse remained open at that point.
- 2026-11-05: The user confirmed that users may change their username after
  registration; frequency and previous-name reuse remained open at that point.
- 2026-11-05: The user confirmed the 3–20 character format using `a-z`, `0-9`,
  and `_`, without spaces or accents.
- 2026-11-05: The user confirmed that `Matias` and `matias` count as the same
  name, so account username uniqueness is case-insensitive.
- 2026-11-05: The user confirmed that every account needs a unique username,
  including Google and Discord registrations. Added this requirement to milestone
  2's account-onboarding scope; the existing `/me` slice remains unchanged.
- 2026-11-04: Recorded the approved six-stage plan; database foundation merged,
  local identity verified and its granted native review completed without findings. User requested durable plans and
  agent-to-agent continuity documentation.
