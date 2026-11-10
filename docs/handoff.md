# Backend handoff

Snapshot: 2026-11-10. Application implementation: `00f3e88` on
`feat/clerk-auth-replacement`, based on GitHub main `ad4056e` (including PR15).
The byte-identical review-only sequence ends at `b1a237a` on
`feat/clerk-review-slices`; intermediate commits must not be deployed separately.
`main` now carries the ten reviewed work units at `a7ae8fb`.
See [current tasks](../odd/tasks/clerk-auth-replacement.md) and
[roadmap milestone 2](plans/backend-roadmap.md). Verify Git before resuming.

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
