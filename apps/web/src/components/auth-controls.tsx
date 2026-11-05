import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function AuthControls({ enabled }: { enabled: boolean }) {
  if (!enabled) return <p className="mt-6 text-zinc-400">Configure Clerk to enable sign-in.</p>;
  return (
    <nav aria-label="Account" className="mt-6 flex items-center gap-4">
      <Show when="signed-out">
        <SignInButton mode="modal"><button className="rounded border border-zinc-600 px-4 py-2">Sign in</button></SignInButton>
        <SignUpButton mode="modal"><button className="rounded bg-emerald-400 px-4 py-2 text-zinc-950">Create account</button></SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </nav>
  );
}
