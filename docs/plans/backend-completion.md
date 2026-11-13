# Backend completion: verification, identity, production

Status: Proposed
Source: The owner asked for a new backend plan after milestones 1-6 were merged and the
local database proof landed. This document is a proposal, not approved scope. No item
here is a requirement until the owner approves it.
Current checkpoint: [handoff](../handoff.md)

## Outcome and boundaries

Observable result: every claim the backend roadmap makes has either reproducible proof
or a recorded blocker, a person can create an account with Google or Discord and link a
second sign-in method, and the API can run outside a developer laptop.

Excluded unless separately approved: new product behavior for groups, packs or votes;
frontend features; CurseForge; multiple groups per user; multiple packs per group; the
desktop launcher. Publishing, merging and any external account setup stay separate
decisions.

Where the backend stands today: milestones 1-6 are merged, all nine migrations are
applied to the selected test project, and local proof exists for pgTAP, the upgrade
regression, multi-session races and signed-token PostgREST calls. What is missing is
hosted functional proof, three review closures, and everything needed to run outside a
laptop: the API entry binds `127.0.0.1`, there is no image, and CI only checks.

## Milestones

| Milestone | Acceptance criteria | Implementation / verification / delivery |
| --- | --- | --- |
| 1. Verification close-out | Every roadmap claim ends with an observed result or a named blocker. A native review of the merged database-proof slice, the milestone 3 review closure and the milestone 5 review are attempted and their outcome recorded. The race checks are mutation-tested: removing a lock or the one-group index in a scratch copy makes a check fail. | Needs no external account. Review runs need candidate consent. Mutation work happens in a `mktemp -d` copy, never in the workspace. |
| 2. Hosted functional proof | A real signed session exercises publication and voting against the selected test project: publish, activate, export, open a vote, cast ballots, approve, incorporate. A non-member is refused by every read and write. | Needs a browser session with a test account on the hosted project. Fixtures are removed afterwards. |
| 3. Complete identity | A new account signs up with Google, a second provider is linked from account settings, the last sign-in method cannot be unlinked, and recovery mail arrives. Password sign-in stays email-only with a unique username. | Needs provider applications and a real mailbox; Clerk owns the account flows, so the work is configuration plus a documented account-settings path, not new auth code. |
| 4. Production readiness | The API runs outside a laptop with production-safe defaults, configuration comes from the environment, CI deploys from `main`, and a smoke request with a real token succeeds. A rollback is described and exercised. | Conditional on approval: the current roadmap excludes CI/CD. Needs a hosting decision, a production entry point (today `apps/api/src/dev.ts` binds loopback), and the five existing environment variables per environment. |

## Dependencies and open decisions

- Production scope: deployment is outside the approved roadmap. Milestone 4 waits for
  an explicit decision and a named target platform.
- Hosting: Supabase currently provides only the database and PostgREST here. The API and
  the web app need their own runtime and a domain.
- External accounts: Google and Discord applications, a real mailbox, and Clerk
  dashboard access. None of these can be created locally, and none are authorized yet.
- Provider linking is already decided as manual from account settings while signed in,
  with no automatic email-based merging and no unlinking of the last method. The open
  part is the documented path a user follows, not the rule.
- Hosted functional proof needs a test account and a real browser session; a locally
  minted token cannot stand in for it.
- The local `main` branch is checked out in another worktree (`pack-drafts`), so work on
  `main` from this checkout needs that worktree released or a fresh checkout.

## Next action

Decide whether milestone 4 is in scope and, if it is, name the target platform. Milestone
1 can start immediately without that decision because it needs no external account.

## Change log

- 2026-11-13: Proposed after milestones 1-6 and the local database proof were merged.
  Scope covers verification close-out, hosted functional proof, complete identity and,
  conditionally, production readiness.
