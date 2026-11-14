/**
 * Clerk's middleware converts a pass-through into an explicit rewrite of the
 * same URL (`x-middleware-rewrite`) so its `x-clerk-*` request headers reach
 * the origin. Next 16 builds `initUrl` from the server bind hostname while
 * Clerk builds the rewrite from the request `Host` header; when they differ,
 * the router treats the rewrite as a proxy target and forwards the request to
 * itself until the 30 s proxy timeout answers 500.
 *
 * Turning the self-rewrite back into a pass-through (`x-middleware-next`) keeps
 * the overridden request headers intact and lets the request reach the route
 * once. A rewrite to a different URL is left untouched. The protocol is ignored
 * because a TLS-terminating proxy may report a different scheme than the one
 * the request carries.
 */
export function withoutSelfRewrite(requestUrl: string, response: Response): Response {
  const rewrite = response.headers.get("x-middleware-rewrite");
  if (!rewrite) return response;
  let target: URL;
  let current: URL;
  try {
    target = new URL(rewrite, requestUrl);
    current = new URL(requestUrl);
  } catch {
    return response;
  }
  const sameTarget =
    target.host === current.host && target.pathname === current.pathname && target.search === current.search;
  if (!sameTarget) return response;
  response.headers.delete("x-middleware-rewrite");
  response.headers.set("x-middleware-next", "1");
  return response;
}
