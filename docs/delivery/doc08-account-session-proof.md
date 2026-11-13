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
- **The browser SDK did not initialize in the automation browser.** Clerk stayed at
  `status: "loading"` and never requested `/v1/environment`, even after the development
  handshake completed and both the development-browser and client cookies were present.
  Browser-level sign-out is therefore still unproven; this is recorded as an observation,
  not asserted as a product defect, because the cause may be the automation browser's
  cookie policy.
- **A token copied before sign-out keeps verifying until it expires**, observed rather
  than assumed. Sign-out stops new tokens at the provider, which is what the application
  relies on. Immediate invalidation of an already-copied token remains an explicit
  product decision, and the completion plan lists it as open.

## Browser journey

The account portal that Clerk serves for this instance was exercised in a real browser
against the local web app on 2026-11-13, with the same disposable fixture.

- The portal renders the configured methods: Discord, Google, email address and password.
- Email/password sign-in completed, including the new-device trust code, and redirected
  back to `http://127.0.0.1:3000` with a live session.
- `GET /api/me` through the Next.js proxy returned `200` with that session's subject and
  `Cache-Control: no-store`.
- Deleting the `__session` cookie made the same request return `401`, so the proxy and API
  behave correctly when no credential is present.

Two defects were observed in the app surface, both independent of the API:

- **The in-app Clerk UI does not initialize.** The "Sign in" and "Create account" buttons
  render but do nothing. `Clerk.openSignIn()` throws `Clerk was not loaded with Ui
  components`, and `window.__internal_ClerkUICtor` stays `undefined` even though the page
  requested `@clerk/ui` and the CDN answered `200` with `application/javascript` after a
  `307` to the versioned path. `Clerk.load()` also had to be invoked manually for the
  instance to leave `status: "loading"`. The account journey is therefore unusable in the
  web app today even though the portal and the API both work.
- **Sign-out left a working session cookie.** After `Clerk.signOut()` resolved,
  `Clerk.session` was `null` and `status` was back to `loading`, but `__session` remained
  and `/api/me` kept returning the identity. Removing the cookie manually produced `401`.
  Because the SDK was already in a broken state on this page, the cause cannot be
  attributed to the app with confidence; it is recorded as observed behavior, not as a
  diagnosed defect.

Neither defect was fixed here: both need a change to the web application, which is a
separate slice from recording evidence.

### Investigation note for the UI defect

A follow-up attempt on 2026-11-13 was reverted without shipping, because no variant could
be verified end to end in the automation browser. What it established:

- The page requests `@clerk/ui` and the CDN answers `200` with `application/javascript`
  after a `307` to the versioned path, but `window.__internal_ClerkUICtor` stays
  `undefined` and the account controls have no component layer.
- Injecting the same bundle manually defines that global as a function, so the bundle
  itself is sound and the failure is in how the runtime picks it up.
- With the global present, `Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } })`
  applies the component layer immediately: `openSignIn()` succeeds, the modal renders the
  configured Discord, Google and email/password methods, and the reported `uiVersion` is
  `1.42.5`. That is the working mechanism to build on.
- Bundling `@clerk/ui` and passing `ui` to `ClerkProvider`, preloading the UI bundle with
  `next/script` before Clerk, and a client bridge that called `load({ ui })` after mount
  were each tried. None produced a verified working sign-in button in the automation
  browser, and the instance repeatedly stayed at `status: "loading"`, so none was kept.

Next attempt should start from the working `load({ ui })` behaviour above and confirm it
in a browser whose Clerk instance reaches `ready` without the automation cookie workaround,
then run the sign-in and sign-out journey through the real buttons.

## Delivery state

- Implementation and documentation: complete on `feat/backend-account-session` as two
  work-unit commits, the tests-and-handoff commit first and this record with the live
  check second.
- Review: the per-commit risk assessment returned `medium` with `under_budget`, so no
  native review was due for the test commit.
- Publication, merge and deployment: not started. The branch is local.

## Remaining work

- Fix the web account surface: the in-app Clerk UI never registers its components, so the
  sign-in and sign-up buttons are inert, and sign-out does not clear the session cookie in
  the observed environment. Both were reproduced on 2026-11-13 and belong to their own
  web slice.
- Automated registration through the frontend API stays blocked by provider abuse
  protection; the account portal is the working path for creating an account.
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
