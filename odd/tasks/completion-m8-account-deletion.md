# Backend completion M8: account deletion and retention

Branch: `feat/account-deletion`, cut from `origin/main` at `afea8bf`. Worktree:
`/home/matias/projects/modpack-creator-version-final-worktrees/account-deletion`.
Delivery: ask-on-risk. Forecast: 600-800 authored changed lines.
Runners: `bun test apps/api/tests/account-deletion.test.ts`,
`bun test apps/api/tests/account-webhook.test.ts`, `bun run check`, `bun run db:test`,
`bun run db:test:postgrest`.

This document covers two work units on one branch: the session-surfaced deletion decided in
ADR0004 (S1-S10) and the provider reconciliation decided later in ADR0005 (S11-S16).

## Specs

- S1: Completion-plan milestone M8 accepts when: "First decide whether deletion is in
  this scope and define ownership, membership, historical ballots and profile/username
  retention. If approved, rejected actions preserve data and provider events cannot
  strand inconsistent records."
- S2: Completion-plan M8 delivery notes: "Conditional product scope and
  destructive-data/security review. Not a request to delete current accounts or install a
  webhook. Depends on M1/M2/M5/M7 rules."
- S3: Scope decision recorded on 2026-11-14: deletion is approved for one surface only,
  the authenticated holder deleting their own application data through the API. Clerk
  remains the owner of the identity and the sign-in account; this slice calls no provider
  API, installs no webhook, adds no administrator surface, and never deletes any existing
  account by itself. The decision is recorded as
  [ADR 0004](../../docs/decisions/0004-account-deletion.md).
- S4: Ownership and membership follow D5. An owner with other members is refused with the
  existing `409` message `Transfers are required before leaving a group with other
  members.` and the refusal writes nothing. The last member of a group deletes the group
  and everything under it, exactly like the documented last-owner departure. A member's
  deletion removes that membership and leaves the group, its draft, its publications and
  its votes intact.
- S5: Historical ballots and post-departure records are retained, never rewritten. Votes,
  the frozen electorate, cast ballots, invitation creators and request deciders keep the
  Clerk subject as a tombstone; no vote, ballot, electorate row, invitation or decided
  request of a surviving group is deleted by an account deletion, so counts and the
  electorate size do not change. The departing account's own join-request rows keep their
  existing cascade, because they are that account's own state. Because the ballot page
  left-joins profiles, a retained participant is reported there with `username: null`.
  Four restrictive foreign keys to `profiles` are dropped for that reason; the two keys
  that protect group integrity (`groups.owner_id` and `group_members.user_id`) stay in
  place.
- S6: The profile row is deleted, so the username is released immediately, consistent
  with the rename rule in D3. No tombstone username and no other stored display name
  survives: only the profile row and group membership rows carry a username, and nothing
  else stores one.
- S7: HTTP contract: `DELETE /profile` is authenticated, requires the authenticated
  database role, accepts no request body beyond an empty JSON object, and answers `200`
  with `{ "account": { "deleted": boolean, "group": { "id": uuid, "deleted": boolean } |
  null } }`. It is idempotent: a second call answers `200` with `deleted: false` because
  the requested end state already holds. A payload combining `deleted: false` with a group
  is impossible and is refused as a service failure. The refusal map is `400 Invalid or
  oversized JSON body.` for a non-empty body, `401 Authentication required.`, `409
  Transfers are required before leaving a group with other members.`, `503 Profile service
  is not configured.`, `504 Profile service timed out.` and `502 Profile service
  unavailable.` Every response carries `Cache-Control: no-store` and `Vary:
  Authorization`.
- S8: Provider events. No provider event is consumed in this phase, so no provider event
  can write a partial record. The recorded residual is that a Clerk-side deletion that
  bypasses the API leaves an inaccessible profile whose username stays reserved; the
  decision records the missing inputs for reconciliation (a webhook signing secret, a
  service-role credential and a rule for a group owner who can no longer act) as a
  separate, unauthorized decision.
