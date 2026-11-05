# Backend roadmap

Status: Approved; implementation in progress. Scope: backend only, no frontend or CD.
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
| 2. Identity and authentication | Hono validates Supabase sessions and exposes the caller's identity. Then complete email/password confirmation and recovery, Brevo delivery, and Google/Discord setup. Test invalid and expired sessions. | In progress: local `/me` slice implemented, independently verified, and native review approved. Identity and documentation merged in PR8/PR7. Profile database rules implemented, independently verified, and native review approved without findings; Profiles integrated into main through merged PR12. Local email/password registration/login implemented, independently verified, native review approved without findings, and published in PR13 against main; merge pending. Confirmation/recovery/provider workflows are not implemented. |
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
for another person after a rename. Username database rules are implemented, independently verified, and native review approved without findings; HTTP profile endpoints are implemented, independently verified, native review approved without findings, and published in PR11 against the feature branch; integration into main remains pending.

Before voting, clarify vote changes, cancellation, expiry/rejection, and member
departures without silently changing the accepted fixed-electorate majority rule.
Before sharing, settle any access details not already covered by group admission.
Before production configuration, verify provider eligibility, budget, and delivery.

## Maintenance

Update only milestones affected by a user-approved scope change. Preserve valid
completed work. Record meaningful changes below and keep the
[handoff](../handoff.md) synchronized after each delivery.

### Change log

- 2026-11-05: User confirmed "Sí, debe quedar otro método de acceso": provider
  unlinking is allowed only when another configured sign-in method remains.
- 2026-11-05: User confirmed "Sí, vinculación manual desde ajustes": link providers
  manually from settings while signed in, without automatic email-based merging.
- 2026-11-05: User confirmed "Sí, permitir vincularlos": existing accounts may
  link Google and Discord as additional sign-in methods; linking flow remains open.
- 2026-11-05: User confirmed "No, solo con email": password-based sign-in accepts
  email only, not username; Google and Discord remain approved methods.
- 2026-11-05: User confirmed "No, conservar las mayúsculas al mostrarlo": preserve
  chosen display casing while enforcing case-insensitive username uniqueness.
- 2026-11-05: User confirmed "No, el primer cambio puede ser inmediato": no
  registration cooldown applies to the first change; later changes require 30 days.
- 2026-11-05: User confirmed "Sí, queda libre": after a rename, the previous
  username becomes available for another person to use.
- 2026-11-05: User confirmed "Sí, cada 30 días": username changes are limited
  to once every 30 days; first-rename timing and previous-name reuse remain open.
- 2026-11-05: User confirmed "Sí, podrá cambiarlo": users may change their
  username after registration; frequency and previous-name reuse remain open.
- 2026-11-05: User confirmed "Sí, usemos ese formato": usernames use 3–20
  characters from `a-z`, `0-9`, and `_`, without spaces or accents.
- 2026-11-05: User confirmed "Sí, cuentan como el mismo nombre" for `Matias`
  and `matias`; account username uniqueness must be case-insensitive.
- 2026-11-05: User confirmed "Sí, nombre de usuario único" for all accounts,
  including Google and Discord registrations. Added this requirement to milestone
  2's account-onboarding scope; the existing `/me` slice remains unchanged.
- 2026-11-04: Recorded the approved six-stage plan; database foundation merged,
  local identity verified and its granted native review completed without findings. User requested durable plans and
  agent-to-agent continuity documentation.
