# Project continuity

Before starting or resuming work, read [the handoff](docs/handoff.md) and verify
its branch/commit snapshot against Git. Then read the relevant milestone in
[the backend roadmap](docs/plans/backend-roadmap.md), not every historical log.

For implementation details, follow the handoff's pointer to the relevant
`odd/tasks/` document and consult [accepted decisions](docs/decisions/0001-project-baseline.md)
when the task touches product rules or architecture.

When a plan is approved or changed, update its scope and affected milestones.
Before handing off work, update `docs/handoff.md` with verified outcomes, remaining
work, and the exact next action. Keep code, test, review, publication, and merge
states distinct; record missing evidence explicitly.

Keep new plans under `docs/plans/`, using [the plan template](docs/templates/plan.md).
Use the user's approved scope; proposals are not requirements. Keep credentials
and machine-specific review tokens out of documentation. Publication and external
service setup remain explicit user decisions. Use Gentle AI ODD roles for delegation.

Never quote the project owner's messages, questions, option labels or replies in
documentation. Record what was decided in neutral prose, with the date and the
affected scope, and distinguish an approved decision from a proposal. The same rule
applies to task logs, plans, decisions, delivery records, handoffs and agent notes.
Do not add "verbatim" quotations of the owner; describe the decision instead.

## Task queue

The [project board](https://github.com/users/msti1899/projects/1) is the index of open
work and is also reachable from the repository's Projects tab. Read it to choose the
next task instead of scanning plans for candidates. A board entry is a queue item only:
the plan or `odd/tasks/` document it links to owns the specification and the acceptance
criteria, so a task is never executed from its issue title alone.

### Shape of a task

- Every task is an issue on the board, added as a project item, in exactly one milestone.
- Its body opens with a `Source:` line naming the owning document and its section.
- An item in `Backlog` names its blockers under a `## Depends on` heading, so the reason it
  cannot start is written on the issue itself rather than remembered.
- It carries exactly one `area:*` label and exactly one `kind:*` label. `blocked` is added
  only while the item waits on something external, and removed when it stops waiting.
- Milestones: `Backend hardening` holds backend-completion M9-M12 and their recorded
  advisories; `Frontend journeys` holds frontend-roadmap F1-F8 and the decisions that
  block them; `Operations` holds deployment, provider endpoints, CI credentials and test
  accounts.
- Fields are `Status`, `Area`, `Priority` and `Size`. An item is queued only when its
  custom fields are filled, not merely when the issue exists.
- A task with no owning plan or `odd/tasks/` document gets the document first. The issue
  stays a queue entry; it never becomes the specification.

### Area

- `area:backend` Hono API, route contracts and Modrinth integration.
- `area:frontend` Next.js screens, components and the design gate.
- `area:database` Migrations, RLS, pgTAP and PostgREST suites.
- `area:integration` Clerk, Supabase, OAuth and provider webhooks.
- `area:infra` CI, containers, Vercel operations and credentials.
- `area:docs` Plans, delivery records and the handoff.

### Kind

`kind:feature` new behavior; `kind:bug` something behaves incorrectly; `kind:decision` a
product choice blocking dependent work; `kind:proof` missing evidence, verification or
check; `kind:chore` maintenance with no behavior change.

### Priority

- `P0` blocks other work or delivery.
- `P1` sits on the critical path of an approved milestone; the normal working set.
- `P2` real but blocking nothing: hardening, recorded advisories, and decisions with no
  dependent slice waiting.

### Size

- `S` one decision, or one file or suite.
- `M` one surface with several parts and a single flow.
- `L` several flows, one flow with consistency rules (rejections, concurrency,
  migrations), or work crossing more than one area.

### Status

- `Backlog` the entry exists but a start is not possible yet: an open product decision
  blocks it, a screen has no approved design round, a provider account or an
  authorization is missing, or it carries `blocked`.
- `Ready` everything a start needs already exists: the owning document states the
  acceptance criteria, no open decision blocks the slice, no `blocked` label, and the
  custom fields are filled.
- `In Progress` work has started.
- `In Review` the change exists and its own checks have run, but the acceptance is not
  recorded yet, or the change is not yet merged.
- `Done` the acceptance was observed and the work is durable in the form its kind requires;
  the conditions are spelled out below.

### Done

An item moves to `Done` only when three conditions hold together:

1. The acceptance criteria in the owning document were observed, not assumed: the
   commands were run and their results are recorded in the delivery record or on the
   issue.
2. The work is durable in the form its kind requires. A code change is merged. A decision
   is recorded in a plan, an ADR or a delivery record, and the items that depended on it
   leave `Backlog`. A proof names the environment it ran against.
3. Nothing its `Risk:` line named is left unverified.

Granular commits and a conflict-free merge are delivery hygiene. They are necessary for a
code slice and never sufficient: a merged slice whose acceptance is unproven stays in
`In Review`. The reverse holds too, so an observed acceptance whose change is still
unmerged also stays in `In Review`, because publication is the owner's decision.

`In Review` is the state that holds either half of that gap. It is not a waiting room.

### Before starting

Before an item moves to `In Progress`, brief the owner in the language of the conversation
and in plain language:

1. What the task is, in one or two sentences, without internal names.
2. Why it must be done: what it unblocks, or what stays broken without it.
3. How it will be done: the approach in a handful of steps, and what will prove it worked.
4. What it deliberately will not do, whenever that boundary is not obvious.

Assume no specialist background in the topic. Define a technical term in one short line the
first time it appears, and lead with what the outcome means for the owner instead of the
mechanism. The briefing is not a permission request: work continues after it unless the
briefing surfaces a decision that changes scope, which is asked once and waited on.

### Working the board

1. Pick the highest `Priority` item in `Ready`, breaking ties by milestone. `Backlog` is
   never a candidate, however high its priority.
2. Move it to `In Progress` only when work actually starts, not when it is chosen, and only
   after the briefing under Before starting.
3. Move it to `In Review` when the change and its own checks exist but the evidence is not
   yet recorded.
4. Move it to `Done` only when the three conditions under Done hold. A partial, blocked or
   unavailable check leaves the item in `In Review`, with the gap written in the issue.
5. Send an item back to `Backlog` when a new decision or a missing dependency appears
   mid-slice; do not leave it in `Ready` pretending it can continue.
6. Record the closing commit or pull request on the issue and update the owning document
   in the same change.
7. Open a new issue with all fields instead of widening an existing one past its `Size`.

### Tooling notes

- Creating or reading a project needs the `project` and `read:org` scopes, and the device
  flow needs a real terminal; a piped or backgrounded shell cannot complete it.
- `gh issue create` rejects `--milestone` by number and accepts the milestone title.
- A view's filter and group-by are not exposed by the API; set them in the web UI.
