# 0001: Initial scope and stack

- Date: 2026-11-04
- Status: Accepted
- Category: Product, Architecture, Operations, Workflow
- Decision owner: Project owner
- Implementation: Partial; local scaffold only
- Verification: Local scaffold checks passed; external integrations not verified
- Source: Project-definition conversation with the project owner on 2026-11-04

This is the baseline of confirmed choices, not a claim that the application is
finished. Future changes should reference the affected `D#` below and preserve
the original context. Unresolved items are listed separately.

## Product decisions

### D1: Web first

- Build an open-source website to help friends share the exact Minecraft modpack
  for their modded server through a `.mrpack` file rather than a manually shared
  archive of mod files.
- Save packs on the website and share them through links.
- A desktop Minecraft launcher with additional management tools is future work.
  The current API is for the website only; it is not designed for that launcher.

### D2: Initial catalog and contents

- Use Modrinth first; defer CurseForge.
- Support Fabric, Forge, NeoForge, and Quilt across packs. This does not mean
  mixing different loaders in one pack.
- Include mods only initially; configuration-file uploads are deferred.
- Confirm required dependencies with the owner before adding them. If the owner
  declines them, cancel the proposed mod addition.
- An owner may change an existing draft's Minecraft version or loader only when
  the entire explicit mod/dependency selection remains compatible. An incompatible
  change is rejected without deleting or automatically substituting any approved
  version (decided 2026-11-12).

### D3: Accounts and membership

- Every participant must register.
- Offer Discord, Google, and traditional email/password authentication.
- Password-based sign-in uses email only, not the username. Google and Discord
  remain available as separate sign-in methods.
- Users may link Google and Discord to an existing account and use those methods
  without creating a second account. Linking is manual from account settings
  while signed in; do not merge accounts automatically because emails match.
  Users may unlink a provider only when another configured sign-in method remains.
- Every account must choose a unique username, including Google and Discord
  registrations (confirmed on 2026-11-05). Uniqueness is case-insensitive:
  `Matias` and `matias` cannot belong to different accounts.
- Usernames contain 3–20 characters from `a-z`, `A-Z`, `0-9`, and `_`, without
  spaces or accents (example: `mati_1899`). Preserve the chosen letter casing
  when displaying the username; uniqueness still ignores casing.
  Users may change their username after
  registration: the first change may be immediate, and subsequent changes require
  30 days since the last change. After a rename, the previous username becomes
  available for another person to use. The database and authenticated HTTP profile routes enforce these username
  rules; full account/provider workflows are not implemented yet.
- Initially, each person belongs to one group, including group owners.
- Initially, each group has one modpack and an owner.

### D4: Group admission

- Public groups allow registered users to join directly.
- Private groups use an invitation link and require owner approval to join.
  Possession of the link does not grant membership by itself.

### D5: Owner permissions and departure

- Only the owner edits the group's modpack.
- The owner may add mods directly; voting is optional.
- If other members remain, the owner must transfer ownership to another member
  before leaving.
- Ownership transfer takes effect immediately without recipient acceptance
  (confirmed on 2026-11-12).
- If the owner is the only member and leaves, delete the group and its modpack
  rather than archiving them. This records intended product behavior, not
  authorization to delete any current data.

### D6: Published versions

- The owner prepares changes and explicitly publishes pack versions.
- Preserve previous published versions.
- The owner chooses the active version independently of the latest publication.
  Publishing a new version does not automatically activate it.
- Only current members of the group may read or export a published version
  (confirmed on 2026-11-12). Possession of a share link grants no access by itself;
  joining a group still follows D4.
- A published version is an immutable snapshot of the approved draft and of the
  presentation metadata chosen at publication. Later draft edits do not change it.

### D7: Voting

- Only the owner starts mod-addition votes and chooses each vote's duration.
- Resolve the exact mod version and confirm its dependencies before opening a
  vote, so the group votes on a concrete addition.
- Fix the electorate at vote creation, including the owner. Later joiners do
  not participate in that vote or change its approval threshold.
- Approval requires affirmative votes from more than half of that electorate.
- Approve immediately when that majority is reached, without waiting for the
  deadline.
- An approved result is binding: the owner must incorporate the addition.
  Approval does not itself edit, publish, or activate a pack version.
- A member may change their own ballot while the vote stays open, and only the
  latest ballot counts. Reaching the majority closes the vote immediately, and no
  ballot changes are accepted afterwards (decided on 2026-11-12).
- The owner may cancel an open vote. A cancelled vote is terminal, gives the
  group nothing and adds no mod (decided on 2026-11-12).
- The fixed electorate does not change when a member leaves the group. Ballots
  already cast stay counted, a missing ballot stays an absence, and the majority
  threshold keeps the original electorate size (decided on 2026-11-12).
- A group may have several independent open votes at the same time, one per
  concrete mod addition (decided on 2026-11-12).
- A vote that reaches its deadline without the required majority ends rejected.
  Expiry and rejection are terminal and never add the mod.
- Binding is an obligation, not a gate (decided on 2026-11-13). An `approved`
  vote whose `incorporatedAt` is null is a pending obligation of the group, read
  from the existing vote list rather than from a new endpoint. It blocks no draft
  save, publication, activation, membership change or ownership transfer, and the
  approval of a second vote is never blocked by the first. Ordering across several
  approved votes is the owner's choice: there is no queue, no automatic merge and
  no batch incorporation.
