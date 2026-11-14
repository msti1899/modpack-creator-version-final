# Backend completion M7: voting obligations and lifecycle

Branch: `feat/voting-obligations`, cut from `origin/main` at `ddd1b8f`. Worktree:
`/home/matias/projects/modpack-creator-version-final-worktrees/voting-obligations`.
Delivery: ask-on-risk. Forecast: 700-900 authored changed lines.
Runners: `bun test apps/api/tests/votes.test.ts`, `bun test apps/api/tests/votes-edge.test.ts`,
`bun run check`, `bun run db:test`, `bun run db:test:concurrency`,
`bun run db:test:postgrest`, and `bun scripts/test-vote-session.ts --live` only under
separate authorization.

## Specs

- S1: Completion-plan milestone M7 accepts when "Open/change/cancel/expire/approve/incorporate
  are exercised, including fixed electorate and concurrent independent proposals. An
  explicit decision explains what 'binding' requires and how conflicting pending
  additions are handled."
- S2: Completion-plan M7 delivery notes: "Depends on M4/M5. Do not automatically
  edit/publish/activate or block unrelated operations without approval. Deadline read
  semantics and notification scheduling are different concerns."
- S3: Existing D7 rules stay unchanged: owner-created votes with a chosen 1-720 hour
  duration, a frozen electorate that includes the owner, absolute majority with early
  approval, ballot replacement while open, owner cancellation, deadline rejection,
  several independent open votes per group, and binding owner incorporation that never
  edits, publishes or activates by itself.
- S4: The explicit decision M7 requires is recorded in D7 on 2026-11-13 and states:
  binding is an owner obligation discharged only by a successful incorporation; a
  pending obligation is an `approved` vote whose `incorporatedAt` is null and is read
  from the existing vote list; a pending obligation blocks no draft save, publication,
  activation, membership change or ownership transfer; ordering across several approved
  votes is the owner's choice with no queue and no automatic merge; the obligation
  belongs to the group and the current owner is the one who discharges it.
- S5: Conflicting pending additions are handled by the existing atomic draft contract,
  never by merging or deleting votes. A different draft revision returns 409 `Draft
  revision conflict.`; draft settings that no longer match return 409 `Vote does not
  match the draft settings.`; an addition already present in full with matching
  settings is satisfied, so the incorporation is idempotent, records `incorporatedAt`
  and leaves the draft and its revision untouched; a partially present addition returns
  409 `A proposed version is already in the draft.` and writes nothing. Every rejection
  leaves the draft, the vote and every ballot unchanged.
- S6: Evidence obligations for this slice: pgTAP assertions for the obligation read, the
  conflict matrix and ownership transfer; signed-token PostgREST coverage of the whole
  vote lifecycle; real multi-session races for concurrent independent incorporations and
  for one vote incorporated twice; and a hosted live check with real Clerk sessions that
  refuses without `--live`, refuses non-development credentials and a local database URL,
  prints no secret or token, and cleans up everything it creates.
- S7: Scope boundaries: no new endpoint, no new table, no publication or activation side
  effect, no notification scheduler, no frontend. Only the incorporation function gains
  the idempotent-satisfaction branch; every other route, message and status stays as
  documented. Deployment, publication and merge remain separate decisions.

## Tasks

- T1 [S4] Record the binding and conflict decision in D7 with its date and scope.
  Route: inline. Status: complete on 2026-11-13 in
  `docs/decisions/0001-project-baseline.md`. Risk: none.
- T2 [S5] Make incorporation idempotent for an addition already present in full and pin
  the conflict matrix in pgTAP, including ownership transfer and an obligation that
  survives a draft save. Route: inline. Status: complete: new migration
  `20261113190000_vote_incorporation_satisfied.sql`, 24 new pgTAP assertions,
  `bun run db:test` PASS with six files and 217 tests. RED shown by mutation: forcing
  the containment branch to false failed the satisfied-incorporation assertion, and
  `bun run db:reset` restored the schema. Risk: items 1, 2, 3 and 6.
- T3 [S5] Extend the HTTP suite for the new success shape, the conflict mapping and the
  previous-owner refusal. Route: inline. Status: complete: 19 tests and 257 assertions.
  RED shown by mutation: remapping one refusal message failed the new case. Risk:
  items 3 and 6.
