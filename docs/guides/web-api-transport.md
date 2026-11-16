# How the web app reaches the API

The browser never calls the Hono API directly and never holds an API token.
Every request goes to a route handler on the Next.js server, which reads the
session, attaches the credential and calls the API at `API_URL`. The API sends no
CORS headers, so a direct browser call would fail; the server hop is structural,
not a convenience wrapper.

## The path

```text
Browser ──GET /api/me────────▶ Next route handler ──GET /me────▶ Hono API
        ──GET /api/mods?…───▶ (server only)       ──GET /mods──▶ (API_URL)
```

Two handlers exist today, and there is no catch-all proxy: a new surface adds its
own handler.

| Web route | Handler | Calls | Purpose |
| --- | --- | --- | --- |
| `/api/me` | `apps/web/src/app/api/me/route.ts` | `GET /me` | the caller's minimal identity |
| `/api/mods` | `apps/web/src/app/api/mods/route.ts` | `GET /mods` | catalog search |

Both are `GET` only. No handler on the web forwards a request body, so no browser
mutation exists yet; see [adding a new API surface](#adding-a-new-api-surface).

## The identity handler

`createIdentityProxy` in `apps/web/src/lib/identity.ts` builds the handler from
four inputs: whether Clerk is configured, the API origin, a token getter and an
optional fetcher for tests.

1. Without Clerk configuration it answers `503` and never calls Clerk.
2. It validates `API_URL`, then asks Clerk for the session token.
3. A missing token answers `401`; the API is not contacted.
4. The token travels as `Authorization: Bearer <token>` to `GET /me`.
5. The payload is re-validated field by field (`user.id` must match
   `^user_[A-Za-z0-9]+$`, `user.email` is a string or `null`) and only
   `{ user: { id, email } }` is returned. Anything else becomes `502`.

The session cookie is never forwarded. The response carries
`Cache-Control: no-store` and `Vary: Cookie`, because the body depends on the
session. A session lookup that throws is `502`, never a silent sign-out.

## The catalog handler

`apps/web/src/app/api/mods/route.ts` validates the search before forwarding it.
`buildModSearch` in `apps/web/src/lib/mods.ts` accepts exactly eight parameters —
`query`, `gameVersion`, `loader`, `offset`, `sort`, `category`, `environment`,
`author` — and fills the pack defaults `1.21.1` and `fabric`. An unknown
parameter, a repeated single-value parameter, a sort or loader outside its set, an
offset above 10 000, or a category that does not match `^[a-z0-9-]{1,64}$` is
rejected with `400` before any request leaves the server.

A `400` from the API is passed through with its own message, bounded to 300
characters, because a rejected search is the caller's problem. Every other
non-200 answers `502`, and a timeout answers `504`.

## Rules both handlers share

| Rule | Behaviour |
| --- | --- |
| API origin | `API_URL` must be an absolute URL; `https:` is required except on `localhost`, `127.0.0.1` and `[::1]`; a username, password, path, query or fragment is refused |
| Request headers | only `Accept`, plus `Authorization` for the identity call; no cookie, no other client header |
| Deadlines | one 5-second `AbortSignal.timeout` per call |
| Redirects | `redirect: "error"`; a redirect is a failure, never followed |
| Response cache | `Cache-Control: no-store` on every response |
| Body caps | read while streaming and cancelled on overflow: 16 KiB for identity, 512 KiB for a catalog page and 4 KiB for a catalog error |
| Failure text | fixed messages only; upstream text is never exposed |
| Status mapping | unconfigured `503`; missing token `401` for identity; upstream failure `502`; timeout `504` |

`API_URL` defaults to `http://127.0.0.1:3001` in both handlers, which is the local
API port.

## Configuration

`apps/web/.env` needs three values, listed in `apps/web/.env.example`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | browser-side Clerk key |
| `CLERK_SECRET_KEY` | server-only Clerk key; both keys must belong to the same Clerk instance the API trusts |
| `API_URL` | the Hono origin the server calls |

Without both Clerk keys the middleware is skipped and `/api/me` answers `503`.
For the matching API-side variables, see
[local identity](local-identity.md) and [local account access](local-account-access.md).

## The Next 16 middleware trap

`apps/web/src/proxy.ts` wraps `clerkMiddleware` and converts a same-URL rewrite
back into a pass-through when a request matches. Without that conversion Next 16
forwards the request to itself until the 30-second proxy timeout answers `500`.
The diagnosis and the pinned behaviour are in
[doc14](../delivery/doc14-clerk-proxy-loop.md); the fix is
`withoutSelfRewrite` in `apps/web/src/lib/middleware-response.ts`.

## What pins this behaviour

| Check | File | Covers |
| --- | --- | --- |
| 6 unit tests | `apps/web/tests/identity.test.ts` | origin validation, minimal identity, closed failure paths, oversized payloads, a session lookup failure that is not a logout |
| 5 unit tests | `apps/web/tests/middleware-response.test.ts` | the self-rewrite conversion and the rewrites it must leave alone |
| 15 unit tests | `apps/web/tests/lib/mods.test.ts` | the accepted parameter set, the defaults and the rejections |
| 6 browser cases | `apps/web/e2e/mods-contract.spec.ts` | invalid queries rejected by the real route without reaching the API |
| 13 browser cases | `apps/web/e2e/mods.spec.ts` | the rendered screen, its four states and three axe runs |

## Adding a new API surface

1. Add a handler under `apps/web/src/app/api/<name>/route.ts`.
2. Validate `API_URL` the way `endpoint` or `catalogUrl` does, and reuse the same
   five-second deadline, `redirect: "error"` and `no-store` headers.
3. Validate the input before forwarding it, so an invalid request never reaches
   the API.
4. Read the response with a byte cap, re-validate the payload and return a fixed
   message on failure.
5. Fetch the route from the client with a relative `/api/<name>` path and
   `cache: "no-store"`. Never import `API_URL` or a Clerk secret into a client
   component.
6. Add the unit tests for the handler and one browser case that proves the route
   reject or accept path through the real server.

## Deliberate limits

- No generic proxy: the same six rules are restated per handler instead of shared.
- No shared typed client or automatic retry on the web side; each screen handles
  its own error state.
- Only reads are proxied today. A mutation needs a new handler with a request body
  cap, which does not exist yet.
