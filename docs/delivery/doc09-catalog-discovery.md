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
- Review: native candidate review completed and approved on 2026-11-13 over three
  lenses (risk, resilience, reliability) for the committed range `6a552bf..fd5b7c9`, and
  its acknowledgement burned the authority. This record was written after that
  acknowledgement, so it is not part of the reviewed candidate.
- Deployment: none. No database, migration, hosted setting or provider was touched,
  so no pgTAP, upgrade or concurrency runner applies to this slice.
- Correction, 2026-11-13: merged to `main` through
  [PR #58](https://github.com/msti1899/modpack-creator-version-final/pull/58) as
  `b9167c0`, with the Backend checks passing on the merge commit in 45 seconds. The
  entries above record the pre-merge state.

## Review advisories

None of these opened a correction; they are separate later work and not a reason to
re-run review on this candidate.

- `category` has no cap on the number of distinct values, so a long list grows the
  outbound search URL and an oversized upstream URI surfaces as 502 instead of a
  fast 400. (WARNING, introduced)
- The shared projection is fail-closed per page: one present-but-malformed enriched
  field fails all 20 hits with a generic 502, and future upstream schema drift would
  take the whole discovery surface down at once, with no field or hit identified in
  the error. (WARNING, worsened)
- Unknown-parameter rejection breaks requests the baseline accepted and ignored
  (`limit`, `page`, `type`, `version`), and no caller audit accompanies that change.
  (WARNING, introduced, accepted as S2 scope)
- The new lookup route is an unauthenticated 1:1 proxy with no cache, rate limit or
  circuit breaker, and maps upstream 429 to 502 for every caller. (WARNING, introduced)
- The 14473-byte measurement and the 32 KiB assertions rest on fixture lengths for
  fields the projection does not bound (`slug`, `title`, `description`), so the bound
  is measured rather than enforced. (SUGGESTION)
- The lookup path validates `project_type` itself but leaves the required `id` to the
  shared projection; a mod body with a missing or non-string id becomes a 502 and that
  branch is untested. (SUGGESTION)

## Remaining work

- Minecraft and loader selector data, and an exact-version picker, remain undecided
  and unimplemented; both need their own product decision.
- Web integration is not part of this slice. Until a client consumes the new fields
  and filters, they are contract additions with no observed user effect.
- Hosted behavior is unproven: every check above ran against fixtures or a local
  upstream stub, not against the real Modrinth API or a deployed application.
- The branch needs independent verification and a candidate review decision before it
  can be considered for merge. See [the current handoff](../handoff.md).

## Hardening correction, 2026-11-26

The first two review advisories above are addressed for `GET /mods`. Search accepts
at most 20 distinct category values after duplicates are removed and rejects a
larger request with 400 before any upstream call. A malformed upstream hit is
omitted without discarding the other valid hits or changing the upstream `total`.
The exact lookup route remains fail-closed for its single malformed project.

Verification: RED was observed for the category cap and per-hit degradation before
implementation. The focused catalog suites then passed 23 tests and 295 assertions.
`bun run check` passes both application typechecks, lint, 229 API tests with 3403
assertions, and 81 web tests. No hosted or real-upstream check ran. This correction
is local and uncommitted; it is not published or merged.

## References

- [Completion plan, M3](../plans/backend-completion.md)
- [Backend API reference](../reference/backend-api.md)
- [Catalog architecture](../architecture/modrinth-backend.md)
- [Feature log](../../odd/tasks/catalog-discovery.md)
