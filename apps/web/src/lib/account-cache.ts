import type { QueryClient } from "@tanstack/react-query";

/**
 * The account boundary for cached server state.
 *
 * Every authenticated read is keyed by the caller's identity id, so one
 * account's entry can never be served to another under the same key. The cache
 * is also cleared when the identity changes or the session ends, because the
 * query client outlives every component that renders it.
 */

export const IDENTITY_QUERY_KEY = ["identity"] as const;
export const GROUP_QUERY_ROOT = "group";

export function identityQueryKey() {
  return IDENTITY_QUERY_KEY;
}

export function groupQueryKey(identityId: string | null) {
  return [GROUP_QUERY_ROOT, identityId] as const;
}

/**
 * Drop cached reads when the caller changes.
 *
 * Returns true when it cleared, so a caller can act on the transition (close a
 * menu, return focus) without reading the cache again.
 */
export function syncAccountCache(
  client: QueryClient,
  identityId: string | null,
  previousId: string | null,
): boolean {
  if (identityId === previousId) return false;
  client.clear();
  return true;
}
