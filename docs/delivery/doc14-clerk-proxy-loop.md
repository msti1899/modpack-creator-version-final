# doc14: Clerk middleware proxy loop

Date: 2026-11-14
Scope: the request loop that made every routed response answer `500` after 30
seconds while Clerk was configured. No route, contract or database behavior
changed; the fix only rewrites the proxy response.
Baseline: `fix/clerk-proxy-loop`, cut from `origin/main` at `0751622` (merge of
PR #69), with `apps/web/.env` carrying the configured Clerk development keys.

## Objective

Restore a runnable environment for authenticated web work. The defect is tracked
in [issue #70](https://github.com/msti1899/modpack-creator-version-final/issues/70):
with the publishable and secret keys set, every matched route answered `500`
after exactly 30 seconds, while the same build with the keys cleared served in
about 20 ms.

## Diagnosis

The 30-second boundary is Next.js's internal `proxyTimeout` default
(`server/lib/router-utils/proxy-request.js`), not the cause. The proxy function
ran repeatedly for one request: an instrumentation build logged 299 executions
of `clerkMiddleware` for a single `GET /sign-in` before the router closed the
socket with `ECONNRESET`.

`@clerk/nextjs` 7.9.24 converts a pass-through into an explicit rewrite of the
same URL. In `decorateRequest` (`dist/esm/server/utils.js`) it deletes
`x-middleware-next`, copies its `x-clerk-*` headers into
`x-middleware-override-headers`/`x-middleware-request-*`, and sets
`x-middleware-rewrite` to the current URL. That rewrite is harmless while the
router resolves it as the same origin, and the loop needs a second condition.

The trigger is a host mismatch. `resolve-routes` builds `initUrl` from the
server's bind hostname and port (`next start --hostname 127.0.0.1` gives
`http://127.0.0.1:3100/...`), while Clerk builds its rewrite from the request's
`Host` header (`http://localhost:3100/...` in a browser or curl). `getRelativeURL`
compares origins, so the rewrite stays absolute, the router treats it as a proxy
target and forwards the request to itself; the forwarded request runs the proxy
again and the pair repeats until the timeout. Two observations pin the split:

- Original middleware, server bound to `--hostname 127.0.0.1`, request to
  `localhost:3101`: `500` after `30.07 s`.
- Original middleware, server bound to `--hostname localhost`, request to
  `localhost:3100`: `200` in `0.12 s`. This second measurement ran on
  `feat/frontend-tooling` at `fdf807e`, where `apps/web/src/proxy.ts` is identical
  to `origin/main`.

The same Clerk source path exists in 7.10.0, so upgrading the SDK alone does not
remove the rewrite. The repository's run scripts bind `127.0.0.1` while the
documented browser origin is `localhost`, which is the mismatch that reproduced
the defect.

## Changes and rationale

`apps/web/src/lib/middleware-response.ts` adds `withoutSelfRewrite`. When the
rewrite target matches the request's host, path and search, it removes
`x-middleware-rewrite` and restores `x-middleware-next`, leaving every other
header intact. The protocol is ignored because a TLS-terminating proxy may
report a different scheme. A rewrite to another path or host is returned
unchanged. `apps/web/src/proxy.ts` applies it to every response from
`clerkMiddleware` before returning it.

The overridden request headers are what `auth()` reads at the origin, so they
must survive; converting the self-rewrite into a pass-through preserves them and
lets the request reach the route once. The alternative — binding the server to
the browser host — repairs only environments where the two can be aligned, and a
deployment behind a public hostname keeps the mismatch. This fix removes the
loop for both. It is a workaround for the interaction between the two packages,
not a change to application behavior.

## Verification

- Reproduced before the fix on `next start` (Next 16.4.5, port 3101):
  `GET /` answered `500` after `30.07 s`.
- With instrumentation, one request logged 299 `clerkMiddleware` executions and
  each response carried `x-middleware-rewrite` equal to the request URL.
- Original middleware, bound to `--hostname localhost`: `200` in `0.12 s` in one
  execution. The self-rewrite alone does not loop; the origin mismatch does.
- After the fix, on a server bound to `127.0.0.1` and requests to
  `localhost:3101`: `/` `200` in `0.10 s` and `/api/me` `401` in `0.02 s`, with no
  proxy error in the log. The signed-out `/api/me` answer shows `auth()` resolved
  rather than throwing the "can't detect clerkMiddleware" error, which is the
  evidence that the overridden headers reached the route.
- `bun run check` passes 170 Bun tests with no failure, up from 165 on the same
  baseline. The five new tests in `apps/web/tests/middleware-response.test.ts`
  cover the same-URL rewrite, the protocol difference, a different path, a
  different host and a response without a rewrite; the root `bun test` discovers
  the suite.
- Not run: a real sign-in with a session cookie against this build. The
  authenticated browser journeys remain unverified and need a provider-reachable
  environment.

## Delivery state

Implementation, tests and this record ship on `fix/clerk-proxy-loop` through the
pull request that closes #70. The merge commit is recorded in the following
checkpoint. No deployment is recorded.

## Remaining work

Run the authenticated journeys (`/sign-in`, `/sso-callback`, the account menu)
with a real session once a provider-reachable environment exists. Upstream, the
interaction remains a defect worth reporting to Clerk: `clerkMiddleware` issues a
same-URL rewrite that Next 16 resolves against a bind-derived origin. The
unpublished `feat/frontend-tooling` branch carries the same proxy change plus the
frontend tooling and sign-in slices; its publication needs a token with the
`workflow` scope because it edits the CI workflow file.

## References

- [Issue #70](https://github.com/msti1899/modpack-creator-version-final/issues/70)
- [Current handoff](../handoff.md)
- [doc08: account and session runtime proof](doc08-account-session-proof.md)
