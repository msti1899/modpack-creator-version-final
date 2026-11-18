"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { syncAccountCache } from "@/lib/account-cache";

/**
 * One query client for the signed-in surfaces.
 *
 * Nothing was cached before this slice, so the account boundary is made explicit
 * here rather than left implicit: the client outlives the frame, and it is the
 * thing that would carry one person's read into the next session.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            // Server state for a group is small and changes on the owner's
            // action; a short window avoids a duplicate read per render.
            staleTime: 15_000,
            gcTime: 5 * 60_000,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Clear the cache whenever the caller changes, including on sign-out.
 *
 * `previous` starts as the first identity, so mounting never clears anything the
 * current render is about to read.
 */
export function useAccountCache(client: QueryClient, identityId: string | null) {
  const previous = useRef(identityId);
  useEffect(() => {
    syncAccountCache(client, identityId, previous.current);
    previous.current = identityId;
  }, [client, identityId]);
}
