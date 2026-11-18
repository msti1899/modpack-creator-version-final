"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "./account-menu";
import { BrandMark } from "./brand-mark";
import { useAccountCache } from "./query-provider";
import {
  IdentitySkeleton,
  NoGroupState,
  ShellError,
  SignedOutState,
  UnconfiguredState,
} from "./shell-states";
import { ThemeToggle } from "./theme-toggle";
import { groupQueryKey, identityQueryKey } from "@/lib/account-cache";
import {
  GROUP_ERROR_SENTENCES,
  parseGroupRead,
  safeRedirectPath,
  type GroupRead,
  type ShellGroup,
} from "@/lib/groups";
import { parseIdentityRead } from "@/lib/identity-read";
import { cn } from "@/lib/utils";

export type AppFrameProps = {
  children: ReactNode;
  /** Clerk owns sign-out and the sign-in route; absent configuration is a state. */
  clerkEnabled: boolean;
  /** Read from the theme cookie on the server, so the first paint is right (D4). */
  initialDark: boolean;
  /** The page's own context line, when it has one. */
  context?: ReactNode;
};

/** A failed read keeps its status, so the frame decides the state it means. */
class ReadError extends Error {
  constructor(readonly status: number) {
    super("read failed");
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new ReadError(response.status);
  return response.json();
}

async function fetchIdentity() {
  const parsed = parseIdentityRead(await fetchJson("/api/me"));
  if (!parsed) throw new ReadError(502);
  return parsed;
}

async function fetchGroup() {
  const parsed = parseGroupRead(await fetchJson("/api/groups/me"));
  if (!parsed) throw new ReadError(502);
  return parsed;
}

/**
 * The frame every signed-in surface lives inside.
 *
 * One command bar owns the brand, the group destination, the theme and the
 * account; the content belongs to the page. The signed-out, no-group,
 * unconfigured and failed states all keep the bar and the account in place,
 * because losing them is what makes an application feel broken.
 */
export function AppFrame({ children, clerkEnabled, initialDark, context }: AppFrameProps) {
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? "/";

  const identity = useQuery({
    queryKey: identityQueryKey(),
    queryFn: fetchIdentity,
    staleTime: 60_000,
  });

  const identityId: string | null = identity.data?.id ?? null;
  useAccountCache(queryClient, identityId);

  const group = useQuery({
    queryKey: groupQueryKey(identityId),
    queryFn: fetchGroup,
    enabled: identityId !== null,
  });

  const identityStatus = statusOf(identity.error);
  const groupStatus = statusOf(group.error);

  const signedOut = identityStatus === 401 || groupStatus === 401;
  const unconfigured = identityStatus === 503 || groupStatus === 503;
  const readFailed = identityStatus === 502 || identityStatus === 504 || groupStatus === 502 || groupStatus === 504;
  const groupValue: GroupRead | null = group.data ?? null;

  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(safeRedirectPath(pathname))}`;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground dark:[color-scheme:dark]">
      <a
        href="#content"
        className="fixed top-3 left-3 z-50 -translate-y-[160%] rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-card-foreground focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-[60px] flex-none items-center gap-3 border-b border-border bg-card px-4 sm:px-5 lg:px-7">
        <Link
          href="/"
          aria-label="Modpack Creator"
          className="inline-flex items-center gap-2.5 rounded-md text-card-foreground hover:[&_.wordmark]:underline hover:[&_.wordmark]:underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BrandMark className="size-[22px] shrink-0 text-primary" />
          <span className="wordmark text-[13px] font-semibold tracking-[-0.006em]">Modpack Creator</span>
        </Link>

        {groupValue?.group ? (
          <nav aria-label="Group" className="ml-2 hidden min-w-0 items-center gap-1 md:flex">
            <GroupEntry group={groupValue.group} />
          </nav>
        ) : null}

        <div className="ml-auto flex flex-none items-center gap-2">
          <ThemeToggle initialDark={initialDark} />
          {identity.data ? (
            <AccountMenu identity={identity.data} group={groupValue?.group ?? null} clerkEnabled={clerkEnabled} />
          ) : identity.isPending ? (
            <IdentitySkeleton />
          ) : null}
        </div>
      </header>

      <div id="content" className="flex min-h-0 flex-1 flex-col">
        {context ? (
          <div className="flex-none border-b border-border px-4 py-2 text-[11.5px] text-muted-foreground sm:px-5 lg:px-7">
            {context}
          </div>
        ) : null}

        {identity.isPending ? (
          <div aria-busy="true" aria-live="polite" className="flex flex-1 items-center justify-center px-4 py-10">
            <span className="text-[13px] text-muted-foreground">Loading your group…</span>
          </div>
        ) : unconfigured ? (
          <UnconfiguredState />
        ) : signedOut ? (
          <SignedOutState signInHref={signInHref} />
        ) : readFailed ? (
          <ShellError
            sentence={
              identityStatus === 504 || groupStatus === 504
                ? GROUP_ERROR_SENTENCES.timeout
                : GROUP_ERROR_SENTENCES.unavailable
            }
            onRetry={() => {
              void identity.refetch();
              void group.refetch();
            }}
          />
        ) : group.isPending ? (
          <div aria-busy="true" aria-live="polite" className="flex flex-1 items-center justify-center px-4 py-10">
            <span className="text-[13px] text-muted-foreground">Loading your group…</span>
          </div>
        ) : groupValue?.group ? (
          children
        ) : (
          <NoGroupState />
        )}
      </div>
    </div>
  );
}

function statusOf(error: unknown): number | null {
  return error instanceof ReadError ? error.status : null;
}

/**
 * The single destination: the group.
 *
 * Decision D2 keeps the `Pending proposals` entry out of this slice. Its page
 * and its read belong to F7, and a link to a missing route — or a count with no
 * data behind it — would be a promise the product cannot keep. The navigation is
 * a container so F7 adds that entry without restructuring the bar.
 */
function GroupEntry({ group }: { group: ShellGroup }) {
  return (
    <a
      href="#current-group"
      aria-current="page"
      className={cn(
        "inline-flex h-[30px] min-w-0 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[12.5px] font-semibold text-secondary-foreground",
        "hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_5%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <Users className="size-3.5 flex-none" aria-hidden="true" />
      <span className="truncate">{group.name}</span>
    </a>
  );
}