- T4 [S6] Extend the signed-token PostgREST suite with the vote lifecycle, the obligation
  read, both conflict outcomes and the departed-member refusal. Route: inline.
  Status: complete: 97 of 97 checks. Risk: items 1, 2 and 6.
- T5 [S6] Extend the real multi-session race suite with concurrent independent
  incorporations, a duplicate pending addition and one vote incorporated twice.
  Route: inline. Status: complete: 14 of 14 checks, including one draft write per race
  and one discharge per approved vote. Risk: items 1 and 4.
- T6 [S6] Add `scripts/test-vote-session.ts` for the hosted live check with real Clerk
  sessions, plus its provider-free refusal test. Route: inline. Status: complete. The
  refusal guards pass in `scripts/tests/vote-session.test.ts`; the hosted run on
  2026-11-13 passed 41 checks against the development Clerk instance and the selected
  test project, and the fixture rows it created were removed. Risk: items 2 and 5.
- T7 [S1-S7] Record doc13, the delivery index, the guide and reference wording, the
  completion plan, the roadmap row and the handoff checkpoint. Route: inline.
  Status: complete. Risk: none.
- T8 [S1-S7] Independent read-only verification of the named high-risk items after the
  slice's own checks, then native assessment and review under its own consent.
  Route: delegated verification. Status: pending. Risk: item 3.

## Log

- L1: 2026-11-13: The task is backend completion M7, voting obligations and lifecycle.
  `origin/main` at `ddd1b8f` already carries M1-M6, so M7 is the next milestone and the
  vote feature itself shipped in roadmap milestone 6. The slice therefore starts as
  decision plus evidence work over existing interfaces.
- L2: Baseline inspected at `ddd1b8f`: the vote migration, `apps/api/src/votes.ts`, the
  two HTTP suites, the pgTAP vote suite, the signed-token PostgREST suite, the
  concurrency suite and the voting guide. The standalone worktree was created under
  `modpack-creator-version-final-worktrees/`; the unmerged `feat/frontend-tooling`
  checkout is untouched.
- L3: The evidence gap that mattered was not missing arithmetic but missing answers: the
  plan asks what "binding" enforces and what happens when two approved additions
  conflict. The code had no resolution path for an already-satisfied addition, so an
  approved vote could stay permanently unincorporable once the same version landed
  through another vote or a manual draft save.
- L4: D7 records the answer: binding is an obligation, not a gate; obligations are read
  from the existing vote list; nothing is blocked; ordering is the owner's; a fully
  present addition is discharged idempotently; a partially present one is a conflict that
  writes nothing; the current owner is the incorporator.
- L5: T2 changed one branch of `incorporate_group_vote` in a new migration instead of
  editing the applied one. Containment is checked after the settings check and before the
  append, so a satisfied addition records `incorporated_at` and leaves the draft revision
  untouched. `bun run db:reset` applied all ten migrations locally; the same migration was
  then applied to the selected hosted project as the only pending one.
- L6: T3 left production bytes untouched. The HTTP suite pins the obligation read from the
  vote list, the satisfied success shape with an unchanged draft, and the whole
  incorporation refusal map including the previous owner's 403.
- L7: T4 grew the signed-token suite from 73 to 97 checks over the real PostgREST surface.
  The sequence is open, ballot replacement, early approval, obligation read, a draft save
  that does not discharge it, stale revision, incorporation, a second incorporation
  refusal, two approved votes for one addition with the satisfied discharge, cancellation,
  a transfer in both directions, and the departed member's refusal on both vote reads.
- L8: T5 added three races: two independent approved votes incorporated at once (one
  write, one conflict, then a successful retry), two approved votes for the same addition,
  and one vote incorporated twice. The observation asserts every addition is stored once
  and every approved vote is discharged once.
- L9: T6 added the hosted live script and its refusal test. The first hosted attempt
  aborted on a wrong catalog query parameter and left a group and three profiles; those
  rows were removed before the passing run. The passing run on 2026-11-13 recorded 41
  checks, and readback afterwards shows zero rows in every fixture table except the
  pre-existing `m4proof13` profile.
- L10: Recorded limits: the live check depends on the public catalog for its candidates,
  the satisfaction branch is not proven for every possible pin shape, and deadline expiry
  stays a read-time derivation proven in pgTAP only. No deployment, publication or merge is
  recorded by this document.
