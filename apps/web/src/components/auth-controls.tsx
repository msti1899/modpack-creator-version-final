import Link from "next/link";
import { Show, SignUpButton, UserButton } from "@clerk/nextjs";

export function AuthControls({ enabled }: { enabled: boolean }) {
  if (!enabled) return <p className="mt-6 text-muted-foreground">Configure Clerk to enable sign-in.</p>;
  return (
    <nav aria-label="Account" className="mt-6 flex items-center gap-4">
      <Show when="signed-out">
        <Link
          href="/sign-in"
          className="rounded border border-border px-4 py-2 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Sign in
        </Link>
        <SignUpButton mode="modal"><button type="button" className="rounded bg-primary px-4 py-2 text-primary-foreground">Create account</button></SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
        <a href="/api/me" className="text-primary underline">Check API session</a>
      </Show>
    </nav>
  );
}
