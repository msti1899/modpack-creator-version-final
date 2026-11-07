# Backend roadmap

Status: Approved; implementation in progress. Scope: backend plus the approved Clerk account-integration exception, no modpack frontend or CD.
Source: the six-stage proposal approved by the user with "Go ahead with the plan."
Last checkpoint: [current handoff](../handoff.md). This plan records intent;
the handoff records the current working state and next action.

## Outcome

A registered user can create or join a group and retrieve its exact published
modpack. Owners manage one pack per group; members can participate in binding
votes. Start with working vertical slices rather than modeling every table upfront.

## Delivery order

| Milestone | Scope and acceptance | Current state |
| --- | --- | --- |
| 1. Reproducible database | Pinned local Supabase tooling, tracked migrations, configuration, and documentation. A disposable database can start and rebuild without cloud credentials. | Implemented and verified; [PR #6](https://github.com/msti1899/modpack-creator-version-final/pull/6) merged. |
| 2. Identity and authentication | Hono validates Clerk sessions; basic web account controls and a server-to-API identity check use the same Clerk instance. Supabase stays the database. Verify email/password confirmation/recovery and Google/Discord in Clerk before launch. | Local integration verified on `feat/clerk-auth`: types, 40 tests/1,019 assertions, build, public-route differential and independent verification passed. Delivery slicing/commits and native review pending; see [task evidence](../../odd/tasks/clerk-auth.md). Former Supabase identity is merged in baseline `d9493dc`; its review does not cover this replacement. No real login, email/OAuth, cloud setup or new publication is claimed. |
| 3. Groups and permissions | One group per person, owner/member permissions, public direct admission, private invitations requiring approval, and ownership transfer before an owner leaves others behind. Test cross-group isolation and concurrent admission. | Planned. |
| 4. Persisted modpack draft | One draft pack per group, owner-only edits, exact approved mod/dependency versions, reuse of existing Modrinth resolution/export. Failed writes leave no partial selection. | Planned. Existing stateless resolution/export is already implemented. |
| 5. Published versions and sharing | Preserve earlier publications, explicit active-version selection by the owner, and links respecting access rules. Publishing does not automatically activate a version. | Planned. |
| 6. Voting | Owner-created concrete proposals and chosen duration, fixed electorate, absolute majority, early approval, and binding owner incorporation without automatic publication. Resolve pending lifecycle rules first. | Planned. |

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
- Cloud Supabase, Clerk, and OAuth setup require separate authorized account
  configuration. Local success does not prove production email or OAuth delivery.
- Modpack frontend, CD, CurseForge, multiple groups per user, multiple packs per group,
  and the desktop launcher remain outside this roadmap's current scope.

## Resolve before affected milestones

Before voting, clarify vote changes, cancellation, expiry/rejection, and member
departures without silently changing the accepted fixed-electorate majority rule.
Before sharing, settle any access details not already covered by group admission.
Before production configuration, verify provider eligibility, budget, and delivery.

## Maintenance

Update only milestones affected by a user-approved scope change. Preserve valid
completed work. Record meaningful changes below and keep the
[handoff](../handoff.md) synchronized after each delivery.

### Change log

- 2026-11-04: Recorded the approved six-stage plan; database foundation merged,
  local identity verified and its granted native review completed without findings. User requested durable plans and
  agent-to-agent continuity documentation.
- 2026-11-05: User approved "ok entonces me parece bien, empezemos a integrar clerk en la estructura actual" and later "ok continua con los cambios entonces". Replace only authentication with Clerk and add basic web account controls; preserve the independent API, Supabase database and application-owned group rules. Brevo is no longer a prerequisite of this auth slice. Account setup, real delivery and publication remain separate.
