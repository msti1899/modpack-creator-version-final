# doc17: Provider-side account deletion reconciliation

Date: 2026-11-14
Scope: The decision [ADR0004](../decisions/0004-account-deletion.md) left open: how a
Clerk-side account deletion is reconciled with application data, including the ownership of
a group whose owner can no longer sign in. Adds one unauthenticated, signature-verified
webhook route and one service-role-only database routine. No provider setting is configured,
no existing account is deleted and no secret is committed.
Baseline: `origin/main` at `afea8bf`; work continues on `feat/account-deletion`.

## Objective

After doc16, a deletion performed only in Clerk left an inaccessible profile whose username
stayed reserved, and a group whose owner could never act. The completion plan's M8 asks that
"provider events cannot strand inconsistent records", and ADR0004 recorded three missing
inputs before any reconciliation code: a webhook signing secret, a service-role credential
and a rule for an owner who can no longer act. The owner authorized that decision on
2026-11-14.

## Changes and rationale

- [ADR0005](../decisions/0005-provider-account-reconciliation.md) decides the rule. A Clerk
  `user.deleted` event is authoritative for the identity. When the deleted account owns a
  group with other members, ownership passes immediately to the member with the earliest
  `joined_at`, ties broken by `user_id`, with no acceptance step, because D5 already makes a
  transfer immediate. A member loses only the membership; the last member deletes the group.
  The profile and username are released and historical rows keep the subject tombstone. The
  session path keeps its transfer-before-deletion refusal, because that account holder can
  still act and must not lose the choice silently.
- New migration `20261114180000_account_reconciliation.sql` moves the existing rules into
  one shared `delete_account_as` routine, keeps `delete_my_account` as the session entry
  point with its unchanged three-field response, and adds `delete_account_for`, which is
  executable by `service_role` only. A client role cannot reach either the provider routine
  or the shared helper.
- New `apps/api/src/webhooks.ts` serves `POST /webhooks/clerk`. It fails closed with `503`
  when `CLERK_WEBHOOK_SIGNING_SECRET` is absent, answers `401` for a missing, wrong or stale
  signature, refuses a body over 64 KiB with `413` before verification — including a streamed
  body that declares no length — acknowledges every event other than `user.deleted` with
  `200`, refuses a payload without a Clerk subject with `400`, and writes through
  `SUPABASE_SECRET_KEY`. A refusal from the database is `503` when the credential is wrong
  and `502` otherwise; the response never reports success for a payload the database could
  not have produced, including a claimed succession without a surviving group.
- `database.ts` extracts the URL guard and adds the secret-key configuration, which accepts a
  current `sb_secret_` key or a legacy service-role JWT and rejects a publishable or
  wrongly-roled credential. `createApp` gains an optional webhook configuration, defaulting
  to the environment, so no existing call site changed.
- `apps/api/.env.example` documents both optional variables and their fail-closed behavior.

## Verification

Observed on 2026-11-14 against the local disposable stack, plus the stub-driven HTTP suite.

- RED was observed before each behavior. With the route registered under another path, the
  webhook suite reported 0 pass and 8 fail. With succession replaced by a refusal and the
  provider routine exposed to `authenticated`, `bun run db:test` failed
  "An authenticated session cannot call the provider routine" and aborted on the succession
  probe, and `bun run db:test:postgrest` failed five checks starting at
  "An authenticated session cannot reconcile a provider deletion". Both mutations were local
  only and `bun run db:reset` restored the schema; both suites returned to PASS.
- `bun run check` passes both typechecks, 192 Bun tests and 3196 assertions across 28 files
  (up from 182 and 3090), plus the web suite's 15 tests. The new webhook suite is 10 tests
  and 106 assertions.
- `bun run db:test` PASS with nine files and 250 tests, up from eight and 239. The new file
  contributes 11 TAP assertions and 22 internal probes.
- `bun run db:test:postgrest` passes 136 of 136 checks, up from 126, including a real
  service-role reconciliation that transfers ownership to the longest-standing member, a
  refusal for an authenticated token and an idempotent repeat.
- Independent read-only verification ran on 2026-11-14 in a fresh context over the provider
  range and found no blocker. It re-ran all three runners, re-derived the signature and
  grant REDs in a scratch copy, and confirmed the grants, the succession rule including a
  non-insertion-order case and a tie-break, the sealed refusals and the byte-identical
  `DELETE /profile` contract. Two advisories were fixed: three impossible database payloads
  that claimed a succession without a surviving group were acknowledged, and the body bound
  trusted a declared length so a streamed oversized body was fully buffered. Both now have
  RED evidence and a committed regression test; the pgTAP suite gained the
  non-insertion-order succession case.
- Scope of the proof: the signature is computed in the test with the same standard-webhooks
  scheme Clerk uses, and the database write runs against real PostgREST with the stack's own
  service key. No request came from Clerk, no provider endpoint is registered and no hosted
  project was touched.
- A genuine provider delivery was exercised on 2026-11-14 against the development instance,
  closing that gap: a disposable Clerk user was created, given a local profile row, and then
  deleted through the Backend API. The registered endpoint delivered `user.deleted` to the
  Clerk relay, the relay forwarded it to the running API, the API verified the real signature
  and deleted the profile within two seconds. The disposable user and its row were removed
  afterwards, and the instance again holds only the accounts that predate this check.

## Delivery state

- Implementation and documentation: complete on `feat/account-deletion` in six work units:
  `9b232ac` (decision), `bd0eba8` (database), `a86f5ec` (route and configuration), `a49e607`
  (signed-token checks), `6349c89`, `96c668f` and `73885ce` (records) and `85890d6` (the advisories this record
  describes).
- Review: one independent read-only verification pass over the provider range; no blocker,
  and its two advisories are fixed.
- Publication, merge and deployment: not started. No pull request exists, no commit is
  pushed, and no provider setting was changed.

## Remaining work

- The local environment is configured as of 2026-11-14: `apps/api/.env` is ignored and
  carries the local stack's publishable and secret keys plus the signing secret of one
  development webhook endpoint registered against the Clerk CLI relay. The running API
  answers `401` to an unsigned or forged delivery and `200 {received: true}` to a correctly
  signed one, and the same route deleted a real probe profile through the real PostgREST
  surface. The genuine delivery above is the live proof of that chain.
- The configured endpoint points at the local relay, which exists only while
  `clerk webhooks listen` runs, and its secret is not a production credential. A deployment
  needs its own endpoint and secret; until then a Clerk-only deletion in a live environment
  is still not reconciled. Clerk's Backend API exposes only the Svix app and its dashboard
  link, so that secret comes from the Dashboard.
- The webhook trusts the provider's delivery; it does not detect a missed event, so a failed
  delivery depends on Clerk's retry policy. No polling or backfill exists.
- A signature replay is bounded only by the library's timestamp tolerance, and no event ID
  store deduplicates deliveries. Both are acceptable for an idempotent write, and neither was
  exercised beyond the stale-timestamp refusal.
- The automatic succession was verified on the local stack and through PostgREST, not in a
  hosted session.

## References

- [ADR0005: provider-side account deletion reconciliation](../decisions/0005-provider-account-reconciliation.md)
- [ADR0004: account deletion and retention](../decisions/0004-account-deletion.md)
- [Profile guide](../guides/account-profiles.md) and
  [API reference](../reference/backend-api.md)
- [doc16: account deletion and retention](doc16-account-deletion.md)
- [Current handoff](../handoff.md)
