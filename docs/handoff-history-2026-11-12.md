# Backend handoff

> Historical record archived on 2026-11-12. The original checkpoint and subsequent
> workstation reports below are preserved in order, including superseded next
> actions. For the current state and next action, read the [current handoff](handoff.md).
> Link maintenance: the identity guide reference below omits a workstation-only
> heading that is not included in this publication. The original commands remain below.

Snapshot: 2026-11-10. Application implementation: `00f3e88` on
`feat/clerk-auth-replacement`, based on GitHub main `ad4056e` (including PR15).
The byte-identical review-only sequence ends at `b1a237a` on
`feat/clerk-review-slices`; intermediate commits must not be deployed separately.
`main` now carries the ten reviewed work units at `a7ae8fb`.
See [current tasks](../odd/tasks/clerk-auth-replacement.md) and
[roadmap milestone 2](plans/backend-roadmap.md). Verify Git before resuming.

Current workstation startup: see
[local startup correction and API configuration](#local-startup-correction-and-api-configuration).
Current hosted test outcome: see
[real identity tests and remaining prerequisites](#real-identity-tests-and-remaining-prerequisites-2026-11-12).

## Current application

- Clerk owns accounts and sessions. Hono validates signed Clerk tokens for `/me`
  and `/profile`; the Supabase credential/confirmation/recovery proxies are removed.
- Supabase remains the profile database with subject-scoped JWT/RLS and no
  service-role application bypass. The forward migration uses direct Clerk IDs,
  retaining old UUID-owned rows without deletion, reassignment or email linking.
  Existing username rules are preserved; legacy rows remain unlinked and reserved.
- Local first-party Supabase email/SMS/signup, anonymous sign-in and SMTP capture
  are disabled. Historical schema and JWT infrastructure remain for migration
  replay and database third-party trust, not as another application login provider.
- Public Modrinth search, resolution and `.mrpack` export remain unchanged.

## Observed verification

- Types and final 56 tests / 1200 assertions passed; frozen installation did not
  change the lockfile. Credential-free production build and disposable upgrade passed.
- Independent verification passed: 68 API probes, 24 bridge probes, 22 exact public
  baseline comparisons and 8 SQL groups, including retained data and unchanged
  state after rejected operations. Four documentation inconsistencies were corrected
  in one batch and independently rechecked.
- Every chain boundary passes typecheck and the full suite (48, 45, 39, 38, 38, 44, 53, 56 and 56 tests, zero failures), so each published commit is independently green.
- Native checking completed across 13 review ranges: 11 approved and acknowledged,
  plus 2 passive structural checks. All approved authority was consumed; do not replay.
  One severe web-middleware claim was refuted. Non-blocking warnings/suggestions
  remain follow-up material, not open corrections or new product requirements.
- The oversized full candidate was explicitly declined after context-budget
  refusal; there is no single full-candidate native approval. Per-range results
  and commits are recorded in the task document. Review mode remains enabled.

## Remaining work and exact next action

Merged into `main` at `a7ae8fbb49de4911cd61c42924a596583fc3912f` by fast-forward.
Chain PRs #30-#39 are closed: #31 merged into the tracker, the rest integrated by that
fast-forward. Nothing is deployed. The predecessor PR #16 is closed as replaced and its
fork branch remains at `2818357`.
Next action: configure and verify hosted Clerk sign-in and Supabase third-party JWT trust
in a non-production project before any release.

Hosted Clerk sign-in/email/OAuth, hosted Supabase JWT trust and hosted CI have not
been verified. The full local Supabase pgTAP stack was not rerun; isolated SQL,
the upgrade regression and independent database probes supplied local evidence.
Do not reset a developer database or configure external accounts without consent.

This closure changes only passive status records, not the reviewed application,
tests, dependencies, configuration or migrations. Preserve unrelated `.atl/`,
`graphify-out/`, other worktrees and the original implementation commit.

## Local workstation setup (2026-11-11)

Verified `main` at `22318bc`: `a7ae8fb` is an ancestor, with no application or
configuration changes since that snapshot. Preserved existing untracked `.atl/`.
Node 26.8.2 satisfies `>=22`; Bun 1.4.4 is installed at `~/.bun/bin/bun`, although
the setup shell needed that directory added to its process-local `PATH`.

- `bun install --frozen-lockfile`, `bun run check` (56 tests, 1200 assertions)
  and `bun run build` passed. The tracked lockfile remained unchanged.
- Started the existing `bun run dev` script. Observed HTTP 200 at
  `http://localhost:3000/` and `http://127.0.0.1:3001/health`, with the expected
  health JSON. These observations do not guarantee that processes survive a
  session or machine restart.
- The web displayed its Clerk setup notice; `/api/me` returned the expected 503.
  Both target environment files were absent and confirmed ignored by Git.
  Reading their `.env.example` templates was permission-denied, so no environment
  files were created and no credentials were accessed or printed.
- Next.js development startup changed the generated `apps/web/next-env.d.ts`
  references to development types and created `apps/web/AGENTS.md`. These remain
  uncommitted generated changes, not feature implementation.

The user subsequently authorized the existing Supabase and Clerk CLI sessions
for local environment configuration, confirming `modpack-creator-version-final`
as the exact project/application name in both platforms. Read-only CLI listings
returned one exact match on each platform. No keys were retrieved. Reading the
API environment template was still permission-denied; neither environment file
was created.

The user then created `apps/api/.env` and `apps/web/.env` (not `.env.local`).
Existence and Git ignore status were checked without reading either file. The
original development process tree was verified and restarted with `bun run dev`.
Delegated HTTP verification and a parent spot check found API `/health` returning
200 with the expected JSON, and anonymous API `/me` returning 401. Web `/` and
`/api/me` returned 500. Sanitized log inspection identified the exact error:
`Publishable key not valid (expected format: pk_test_... or pk_live_...).`
No credential value was read from the environment files, printed or modified.
The earlier passing tests and build were not rerun; they are prior observations,
not proof of the user's new configuration. Services were left running for diagnosis.

With explicit permission to replace the two web Clerk keys, the installed Clerk
CLI pulled Development keys for the previously confirmed application directly
into `apps/web/.env`; it exited 0 and all CLI output was suppressed. Its documented
merge preserves other variables. No direct environment-file read or secret
output was used. After restarting, the bounded recheck found HTTP 307 Clerk
handshake redirects at both web `/` and `/api/me`, rather than the previous 500.
The verifier did not follow external redirects, so successful browser rendering
and a final anonymous web identity response are not yet proven. Clerk documents
the Development handshake in its authentication overview; do not mistake an
initial redirect for either a new application defect or completed verification.

### Paused for workstation shutdown (2026-11-11)

The user explicitly stopped work to turn off the PC. The verified development
process tree was terminated cleanly; no browser check or further implementation
was started. No commits were made. Preserve these existing working-tree paths:
modified `docs/handoff.md` and generated `apps/web/next-env.d.ts`, plus untracked
`.atl/` and generated `apps/web/AGENTS.md`. Both ignored environment files remain
on disk. The CLI keys belong to the selected Clerk Development application, but
the API's public-key/issuer match and Supabase settings have not been validated.

Exact next action after resuming:

1. Read this handoff and verify `main` still points to `22318bc`, reconciling any
   newer user changes without overwriting them. Restore the project-scoped memory
   context. Continue the existing Paseo progress run; T02 is complete and T03 is
   paused, not complete.
2. Start the existing scripts from the repository root with
   `PATH="$HOME/.bun/bin:$PATH" bun run dev`. Dependencies were already installed
   with the frozen lockfile; do not update packages or reinstall unnecessarily.
3. Recheck API `/health` at `http://127.0.0.1:3001/health`, then open
   `http://localhost:3000` in a fresh isolated browser and permit only the expected
   selected Clerk Development handshake and its return to localhost. Do not print
   redirect querystrings, cookies, tokens, raw logs or environment contents. The
   browser check was planned but never launched before shutdown.
4. Check that the home actually renders and that an anonymous same-origin
   `/api/me` request reaches the expected response after the handshake. Do not
   create an account or infer a verified signed session from anonymous checks.

The earlier passing tests and build remain historical evidence, not fresh proof
of this configuration. Hosted sign-in, OAuth, email, Supabase JWT trust, profile
schema and RLS remain unverified. The user authorized necessary local setup and
verification, not deployments, publication, external settings, migrations or
resets. No source implementation, remote configuration or database was changed.

### Resumed workstation check (2026-11-11)

Resumed from the preceding checkpoint: `main` remains at `22318bc`, with the same
modified/untracked paths and both ignored environment files present. Node 26.8.2,
Bun 1.4.4 and the installed dependencies remain available; no reinstall or key
update was performed. Restarted the existing root `bun run dev` script and left
its services running on loopback for inspection.

Fresh observations:

- API `http://127.0.0.1:3001/health`: HTTP 200 and exact expected JSON.
- Anonymous API `/me`: HTTP 401. This does not prove signed-token verification.
- Initial web requests to `localhost:3000` and directly to `127.0.0.1:3000`
  each timed out after 25 seconds; the IPv4 check bypassed proxy configuration.
- A single fresh, allowlisted `agent-browser` navigation to the IPv4 URL failed
  after approximately 31 seconds, without committing a document or exposing an
  HTTP status. No account login, session reuse or external configuration occurred.
  The isolated browser was closed. Its offline quick diagnostic reported no
  failures. The conditional same-origin `/api/me` probe was not run because the
  home never loaded.
- Sanitized startup inspection showed Next.js ready and listening in IPv4, but
  no request, compilation or error entries. This does not establish where the
  request stalls; no root cause is confirmed. Do not infer a Clerk or application
  defect from the absence of a request-log line.

Next action: ask the user whether opening `http://127.0.0.1:3000` in their own
browser loads the home, keeps loading, or displays an error. Preserve the running
services for that check. T03 remains blocked on successful web navigation; the
setup is not complete. Do not repeat identical probes or change configuration
without new evidence. No source changes, environment-file reads, credential
updates, commits, migrations or remote settings changes were made on this resume.
Previous suite/build results remain historical and were not rerun.

### Local startup correction and API configuration

Controlled comparisons found that configured Clerk requests failed with the
original `127.0.0.1` web bind: Turbopack stalled, while Webpack exposed a loopback
self-proxy `ECONNRESET`. Temporarily emptying the two Clerk keys in the process
environment only produced the documented credential-free fallback; that process
was stopped. With the real keys restored and the hostname set to `localhost`,
both Webpack and the default Turbopack returned the expected web responses.
Clerk's absolute resume rewrite and Next's origin-based proxy decision explain
the hostname-sensitive behavior. No auth guards, source code, dependency versions
or package scripts were changed.

Use these existing scripts in separate terminals on this workstation:

```sh
PATH="$HOME/.bun/bin:$PATH" bun run dev:api
PATH="$HOME/.bun/bin:$PATH" bun run dev:web --hostname localhost
```

The plain root `dev` script still uses its original IPv4 hostname; use the
documented override here rather than reintroducing the reproduced failure.
See [the local identity guide](guides/local-identity.md).

A fresh isolated browser completed the selected Clerk Development handshake,
rendered `http://localhost:3000/` with HTTP 200 and **Sign in**/**Create account**
controls, without the setup notice or an error overlay. An anonymous same-origin
`/api/me` request returned 401. The browser was closed without signing in.

The user explicitly authorized necessary local environment corrections. Safe
comparison found the API issuer and Supabase URL/key did not match the selected
test projects. Read-only CLI discovery confirmed the existing Supabase project;
only its publishable key was selected, without secret-key reveal. The selected
Clerk Development instance's public JWKS supplied a unique RSA signing key,
converted to PEM. Only `CLERK_ISSUER`, `CLERK_JWT_KEY`, `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` in ignored `apps/api/.env` were atomically updated with
mode 0600; unrelated variables were preserved. In-memory comparison verified the
selected values without printing them. No service-role key was used and no
remote settings or database data were changed.

The API was restarted to load these corrections. Final `bun run check` passed
(56 tests, 1200 assertions), and `bun run build` passed. The lockfile hash remains
unchanged. Independent read-only checks confirmed web HTTP 200, anonymous web
`/api/me` HTTP 401, exact API health JSON/HTTP 200, an RSA public key matching the
selected Clerk JWKS, and the expected API issuer, allowed origin and hosted
Supabase URL/key format. An optional Supabase CLI comparison in an isolated HOME
could not access the CLI session; the parent then completed that exact read-only
comparison using the authorized session and confirmed that the configured
publishable key belongs to the selected project. No secret-key reveal was used.

Risk: item 2 (local credential configuration; independently checked without
altering authentication guards or external settings).

Local setup is complete for startup. Both services are left running:
`http://localhost:3000` and `http://127.0.0.1:3001/health`. To restart them later,
use the two explicit commands above; the default IPv4 web bind is unchanged.
The only tracked edits are this handoff and the local identity guide; generated
`next-env.d.ts` returned to its tracked form after the build. Preserve pre-existing
untracked `.atl/` and generated `apps/web/AGENTS.md`. No commits were made.

Real signed-in sessions and **Check API session** were subsequently exercised
with two explicitly authorized disposable users, as recorded below. Hosted
profiles/RLS, full OAuth and email delivery remain blocked or unverified.
Existing local environment files must remain ignored and private.

### Real identity tests and remaining prerequisites (2026-11-12)

The user authorized two temporary users in the selected Clerk Development
application and their profiles in the selected hosted Supabase project, followed
by cleanup of only those fixtures. Existing users/data, external settings,
migrations and resets were excluded. No service-role key was used.

A server restart erased the original temporary workspace and stopped both local
services. The exact existing fixture email/external-ID markers were reconciled;
no replacement users were created. Only their disposable passwords were restored
for testing. Durable private receipts replaced the ephemeral workspace, and the
services were restarted using the documented commands.

Observed verification used actual browser controls and Clerk-signed JWTs:

- Both users signed in with their test passwords and the official Development
  test-email OTP. Each browser identity, session and `sub` matched its fixture;
  `sid`, `azp` and expiry were valid. The two identities/sessions were distinct.
- The actual **Check API session** control, same-origin `/api/me` and direct
  Hono `/me` returned HTTP 200 for the correct user with `no-store` responses.
- Altered JWT signatures and anonymous requests were rejected with HTTP 401.
  UI sign-out cleared Clerk state and returned web `/api/me` to HTTP 401.
  Immediate invalidation of an already-issued JWT at Hono was not asserted;
  offline verification retains the documented expiry window.
- The report contains 36 observations: 30 passed checks, two absent-role
  observations, two blocked profile checks and two observational-only notes.
  They are not 36 successful integration tests.

Profiles/RLS are blocked by two confirmed prerequisites: genuine session JWTs
lack `role: "authenticated"`, and a fresh read-only query shows that hosted
`public.profiles` does not exist. `/profile` returns 401 at the role guard, before
database access. No profile rows were written, and no migration, JWT-claim
configuration or third-party trust setting was changed. Hosted trust itself
remains unverified; do not infer it from the local identity success.

Google/Discord are configured and their buttons are visible, but no external
provider account completed OAuth. The reserved `+clerk_test` email/OTP flow does
not establish real mailbox delivery or sign-up verification. No personal OAuth
session or inbox was used.

Cleanup completed: both receipt-bound users were deleted with provider
confirmation and exact filtered absence checks. No non-fixture users were modified.
No Supabase rows required deletion. Disposable passwords and saved JWTs were
removed; isolated browsers were closed. Safe results and cleanup receipts remain
in private local state under `~/.local/state/modpack-creator-version-final/`.
The Paseo progress plugin was unavailable after the restart; its dashboard could
not be closed or updated, so this document is the current checkpoint.

Next decision: obtain explicit permission to prepare the selected test database
with the repository migrations and configure the authenticated role / necessary
Clerk-Supabase JWT trust, then rerun only the blocked profile/RLS checks with
disposable fixtures. Do not apply those changes under the earlier fixture-only
authorization. Full OAuth and real email delivery additionally need controlled
provider accounts and a real test inbox. Services are left running; no commits
or application implementation changes were made by these tests.
