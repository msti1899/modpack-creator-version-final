# doc08: Account and session runtime proof

Date: 2026-11-13
Scope: Close the real-session proof that milestone 2 and the completion plan recorded as
missing, and pin two local assurance gaps. No endpoint, policy or application behavior
changed.
Baseline: `origin/main` at `576ddfd`; work on `feat/backend-account-session`.

## Objective

The completion plan proposes accounts and sessions as the first user-journey milestone.
Most of that path already existed: Clerk owns accounts and sessions, the API verifies
signed RSA tokens locally, and the web adapter bridges the session to the independent
API. What was missing was recorded runtime behavior for a real signed session, and any
local test of the environment-driven configuration path. The owner authorized starting
that slice and a live check against the configured development instance.

## Changes and rationale

- [apps/api/tests/identity.test.ts](../../apps/api/tests/identity.test.ts) pins the
  production configuration path of `createApp`, which no existing test reached because
  every API test injected identity options: escaped-newline PEM normalization,
  comma-separated authorized parties with surrounding whitespace trimmed, an unlisted
  browser origin refused, and an expired session still refused.
- [apps/web/tests/identity.test.ts](../../apps/web/tests/identity.test.ts) pins that a
  throwing Clerk token lookup produces `502` and not a sign-out `401`, that no identity
  is cached between the signed-in, failed and signed-out results, and that the API is
  not contacted in either failure case.
- [scripts/test-account-session.ts](../../scripts/test-account-session.ts) adds a live
  check against the configured Clerk development instance. It creates one uniquely named
  `+clerk_test` account, completes an email/password sign-in including the new-device
  trust challenge, mints a real session token, and asserts `/me`, `/profile` and the
  sign-out boundary. It deletes the account in a `finally` block, refuses to run without
  `--live`, and refuses any key that is not a development-instance key. It prints no
  secret, password or token value.

Both new tests were shown to fail when the behavior they pin is mutated: removing the
PEM normalization fails the configuration test, and mapping the token-lookup failure to
`401` fails the web test.

## Verification

Environment: CachyOS Linux, Bun 1.4.4, local API at `127.0.0.1:3001` with the repository
`.env` files, Clerk development instance, and the selected test Supabase project.

- Focused run, before the new tests: 12 tests passed in
  `apps/api/tests/identity.test.ts` and `apps/web/tests/identity.test.ts`. After adding
  them: 14 passed, 167 assertions.
- `bun run check` on the combined tree: 127 tests passed, 0 failed, both application
  typechecks clean.
- `bun scripts/test-account-session.ts --live` passed every check on 2026-11-13: test
  account verified and password-capable, password sign-in reaching the password factor,
  password factor verified, new-device trust challenge sent and completed, session
  created, session token issued, `GET /me` accepting it with the same subject,
  `no-store` and `Vary: Authorization`, missing credentials refused with `401`,
  `GET /profile` reaching the database with the same token, and `no-store` on the
  profile response.
- The script's guards were executed: without `--live` it exits `2` with its refusal
  message; with a `sk_live_` key it exits `2` before any provider call.
- Fixtures were removed. The instance holds only the owner's account; the verification
  created and deleted every test account it used, including one left behind by an
  interrupted attempt.

## Findings

- **The full Clerk → Hono → PostgREST chain works with one token on the test project.**
  The earlier handoff recorded this as unproven because a local stack cannot share one
  signing key between Hono's RSA verification and PostgREST's symmetric secret. Against
  the hosted test project the same session token is accepted by both, on the read path.
- **`/me` returns a null email claim.** The contract permits it, but the configured
  session token template omits the email, so any client that needs the address must get
  it from a template change in the provider, not from application code.
- **Automated registration is blocked by provider abuse protection.** A sign-up through
  the frontend API returned `action_blocked` with a support reference. That check cannot
  be automated around without circumventing a security control, so the real sign-up UI
  journey remains a person-in-a-browser task.
- **The in-app account controls work.** A later check the same day signed in through the
  app's own modal, reached `/api/me` and signed out again (see the browser journey). An
  earlier note that the component layer never loads was an artifact of the automation
  browser, not an application defect.
- **A token copied before sign-out keeps verifying until it expires**, observed rather
  than assumed. Sign-out stops new tokens at the provider, which is what the application
  relies on. Immediate invalidation of an already-copied token remains an explicit
  product decision, and the completion plan lists it as open.

## Browser journey

The local web app was exercised in a real browser on 2026-11-13 with a disposable fixture,
using the app's own account controls rather than the hosted portal.

- `http://localhost:3000` renders the signed-out controls. The component layer is present
  (`window.__internal_ClerkUICtor` is a function and the reported `uiVersion` is `1.42.5`),
  and `Clerk` reaches `status: "ready"`.
- "Sign in" opens the modal with the configured Discord, Google and email/password methods.
- Email/password sign-in completed, including the new-device trust code, and the page
  switched to the signed-in state with the account menu and the API-session link.
- "Check API session" returned `{"user":{"id":"user_…","email":null}}` from `/api/me` with
  `Cache-Control: no-store`, so the web proxy and the independent API both accepted the
  browser session.
- "Sign out" from the account menu cleared the session; the page returned to the signed-out
  controls and `/api/me` answered `401` with `{"error":"Authentication required."}`.

### Correction: the earlier defect report was an environment artifact

The first attempts to exercise this journey loaded the app at `http://127.0.0.1:3000`
instead of `http://localhost:3000`. Next 16 blocks its development resources for that
origin (`Blocked cross-origin request to Next.js dev resource … from "127.0.0.1"`), so the
client bundle never hydrated. The page rendered server HTML with inert buttons, Clerk
stayed in `loading`, and `openSignIn()` reported that no UI components were loaded. That
was recorded as two application defects; both claims are withdrawn. Repeating the same
steps on `localhost` against unmodified application code produced the working journey
above, and no application change was shipped.

The practical rule for this repository: open the dev server on the hostname Next expects,
or add the alternate origin to `allowedDevOrigins` before drawing conclusions from a
browser check. An automation run that shows no hydration is evidence about the harness
first, not about the app.

## Delivery state

- Implementation and documentation: complete on `feat/backend-account-session` as two
  work-unit commits, the tests-and-handoff commit first and this record with the live
  check second.
- Review: the per-commit risk assessment returned `medium` with `under_budget`, so no
  native review was due for the test commit.
- Publication, merge and deployment: not started. The branch is local.

## Remaining work

- Automated registration through the frontend API stays blocked by provider abuse
  protection; the in-app modal and the hosted portal are both working paths for creating
  an account.
- A profile write path was deliberately not exercised: no endpoint deletes a profile, so
  a write would leave a row for a deleted account.
- Email/OAuth provider journeys beyond the owner's own verification, and the production
  Vercel environment, remain separate authorized work.
- Immediate revocation of a copied token is still an open product decision.
- The [current handoff](../handoff.md) owns the present checkpoint and next action.

## References

- [Completion plan](../plans/backend-completion.md) milestones M1 and M2.
- [Backend roadmap](../plans/backend-roadmap.md) milestone 2.
- [API reference](../reference/backend-api.md), [account access guide](../guides/local-account-access.md).
- [ADR0002](../decisions/0002-clerk-identity.md), [ADR0003](../decisions/0003-clerk-profile-ownership.md).