- S9: Evidence obligations: RED observed before the implementation; an HTTP suite for the
  contract and the refusal map; pgTAP assertions for privileges, the two departure paths,
  retained rows, released usernames and refusals that write nothing; a signed-token
  PostgREST check through the real database surface; `bun run check` and `bun run db:test`;
  and a differential that shows every pre-existing route and response unchanged.
- S10: Scope boundaries: no webhook, no service-role credential, no automatic ownership
  succession, no administrator route, no new cascade, no frontend, no deployment, no
  publication and no merge. Publication and merge remain separate owner decisions. This
  boundary applies to the session-surfaced slice only; S11-S16 record the later,
  separately authorized provider path.
- S11: The provider decision left open by ADR0004 is recorded on 2026-11-14 in
  [ADR 0005](../../docs/decisions/0005-provider-account-reconciliation.md): a verified Clerk
  `user.deleted` is authoritative for the identity; the app must neither keep an owner who
  can never sign in nor destroy a group other people still use.
- S12: Ownership succession: when the deleted account owns a group with other members,
  ownership passes immediately to the remaining member with the earliest `joined_at`, ties
  broken by `user_id`, with no acceptance step because D5 already makes transfers immediate.
  A member loses only the membership; the last member deletes the group; every other rule is
  ADR0004's. The session path keeps its `409` transfer-before-deletion refusal, because that
  holder can still act.
- S13: Transport contract for `POST /webhooks/clerk`: no bearer token; the signature
  verified against `CLERK_WEBHOOK_SIGNING_SECRET` is the only authority. Missing signing
  secret or `SUPABASE_SECRET_KEY` is `503`, a missing, wrong or stale signature is `401`, a
  declared body over 64 KiB is `413`, every event other than `user.deleted` is `200
  { ignored: true }`, a payload without a Clerk `user_...` subject is `400`, and a successful
  write is `200 { received: true }`. Database credential failures are `503`, other database
  failures `502` and a timeout `504`. The response never reports success for a payload the
  database could not have produced.
- S14: The database routine `delete_account_for` is executable by `service_role` only; the
  shared `delete_account_as` helper is executable by no client role and no other entry point
  takes a supplied subject. `delete_my_account` keeps its three-field response and its
  session-only grant.
- S15: Evidence obligations for the provider path: RED before each behavior; a stub-driven
  HTTP suite that computes the standard-webhooks signature; pgTAP for the grants, both
  succession shapes, the tie-break, both departure cases, idempotence and refusals that
  write nothing; a signed-token PostgREST check with a real service-role call; `bun run
  check`, `bun run db:test` and `bun run db:test:postgrest`.
- S16: Provider scope boundaries: no endpoint registration, no secret committed, no
  deployment, no event-ID store or backfill, no hosted check. Registering the endpoint needs
  a public URL and remains a deployment decision.

## Tasks

- T1 [S3, S5, S6, S8] Record the decision in ADR 0004 and point the baseline's open
  question at it. Route: inline. Status: complete on 2026-11-14 in `5e5c266`. Risk: none.
- T2 [S4, S5, S6] Add the retention migration and the `delete_my_account` function.
  Route: inline. Status: complete in `995f97b`. RED was shown twice by local database
  mutation: without the transfer refusal the fingerprint probe failed, and with the
  electorate foreign key re-added the profile delete raised
  `group_vote_electorate_user_id_fkey`; `bun run db:reset` restored the schema. GREEN:
  `bun run db:test` PASS with eight files and 239 tests. Risk: items 1, 2 and 3.
- T3 [S7] Add `DELETE /profile` to the profile routes with its validation and refusal map.
  Route: inline. Status: complete in `b1bba3b`. RED observed with the route registered on
  another path: 0 pass and 7 fail. GREEN: 7 tests and 77 assertions. The only changed
  pre-existing expectation is the line that asserted the route was absent. Risk: items 3
  and 6.
- T4 [S9] Extend pgTAP with the account-deletion suite and data fingerprints.
  Route: inline. Status: complete in `995f97b`: 11 TAP assertions and 32 internal probes
  built through the real group, draft, publication and vote RPCs. Risk: items 1, 2 and 6.
