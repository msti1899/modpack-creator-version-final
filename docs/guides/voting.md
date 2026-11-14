# Voting on a mod addition

Group members vote on one concrete mod addition at a time. Only the owner starts a
vote, every member of the frozen electorate may vote, and an approved result is an
obligation the owner carries out by incorporating it. Approval never edits, publishes
or activates a pack version by itself.

## Before you start

- A verified Clerk session. Send the token as `Authorization: Bearer <token>`.
- Membership in the group. One group per person applies to votes as well.
- An owner who wants to propose something must read the current draft first and know
  its `revision`.

## Rules that the API enforces

- The owner chooses the duration; it must be between 1 and 720 hours.
- The proposal is a concrete addition: exact Modrinth version IDs, including every
  required dependency the draft does not already contain. The API resolves nothing
  on its own, so resolve and confirm dependencies before opening the vote.
- The electorate is frozen when the vote is created and includes the owner. Later
  joiners read the vote but cannot vote in it.
- A member may change their own ballot while the vote stays open; only the latest
  ballot counts.
- Approval needs more than half of the frozen electorate and closes the vote
  immediately. Reaching the majority wins even before the deadline.
- A vote that reaches its deadline without the majority is reported as rejected.
- The owner may cancel an open vote. Cancellation is terminal and adds nothing.
- One group may hold several independent open votes at the same time.
- A departure does not change the electorate size or the threshold. Ballots already
  cast stay counted and a missing ballot stays an absence.

## Open a vote

1. Read the draft you are proposing against:

   ```http
   GET /groups/me/pack
   ```

   Keep `draft.revision` and, if a draft exists, `draft.gameVersion` and
   `draft.loader`.

2. Resolve the mod you want to add, keeping the current selection pinned:

   ```http
   POST /packs/resolve
   { "gameVersion": "1.21.1", "loader": "fabric",
     "versionIds": ["<current draft ids>"], "projectId": "<modrinth project>" }
   ```

   The response lists the exact versions and the added dependencies. Confirm them
   with the group before opening the vote.

3. Open the vote with only the new versions:

   ```http
   POST /groups/me/votes
   { "gameVersion": "1.21.1", "loader": "fabric",
     "addVersionIds": ["<mod version>", "<dependency versions>"],
     "durationHours": 24, "expectedDraftRevision": 3 }
   ```

   `addVersionIds` must not contain a version already in the draft. The API validates
   the union of the draft plus the addition, stores a display snapshot of the
   proposal, and returns the vote with `status: "open"`.

   `expectedDraftRevision` is the revision you just read. A concurrent draft save
   returns 409 `Draft revision conflict.`; re-read the draft and open a new vote
   instead of retrying blindly.

## Vote, read and cancel

```http
GET  /groups/me/votes?limit=20
GET  /groups/me/votes/<voteId>/ballots?limit=50
POST /groups/me/votes/<voteId>/ballots     { "value": "approve" }
POST /groups/me/votes/<voteId>/cancel
```

`myBallot` in the vote summary is your own latest ballot. The ballot page lists the
whole frozen electorate, with `ballot: null` for someone who has not voted, so the
group can see who is missing. A ballot after the majority, after cancellation or
after the deadline returns 409 `This vote is already closed.`

## Incorporate an approved addition

Approval does not touch the draft. When the vote reads `status: "approved"` and
`incorporatedAt: null`, the owner reads the current draft revision and calls:

```http
POST /groups/me/votes/<voteId>/incorporate
{ "expectedRevision": 4 }
```

The API merges the pinned addition into the current draft, bumps its revision and
returns `{ vote, draft }`. It never publishes or activates anything.

If the draft changed since the approval, or its Minecraft version or loader no longer
matches the vote, the call returns 409 and changes nothing; the vote stays approved
and unincorporated. Resolve the conflict deliberately, then incorporate against the
revision you just read.

## Pending obligations and conflicting additions

An `approved` vote with `incorporatedAt: null` is a pending obligation. The vote list
`GET /groups/me/votes` is the only place that reports it; there is no separate
obligation endpoint. A pending obligation blocks nothing: the owner may save drafts,
publish, activate and transfer ownership while it is open, and approving a second vote
is never blocked by the first.

Several approved votes may therefore ask for additions that overlap:

- **The addition is absent from the draft.** The call appends it and bumps the
  revision, as above.
- **The whole addition is already present** with the same Minecraft version and
  loader. The group's decision is already satisfied, so the call records
  `incorporatedAt` and leaves the draft and its revision untouched. This happens when
  another approved vote or a manual save put the same version in place first.
- **Only part of the addition is present.** The call returns 409 `A proposed version
  is already in the draft.` and writes nothing, because the API cannot tell which
  part of the proposal is already in effect.

The remedy stays in the owner's hands: incorporate in another order, or save a draft
that removes the overlapping version and then incorporate again. Ordering across
several approved votes is never automatic, and an approved vote is never merged into
another or deleted. The obligation belongs to the group, so the current owner is the
only one who can discharge it; a previous owner is refused after a transfer.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid body, identifier, duration, ballot value, page size or cursor. |
| 401 | Missing or invalid Clerk session, or a token without the signed database role. |
| 403 | Not the owner for start, cancel or incorporate, or not in the frozen electorate when voting. |
| 404 | No current group, or the vote is not visible to your group. |
| 409 | Stale draft revision, closed vote, incompatible settings, duplicate addition, unapproved or already incorporated vote. |
| 502 | Modrinth or the database returned an unusable response. |
| 503 | The API is missing its database configuration. |
| 504 | Modrinth or the database timed out. |

Rejected writes leave the stored vote, the draft and every ballot unchanged. Read
the current state before retrying.
