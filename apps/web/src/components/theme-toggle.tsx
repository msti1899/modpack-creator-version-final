"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The same theme control in every state.
 *
 * Light is the working default and dark is a first-class equal. The control
 * toggles `.dark` on the document root, carries `aria-pressed`, and writes the
 * cookie the server reads on the next visit, so the first paint already has the
 * chosen theme (decision D4).
 */
export function ThemeToggle({ initialDark }: { initialDark: boolean }) {
  const [dark, setDark] = useState(initialDark);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    // biome-ignore lint/suspicious/noDocumentCookie: the chosen theme is a first-paint preference, and the server reads this cookie so the shell never renders the wrong theme before hydrating (decision D4).
    document.cookie = `${THEME_COOKIE}=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <button
      type="button"
      aria-pressed={dark}
      aria-label="Dark theme"
      onClick={toggle}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-secondary px-0 text-[12px] font-semibold text-secondary-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_5%)] motion-reduce:transition-none sm:w-auto sm:px-2.5",
        focusRing,
      )}
    >
      {dark ? <Moon className="size-3.5" aria-hidden="true" /> : <Sun className="size-3.5" aria-hidden="true" />}
      <span className="hidden sm:inline">Theme</span>
    </button>
  );
}