- T5 [S9] Add the signed-token PostgREST check for the deletion path and its retention.
  Route: inline. Status: complete in `23c64c3`: 126 of 126 checks, up from 97, with the
  ballot page's opaque tombstone asserted on the real database. Risk: items 1 and 6.
- T6 [S9] Run the full local evidence set and the differential against the base revision.
  Route: inline. Status: complete. `bun run check` 182 tests and 3090 assertions plus the
  web suite; `bun run db:test` PASS with 239 tests. The 173 pre-existing tests are
  unchanged except the deliberate route-absence line. Risk: items 3 and 6.
- T7 [S1-S10] Record doc16, the delivery index, the API reference, the account guide, the
  completion plan and the handoff checkpoint. Route: inline. Status: complete after the
  verification fix. Risk: none.
- T8 [S1-S10] Independent read-only verification of the named high-risk items. Route:
  delegated verification with a fresh context. Status: complete on 2026-11-14. It
  reproduced the suite, the database runners, the changed pre-existing expectation and the
  acceptance shapes, re-ran the HTTP RED, and judged S1-S4 and S6-S10 met with one blocker:
  the ballot page validated every username as 3-20 characters while the database returns
  null for a retained tombstone, so a surviving group's ballot page answered 502 after a
  member deleted their account. Fixed in `449c8aa` with the verifier's probe committed as
  `apps/api/tests/vote-tombstones.test.ts`; its payload-combination advisory was also
  fixed. A recheck limited to that blocker and advisory confirmed it closed on 2026-11-14:
  the same committed test answers 502 against the baseline mapper and 200 against the fixed
  one, malformed non-null names still map to 502, and both impossible `deleted: false`
  payloads are refused while the four legitimate shapes still answer 200. Its remaining
  advisories are the zero-byte-body contract and the not-yet-recorded commit state that this
  document now carries. Risk: items 1, 2 and 3.
- T9 [S11, S12, S14] Record ADR0005 and add the shared routine plus the service-role-only
  provider entry point. Route: inline. Status: complete in the provider work unit. RED was
  shown by local mutation: replacing succession with a refusal and granting the provider
  routine to `authenticated` failed the privilege assertion and aborted the succession probe;
  `bun run db:reset` restored the schema. GREEN: `bun run db:test` PASS with nine files and
  250 tests. Risk: items 1, 2 and 3.
- T10 [S13] Add `POST /webhooks/clerk`, the secret-key database configuration and the
  environment documentation. Route: inline. Status: complete in the provider work unit. RED
  shown with the route registered on another path: 0 pass and 8 fail. GREEN: 8 tests and 86
  assertions. Risk: items 2, 3 and 6.
- T11 [S15] Cover the provider surface on the signed-token PostgREST script with a real
  service-role call, an authenticated refusal and an idempotent repeat. Route: inline.
  Status: complete: 136 of 136 checks, up from 126. Risk: items 1 and 6.
- T12 [S15, S16] Run the full local evidence set and record doc17, the reference, the guide,
  the plan, the handoff and this log. Route: inline. Status: complete. `bun run check` 190
  tests and 3176 assertions; `bun run db:test` 9 files and 250 tests. No provider setting was
  configured and no independent verification ran for the provider addition. Risk: none.

## Log

- L1: 2026-11-14: The task is backend completion M8, account deletion and exceptional
  lifecycle, as the next unfinished milestone of the completion plan, delivered on an
  isolated branch. M1-M7 already carry recorded evidence; M8 is the first milestone whose
  plan cell starts with a decision rather than an implemented interface.
- L2: Baseline inspected at `afea8bf`: the seven foreign keys that point at
  `public.profiles`, the group departure rules, the vote and electorate schema, the profile
  routes, the group RPC boundary and the existing test harnesses. No profile deletion path
  exists today, and every historical row that references a profile restricts its deletion,
  so a departed member can never delete their account.
- L3: The plan's own delivery note rules out two tempting shortcuts: M8 is not a request to
  delete current accounts by hand, and it is not a request to install a webhook. The slice
  therefore implements one app-owned surface and records provider reconciliation as a
  separate decision with named missing inputs instead of inventing a succession rule for a
  shared group.
