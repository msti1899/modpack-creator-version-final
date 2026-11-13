# doc09: Catalog discovery contract

Date: 2026-11-13
Scope: `GET /mods` validation and filters, an exact project lookup route, and an
enriched result payload. No UI, no caller-selected page size, no Minecraft/loader
selector data, no exact-version picker.
Baseline: `main` at `6a552bf`, checked before the work.

## Objective

Complete the catalog discovery contract for the completion plan's M3 without adding
a client. The approved outcome was recorded in
[the completion plan](../plans/backend-completion.md): pin the behavior that already
exists before adding any, then add the decided filters, then an exact lookup route,
then the enriched payload with a response-size measurement. Filters and payload
fields are contract work at this stage; no user-visible improvement is claimed
because nothing consumes them yet.

## Changes and rationale

- Unknown query parameters now return 400 `Invalid query parameter.` instead of being
  ignored. A misspelled filter previously returned unfiltered results that looked
  filtered, which is the failure mode this contract exists to remove.
- `sort`, `category`, `environment` and `author` were added to `GET /mods`. Category
  values union within their own facet group and are ANDed with loader and Minecraft
  version. `environment` means the mod runs on that side, matching `required` or
  `optional` support, because a filter that hid `optional` mods would make valid
  results look missing; precise support per side travels in the payload instead.
- `GET /mods/:idOrSlug` returns one summary. A missing or non-mod project is a 404,
  while upstream failure keeps 502 and timeout 504, so a failed lookup cannot be
  mistaken for a missing mod. The route accepts no query parameters; any parameter
  returns 400 instead of being ignored.
- Each hit now carries `iconUrl`, `downloads`, `follows`, `author`, `categories`,
  `clientSide`, `serverSide` and `latestVersion` through one projection shared with
  the lookup route. Absent upstream fields normalize to `null`/`[]`; present but
  malformed fields fail the request rather than leaking unvalidated values.

Contract and behavior are documented in
[the backend API reference](../reference/backend-api.md).

## Verification

Environment: local Bun 1.4.4, no Docker, no hosted service or provider access.

- `bun run check` passes 147 tests and 2625 assertions with both application
  typechecks, up from the 131-test baseline.
- The pinned pre-existing behavior was shown to be guarded: mutating the page size to
  21 and removing the `offset` upper bound each made the corresponding pinning test
  fail, and both mutations were reverted.
- RED was observed for every behavior change before its implementation: unknown
  parameter, each of the four filters, the lookup route, and the enriched and
  malformed-field assertions.
- A page of 20 enriched hits with realistic maximum-length values measured 14473
  bytes, under the 32 KiB guard adopted with the payload change.
- The public regression test recomputed every golden hash. Only the `GET /mods`
  response hash changed, as the approved additive payload requires; the remaining
  nine request hashes are unchanged.
- Independent verification met S1–S8 with no blocker. It reproduced the suite, showed
  the branch's catalog tests fail 9 of 16 against the baseline source, and confirmed
  that for baseline-valid requests only the enriched payload keys and an upstream
  `index=relevance` parameter differ, with `/packs/*` responses byte-identical. Its
  probes are committed as `catalog-discovery-verification.test.ts`.
- Advisories taken: the lookup route now rejects query parameters, and the reference and
  feature documentation name the repeated-parameter rule and the `author` character set.
- Advisories kept as documented limits: query validation still accepts C1 controls and
  line separators, which the baseline already did; the 32 KiB page bound is measured,
  not enforced; and the lookup path is capped at 64 characters.

## Delivery state

- Implementation and documentation: complete on `feat/catalog-discovery`, in five
  commits: the plan record (`96a3bd1`), parameter validation and filters
  (`9e99e1e`), the exact lookup route (`ddc08f9`), the enriched payload with its
  documentation (`98d439b`), and the verification correction (`ced57f8`). Not
  published, not merged.
- Verification: independent verification passed S1–S8 with no blocker on 2026-11-13.
- Review: no native candidate review has run for this branch.
- Deployment: none. No database, migration, hosted setting or provider was touched,
  so no pgTAP, upgrade or concurrency runner applies to this slice.

## Remaining work

- Minecraft and loader selector data, and an exact-version picker, remain undecided
  and unimplemented; both need their own product decision.
- Web integration is not part of this slice. Until a client consumes the new fields
  and filters, they are contract additions with no observed user effect.
- Hosted behavior is unproven: every check above ran against fixtures or a local
  upstream stub, not against the real Modrinth API or a deployed application.
- The branch needs independent verification and a candidate review decision before it
  can be considered for merge. See [the current handoff](../handoff.md).

## References

- [Completion plan, M3](../plans/backend-completion.md)
- [Backend API reference](../reference/backend-api.md)
- [Catalog architecture](../architecture/modrinth-backend.md)
- [Feature log](../../odd/tasks/catalog-discovery.md)
