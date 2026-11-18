"use client";

import { useClerk } from "@clerk/nextjs";
import { Check, ChevronDown, LogOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { initialsFromEmail, roleLabel, type ShellGroup } from "@/lib/groups";
import type { ShellIdentity } from "@/lib/identity-read";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const menuItemClass = cn(
  "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] font-medium hover:bg-muted",
  focusRing,
);

export type AccountMenuProps = {
  identity: ShellIdentity;
  group: ShellGroup | null;
  /** Clerk owns sign-out; the menu renders it only when the provider is mounted. */
  clerkEnabled: boolean;
};

/**
 * The identity chip and its menu.
 *
 * The account lives here, never beside the group navigation: one destination,
 * one place for the person. Escape closes the menu and returns focus to the
 * chip; selecting an item closes it too.
 */
export function AccountMenu({ identity, group, clerkEnabled }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const initials = initialsFromEmail(identity.email);
  const label = roleLabel(group);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      chipRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={chipRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-[38px] items-center gap-2 rounded-full border border-border bg-card py-1 pr-2 pl-1 text-left hover:bg-muted",
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-[30px] flex-none place-items-center rounded-full bg-secondary text-[11.5px] font-semibold text-secondary-foreground"
        >
          {initials}
        </span>
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="max-w-[168px] truncate text-[12.5px] font-medium text-foreground">
            {identity.email ?? "Signed in"}
          </span>
          <span className="text-[10.5px] text-muted-foreground">{label}</span>
        </span>
        <ChevronDown className="size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{`Account menu — ${identity.email ?? "signed in"}`}</span>
      </button>

      {/* biome-ignore lint/a11y/useSemanticElements: the approved artboard draws this as a container of one identity row, one destination and sign-out; a fieldset would add its own border and legend to that card. */}
      <div
        id={menuId}
        role="group"
        aria-label="Account"
        hidden={!open}
        className="absolute right-0 z-40 mt-2 w-[264px] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-[0_1px_2px_rgba(28,25,23,0.05),0_18px_36px_-18px_rgba(28,25,23,0.28)]"
      >
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <span
            aria-hidden="true"
            className="grid size-[30px] flex-none place-items-center rounded-full bg-secondary text-[11.5px] font-semibold text-secondary-foreground"
          >
            {initials}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[12.5px] font-medium">{identity.email ?? "Signed in"}</span>
            <span className="text-[10.5px] text-muted-foreground">{label}</span>
          </span>
        </div>

        <hr className="my-1 border-border" />

        {group ? (
          <div aria-current="page" className={menuItemClass}>
            <span className="truncate">{group.name}</span>
            <Check className="size-3.5 flex-none text-primary" aria-hidden="true" />
          </div>
        ) : null}

        {clerkEnabled ? <SignOutItem onSelected={() => setOpen(false)} /> : null}
      </div>
    </div>
  );
}

function SignOutItem({ onSelected }: { onSelected: () => void }) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => {
        onSelected();
        // Sign-out clears the cached reads through `useAccountCache`, so the
        // next person never sees the previous one's group, role or email.
        void signOut({ redirectUrl: "/" });
      }}
      className={menuItemClass}
    >
      <span>Sign out</span>
      <LogOut className="size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
