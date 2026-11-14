# 0005: Provider-side account deletion reconciliation

- Date: 2026-11-14
- Status: Accepted; implementation and local verification tracked in
  [doc17](../delivery/doc17-account-reconciliation.md).
- Source: The owner authorized the reconciliation decision that
  [ADR0004](0004-account-deletion.md) had left open.
- Amends: ADR0004's deferral of provider reconciliation. ADR0004's other rules stand.

## Decision and consequences

A Clerk-side deletion is treated as authoritative for the identity. Once the provider no
longer holds the account, the application must not keep an owner who can never sign in
again, and it must not destroy a group other people still use. The app therefore reconciles
one provider event, `user.deleted`, through the authenticated webhook `POST /webhooks/clerk`.

**Ownership when the deleted account owned a group with other members.** Ownership passes
immediately to the remaining member who has been in the group longest, ordered by
`joined_at` and then by `user_id` to be deterministic. No acceptance step is required,
because D5 already makes ownership transfer immediate and non-consensual. The group, its
draft, its publications and its votes are untouched; the departing owner stays in historical
rows as an opaque subject. A provider deletion is the only path that transfers ownership
automatically: an account holder who can still sign in must transfer first, exactly as
before, because that person can act and a silent auto-transfer would remove a choice they
still have.

**Every other case reuses ADR0004.** A member loses that membership and the group survives.
The last member deletes the group and everything beneath it. The profile and its username
are deleted and the name is released. Historical votes, frozen electorates, ballots,
invitation creators and request deciders keep the subject as a tombstone. A repeated event
writes nothing and reports that nothing was deleted.

**Transport and authentication.** The route accepts only a request whose signature verifies
against `CLERK_WEBHOOK_SIGNING_SECRET`; an unconfigured secret fails closed with `503`, and a
missing or wrong signature answers `401` without touching the database. Only `user.deleted`
is acted on; every other event type is acknowledged and ignored so provider retries do not
accumulate failures. The database write uses `SUPABASE_SECRET_KEY` against the
`delete_account_for` routine, which is executable by `service_role` only. A request whose
payload does not carry a Clerk `user_...` subject is refused with `400`. A body larger than
64 KiB is refused with `413`.

**Trade-offs accepted.** A member becomes owner without being asked, which is the price of
keeping shared data alive when its owner disappears; that member can transfer it onward or
leave. The route is unauthenticated by session and therefore depends entirely on the signing
secret and on Clerk delivering only genuine events. The app still cannot distinguish a
provider deletion from a provider outage, so it acts only on the delivered event and never
polls the provider.

## Boundaries

No provider setting is configured by this decision: registering the endpoint and its signing
secret in Clerk needs a public URL, which is a deployment step. No existing account is
deleted, no secret is committed, and no service-role credential is used for any
session-authenticated route. Deploying, publishing and merging remain separate owner
decisions.
