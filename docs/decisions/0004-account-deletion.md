# 0004: Account deletion and retention

- Date: 2026-11-14
- Status: Accepted for the application-owned surface; provider reconciliation deferred.
- Source: Completion-plan milestone M8, implemented on an isolated branch from `afea8bf`.
- Relates to: D3 (accounts and usernames), D5 (owner permissions and departure), D7
  (voting), ADR0002 and ADR0003 (Clerk owns identity and profile ownership).

## Decision and consequences

Deletion is in this phase's scope for one surface only: an authenticated account holder
deleting their own application data through the API, `DELETE /profile`, implemented by the
`delete_my_account` database function. Clerk remains the owner of the identity, the
credential and the sign-in session. This decision authorizes no provider API call, no
webhook, no administrator route and no bulk or manual deletion of existing accounts.

Ownership and membership follow D5 without a second rule. An owner who still has other
members is refused with `409 Transfers are required before leaving a group with other
members.` and the refusal writes nothing, so the remedy is the existing ownership
transfer. The last member of a group deletes the group and everything beneath it, exactly
as the documented last-owner departure already does. A member's deletion removes that
membership and leaves the group, its draft, its publications and its votes intact. The
whole deletion is one transaction: a refused call leaves every row unchanged.

Historical ballots and post-departure records are retained, never rewritten. A vote, its
frozen electorate, its cast ballots, an invitation's creator and a request's decider are
records of a group that outlives one membership, so they keep the Clerk subject as a
tombstone and lose only the foreign key that tied them to a deletable profile. Vote
counts, electorate size and the frozen participation rule for an open vote therefore do
not change when a participant deletes their account, and no surviving vote loses a
ballot. The two foreign keys that protect group integrity, `groups.owner_id` and
`group_members.user_id`, stay in place; the departure step removes those rows first. The
departing account's own join-request rows keep their existing cascade, because they are
that account's own state and not a group record.

The profile row is deleted and the username is released immediately, consistent with D3's
rename rule. No tombstone username and no other stored display name survives, because the
profile row and group membership rows are the only rows that carry a username and nothing
else stores one. A subject tombstone in a historical row can no longer resolve to a name;
it identifies a participant only as a stable opaque identifier.

Provider events. This phase consumes no provider event, so no provider event can write a
partial or inconsistent record. The residual is a known limit, not a hidden behaviour: an
account deleted only in Clerk, bypassing the API, leaves an inaccessible profile row whose
username stays reserved. No client can act on that row because every read requires a valid
token for that subject. Reconciling it needs three inputs that this decision does not
grant: a webhook signing secret, a service-role credential for a signed-in-free write, and
a rule for a group owner who no longer has a usable account while other members remain.
That third rule is a product choice between deleting shared group data and transferring
ownership without the owner, and it must be decided before any reconciliation code exists.

Trade-offs accepted: historical rows keep opaque subject identifiers after the account is
gone; a released username can be chosen by a different person; and a provider-side deletion
stays unreconciled until a later, separately authorized decision. None of these changes a
group's stored pack, publication, vote or ballot content.

## Boundaries

No webhook, service-role credential, automatic ownership succession, administrator
surface, new cascade, frontend, deployment or publication is authorized by this decision.
Deleting a current account, applying this to a hosted project and publishing or merging the
slice remain separate owner decisions.
