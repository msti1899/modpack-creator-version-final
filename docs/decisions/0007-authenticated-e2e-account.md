# 0007: Authenticated Playwright account and where those journeys run

- Date: 2026-11-25
- Status: Accepted for the local authenticated browser suite described below. Authorizes no
  deployment, no CI secret, no account for a person and no production access.
- Source: [Frontend roadmap](../plans/frontend-roadmap.md), open decision D-F5. Board item
  [#92](https://github.com/msti1899/modpack-creator-version-final/issues/92).
- Relates to: F1 onwards (every journey behind the session boundary), the cross-cutting
  acceptance rule that each interactive journey has a Playwright test, and
  [doc08](../delivery/doc08-account-session-proof.md), which proved the Clerk→API→database
  read path with a real session.

## Decision and consequences

D-F5 asked how automated browsers get an authenticated session. The premise recorded in the
issue was a dedicated account whose credentials live in CI secrets. The decision here
replaces that premise for the reason below, and fixes where the suite runs.

**One throwaway account per run, never a stored credential.** The authenticated run creates
one account through the Clerk Backend API with a `+clerk_test` address, signs in, and deletes
the account when the run ends, including when a test fails. Nothing is reused between runs,
so there is no long-lived account to rotate, revoke or leak, and no provider account has to
be created by hand. The account carries `privateMetadata.e2eTestUser`, so a later reader can
tell it apart from a real person's account before acting on it.

A killed process can still leave a live account behind, so three rules protect it:

- A failed provider deletion keeps the local record and fails the run. The next authenticated
  run deletes that account before creating its own, so a transient provider error does not
  become a forgotten account.
- An account created by a run that died before recording it is caught by a sweep at the start
  of the next run: accounts marked test-owned, carrying the run prefix and older than an
  hour are deleted. The age bound leaves a suite running in parallel alone.
- Without a development key there is nothing safe to attempt, so the cleanup warns and keeps
  the record instead of failing a credential-free run.

**Sign-in through the provider's testing helper, not through the product screen.** The suite
uses `@clerk/testing`'s `clerkSetup()` and `clerk.signIn({ emailAddress })`, which completes
the sign-in with a server-side sign-in ticket and saves the browser state for the journey
specs. Driving the product's own sign-in form was rejected: a new browser context triggers
Clerk's new-device trust challenge, and the delivered sign-in card deliberately does not
offer that step, so the form would fail for a reason that has nothing to do with the screen
under test. The form remains the path a person uses; the test bypasses it by design.

**Local, on demand; not a CI gate.** The authenticated suite runs against a locally running
API, the locally built web app, a Clerk development instance and the selected test database.
It is not wired into the Frontend CI browser job, because CI has no deployed API and no
provider secret, and because a CI job would create and delete provider state on every pull
request. The public suite keeps running in CI exactly as before, with the provider
credentials cleared.

**Guards that fail before any provider call.** The suite refuses to start without both keys,
refuses keys that are not development-instance keys (`sk_test_` / `pk_test_`), and prints no
secret, token or password. Those guards are checked by the config before any account exists,
the same rule `scripts/test-account-session.ts` already follows.

**Test data belongs to the test that creates it.** Deleting the provider account does not by
itself delete application rows: reconciliation needs a public webhook endpoint, which a local
run does not have. A journey that writes must therefore delete what it wrote in its own
teardown. The first authenticated journey is read-only, so a run leaves no rows behind.

### Consequences

- D-F5 is resolved for local verification. Every journey from F1 onward can now be verified
  with a real session instead of only reviewed.
- CI coverage of authenticated journeys stays open and belongs to the Operations milestone:
  it needs a deployed API and a decision about provider state in CI. This record does not
  promise it.
- A run mutates provider state by design: it creates and deletes exactly one account.
- The run needs `apps/web/.env` and `apps/api/.env` with the development instance and the
  selected test database, and needs port 3000 free, because the authenticated build must not
  reuse a development server that was built without provider credentials.

## How to run it

```sh
bun run test:e2e        # public journeys, provider credentials cleared
bun run test:e2e:auth   # creates one account, signs in, runs e2e/authenticated, deletes it
```

The first run of the authenticated mode builds the web app, so it takes longer than the
public suite. Its evidence is recorded in [doc27](../delivery/doc27-authenticated-e2e.md).
