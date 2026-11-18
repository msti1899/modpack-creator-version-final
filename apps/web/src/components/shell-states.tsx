"use client";

import { AlertTriangle, Lock, RefreshCw, Users } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const primaryButton = cn(
  "inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary),var(--foreground)_8%)]",
  focusRing,
);

const outlineButton = cn(
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3.5 text-[13px] font-semibold text-card-foreground hover:bg-muted",
  focusRing,
);

/** The centre column every state card sits in. */
function Stage({ children }: { children: ReactNode }) {
  return <div className="grid flex-1 place-items-center px-4 py-10">{children}</div>;
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[420px] rounded-xl border border-border bg-card p-6 text-center text-card-foreground shadow-[0_1px_2px_rgba(28,25,23,0.05),0_18px_36px_-24px_rgba(28,25,23,0.24)]">
      {children}
    </div>
  );
}

/**
 * Signed out: the bar and the context stay, and one sentence plus one action
 * take the place of the content. The action opens `/sign-in` as its own page and
 * carries the route the person attempted so sign-in returns them there.
 */
export function SignedOutState({ signInHref }: { signInHref: string }) {
  return (
    <Stage>
      <Panel>
        <span
          aria-hidden="true"
          className="mx-auto grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground"
        >
          <Lock className="size-[18px]" />
        </span>
        <p className="mt-3 text-[15.5px] font-semibold tracking-[-0.01em]">Sign in to continue</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          This group and its mods stay private until you sign in.
        </p>
        <div className="mt-4">
          <a href={signInHref} className={primaryButton}>
            Sign in
          </a>
        </div>
      </Panel>
    </Stage>
  );
}

/**
 * Signed in without a group. The account stays visible with the `No group`
 * label, no group name is invented, and the artboard's card keeps both exits.
 *
 * Both destinations belong to F3, so this slice draws the actions and leaves
 * them inert (decision D3): they are announced as unavailable rather than
 * shipped as links to a route that does not exist yet. S7 and S14 require more
 * than `aria-disabled`: each control points at a description naming what is
 * missing, so the reason survives into assistive technology while the card
 * stays as the artboard draws it.
 */
export function NoGroupState() {
  const noteId = useId();
  return (
    <Stage>
      <Panel>
        <span
          aria-hidden="true"
          className="mx-auto grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground"
        >
          <Users className="size-[18px]" />
        </span>
        <p className="mt-3 text-[15.5px] font-semibold tracking-[-0.01em]">No group yet</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          A group owns the pack and its mods. Create one on its own page, or open a link you were given.
        </p>
        <p className="sr-only" id={noteId}>
          Creating a group and opening a link are not available yet because the group page is not built.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button type="button" aria-disabled="true" aria-describedby={noteId} className={primaryButton}>
            Create a group
          </button>
          <button type="button" aria-disabled="true" aria-describedby={noteId} className={outlineButton}>
            Open a link
          </button>
        </div>
      </Panel>
    </Stage>
  );
}

/**
 * Clerk is not configured for this deployment. A distinct state, not a
 * signed-out one: the sentence names the problem and no action is offered that
 * could not work.
 */
export function UnconfiguredState() {
  return (
    <Stage>
      <Panel>
        <p className="text-[15.5px] font-semibold tracking-[-0.01em]">Accounts are not available here</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          This deployment has no account provider configured yet.
        </p>
      </Panel>
    </Stage>
  );
}

/**
 * The one error surface for a failed authenticated read.
 *
 * A status code is never rendered and upstream text is never shown: the caller
 * passes the sentence its subject deserves, and `Retry` re-runs that read and
 * nothing else. Later surfaces reuse this component instead of growing their own.
 */
export function ShellError({
  sentence,
  subject = "this group",
  onRetry,
}: {
  sentence: string;
  subject?: string;
  onRetry: () => void;
}) {
  return (
    <div className="px-4 py-10 sm:px-6" role="alert">
      <div className="mx-auto flex max-w-[560px] flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground">
        <AlertTriangle className="size-4 flex-none text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[13px]">
          <span className="sr-only">{`Could not load ${subject}: `}</span>
          {sentence}
        </p>
        <button type="button" onClick={onRetry} className={outlineButton}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    </div>
  );
}

/** The bar's own skeleton while the identity read is in flight. */
export function IdentitySkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-2">
      <span className="block h-[30px] w-[30px] rounded-full bg-muted" />
      <span className="hidden h-[10px] w-[104px] rounded-full bg-muted sm:block" />
    </div>
  );
}