- The obligation belongs to the group, not to the person who opened the vote.
  The current owner at incorporation time is the only one who may discharge it; a
  previous owner is refused with `Only the group owner may incorporate votes.`
  even for a vote they created. Transferring ownership neither dissolves an
  approved vote nor changes its frozen electorate.
- Conflicting pending additions are resolved by the draft's atomic contract, never
  by merging or deleting votes (decided on 2026-11-13). Each incorporation
  validates the current draft revision and settings. A different revision returns
  409 `Draft revision conflict.`; draft settings that no longer match the vote
  return 409 `Vote does not match the draft settings.`; an addition already present
  in full, with matching settings, is satisfied, so the incorporation records
  `incorporatedAt` and leaves the draft and its revision untouched; a partially
  present addition returns 409 `A proposed version is already in the draft.` and
  writes nothing. Every rejection leaves the draft, the vote and every ballot
  unchanged. The owner can always reach a state where the addition is either
  absent, and therefore appended, or fully present, and therefore discharged.

## Technical and operational decisions

### D8: Independent frontend and API

Authentication provider superseded by [0002: Clerk identity](0002-clerk-identity.md).
The original Supabase Auth choice below is retained as history; the independent
web/API architecture and Supabase PostgreSQL choice remain accepted.

- Frontend: Next.js App Router and TypeScript.
- Backend: an independent Hono API executed with Bun, also using TypeScript.
- API separation is an explicit architectural choice, not a performance claim.
- Database: Supabase PostgreSQL. Authentication: Supabase Auth.
- Prefer one repository with independent applications for the initial scaffold;
  repository layout is an implementation choice, not a requirement for separate
  repositories or a shared launcher backend.

The project owner requested separating the API as a deliberate architectural
decision, then chose Hono with Bun.

The trade-off is additional deployment, configuration, and authentication
coordination compared with keeping endpoints inside Next.js. An embedded Hono
API and a Rust web backend were not the selected architecture.

### D9: Hosting and budget

- Operate a public website maintained by the project owner.
- Use two independent Vercel projects: the Next.js frontend and the serverless
  Hono/Bun API. Supabase provides the database and authentication separately.
- Initial monthly operating budget: USD 0.
- Estimate approximately 15 people during the first weeks, not 15 concurrent
  users and not a permanent user limit.
- The project owner does not currently own a domain.

Constraints verified in provider documentation: Bun on Vercel is beta, Vercel
Hobby is for personal non-commercial use with quotas, and Supabase Free may
pause inactive projects. These choices do not guarantee permanently free or
uninterrupted operation. Open-source code alone does not establish Hobby
eligibility.

### D10: Transactional email

The auth-email plan below is superseded for the Clerk integration by
[0002](0002-clerk-identity.md). It remains historical context, not an instruction
to configure Brevo alongside Clerk.

- Use Brevo alone initially for signup confirmation and password recovery.
- Do not add a secondary provider or a fallback loop initially.
- Brevo's free daily quota and its documented temporary sender rewriting make
  it a candidate without an owned domain; activation, sender eligibility, and
  real delivery must still be verified.
- Do not treat the default Supabase testing SMTP as a public email solution.

The project owner decided to keep Brevo alone after discussing a second provider.
No account configuration or email delivery has been performed.

### D11: Start with infrastructure, not domain implementation

The current implementation scope is a runnable scaffold, development commands,
basic health/page tests, type checking, and setup documentation. Do not interpret
the product decisions above as a request to implement them all immediately.
External service setup, deployment, publishing, and commits are not included.

## Bootstrap implementation evidence (historical)

The observations below describe the initial scaffold, not the current feature
set. See the [backend architecture](../architecture/modrinth-backend.md) and
[local database guide](../guides/local-database.md) for subsequent implementation.

- `apps/web`: minimal Next.js starter page; not a functional modpack UI.
- `apps/api`: Hono `GET /health` and a separate local Bun server entrypoint.
- Local install, type checks, three tests, production web build, and isolated
  HTTP smoke checks passed during bootstrap verification.
- Vercel configuration has been checked structurally, not deployed.
- Supabase, Brevo, and Modrinth integrations are not implemented or configured.
- See the [root README](../../README.md) for runnable commands.

## Replaced or deferred ideas

- A globally fixed voting duration was initially discussed, then explicitly
  replaced by an owner-selected duration for each vote.
- Anonymous pack downloads were proposed, not accepted; participants register.
- Embedded Next.js API routes were recommended, then replaced by explicit API
  separation. This is not a requirement to replace Next.js as the frontend.
- CurseForge, configuration uploads, multiple groups per person, multiple packs
  per group, and the desktop launcher are outside the initial scope.

## Open questions, not accepted defaults

- Open-source license and project naming/branding.
- Exact Minecraft version support and handling unavailable or incompatible mod
  versions/dependencies. No guarantee of detecting every runtime mod conflict.
- Group expulsion does not exist in the current scope, so only voluntary
  departure affects an open vote and D7 now covers it.
- Deletion confirmation/recovery semantics.
- Anonymous browsing and the visibility of pack contents to nonmembers.
- Actual free-provider account eligibility and end-to-end email delivery.

These questions do not block the initial scaffold and need not all be resolved
before practical implementation begins.

## Technical references

- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)
- [Hono on Vercel](https://vercel.com/docs/frameworks/backend/hono)
- [Bun runtime on Vercel](https://vercel.com/docs/functions/runtimes/bun)
- [Vercel Hobby conditions](https://vercel.com/docs/plans/hobby)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Brevo Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo sender rewriting](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication)