- L4: The retention rule follows from what the surviving group still needs. A vote's
  outcome, its frozen electorate and its ballots are group records, not account records, so
  they keep the subject as a tombstone and lose only the foreign key that tied them to a
  deletable profile. Invitations and decided requests are audit rows of a surviving group
  and follow the same rule. The requester's own request rows keep their existing cascade
  because they are the departing account's own state.
- L5: The username releases on deletion for the same reason the rename rule releases it:
  no stored name outside the profile references a person. Group membership rows are deleted
  with the departure. This entry first claimed that the vote rows never rendered a username
  to a client, which was wrong: the ballot page does, and the independent verifier used that
  to find a real defect (L9).
- L6: T2 applies the retention migration locally with `bun run db:reset`, which reapplies
  all ten migrations in order, and the pgTAP suite passes. The function takes the group lock
  exactly where `leave_group` does, so it cannot deadlock against transfer, draft saves,
  publication or vote writes, and it never locks the profile row, which would invert the
  join path's order.
- L7: T3 hides the route to observe RED (0 pass, 7 fail) and restores it. The route delegates
  to one RPC with no parameters, so no caller can name another subject. The profile suite's
  single route-absence expectation changed on purpose; every other response shape remains
  pinned by the untouched tests.
- L8: T5 fits the deletion path into the existing signed-token sequence rather than a new
  script: the same fixtures, the same cleanup, and a leftover check that still reports zero
  rows. It also asserts the real database shape of the ballot page, which is what exposed
  the interaction L9 records.
- L9: T8's independent verifier found one blocker this slice caused: `group_vote_ballots`
  left-joins profiles and returns `username: null` for a retained tombstone, while the ballot
  page required 3-20 characters, so a surviving group's ballot page answered 502 after a
  member deleted their account. The slice's own suites could not see it because the HTTP
  tests stub the database and the SQL tests never render through the mapper. Fixed in
  `449c8aa`: the mapper reports `null` for that row and still rejects a malformed non-null
  name; the verifier's probe is committed as `apps/api/tests/vote-tombstones.test.ts` and its
  RED was reproduced by reverting the mapper. Its payload-combination advisory was fixed by
  rejecting `deleted: false` with a group. Two advisories stay recorded: an explicit
  zero-length body is refused as invalid input even though no body is accepted, and a
  profile deletion that races a fresh join can answer a generic 502 without writing partial
  state.
- L10: Session half, final local evidence after the fix: `bun run check` 182 tests and 3090
  assertions plus the web suite, `bun run db:test` PASS with eight files and 239 tests,
  `bun run db:test:postgrest` 126 of 126. The authored diff is 1241 insertions and 28
  deletions across 18 files, so publication needs a delivery-chain decision; nothing is
  pushed, published or merged, and no hosted project or provider setting was touched.
- L11: 2026-11-14: The owner authorized the decision ADR0004 had left open. ADR0005 picks
  the least destructive of the three candidate rules for a group whose owner can no longer
  act: succession to the longest-standing member, decided deterministically by `joined_at`
  then `user_id`. The alternatives were deleting shared group data, which destroys other
  people's packs, and retaining an owner who can never sign in, which leaves a group nobody
  can manage.
- L12: T9 shares one routine between the two entry points so the retention rules cannot
  drift, and exposes neither the helper nor the provider entry point to a client role.
  `delete_my_account` projects only its three contractual fields so its response stays
  byte-identical. The provider routine validates the subject before any write; an invalid
  subject leaves a fingerprint of every affected table unchanged.
- L13: T10 keeps the route independent of the session middleware. The signature is the only
  authority, both secrets fail closed, and the handler validates the database answer before
  reporting success. The HTTP suite computes the standard-webhooks signature the provider
  uses, including a stale-timestamp and a wrong-secret refusal, and the oversized-body guard
  is exercised with a 70 KiB payload.
- L14: T11 proves the provider path on the real PostgREST surface with the local stack's own
  service key: an authenticated token is refused, the service role succeeds, ownership moves
  to the first heir, and a repeat deletes nothing. The endpoint is not registered in Clerk
  and no hosted project was touched; that registration needs a public URL and stays a
  deployment decision.
