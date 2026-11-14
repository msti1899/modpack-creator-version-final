"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignUpButton, useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { BrandMark } from "./brand-mark";
import { Button } from "./ui/button";

const FALLBACK_ERROR = "That request could not be completed. Try again.";
const UNKNOWN_ACCOUNT = "form_identifier_not_found";

function clerkMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors?.[0];
    return first?.longMessage ?? first?.message ?? FALLBACK_ERROR;
  }
  if (error && typeof error === "object") {
    const candidate = error as { longMessage?: string; message?: string };
    return candidate.longMessage ?? candidate.message ?? FALLBACK_ERROR;
  }
  return FALLBACK_ERROR;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" />
    </svg>
  );
}

function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function EyeMark({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[17px]"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M3 3l18 18" /> : null}
    </svg>
  );
}

type Pending = "password" | "oauth_google" | "oauth_discord" | "reset" | null;

const fieldLabel = "text-[12.5px] font-medium";
const quietLink =
  "rounded-xs border-b border-transparent text-xs text-muted-foreground outline-none hover:border-primary hover:text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const textField =
  "h-11 w-full rounded-md border border-border bg-card pr-10 pl-3 text-[14.5px] text-foreground outline-none placeholder:text-[#A79D92] hover:border-[#D3C7B8] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15";

export function SignInCard({ cardClassName }: { cardClassName: string }) {
  const { signIn } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const busy = pending !== null;
  const ready = Boolean(signIn);

  async function handlePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn) return;

    const identifier = email.trim();
    if (!identifier) {
      setError("Enter your email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setError(null);
    setPending("password");
    try {
      const { error: passwordError } = await signIn.password({ identifier, password });
      if (passwordError) {
        setError(clerkMessage(passwordError));
        return;
      }
      if (signIn.status === "complete") {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) {
          setError(clerkMessage(finalizeError));
          return;
        }
        router.push("/");
        return;
      }
      setError(
        signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust"
          ? "This account needs a second factor that this screen does not offer yet."
          : "This sign-in needs another step that this screen does not offer yet.",
      );
    } finally {
      setPending(null);
    }
  }

  async function handleProvider(strategy: "oauth_google" | "oauth_discord") {
    if (!signIn) return;
    setError(null);
    setPending(strategy);
    try {
      const { error: ssoError } = await signIn.sso({
        strategy,
        redirectUrl: "/",
        redirectCallbackUrl: "/sso-callback",
      });
      if (ssoError) {
        setError(clerkMessage(ssoError));
        setPending(null);
      }
    } catch (cause) {
      setError(clerkMessage(cause));
      setPending(null);
    }
  }

  async function handleReset() {
    if (!signIn) return;

    const identifier = email.trim();
    if (!identifier) {
      setError("Enter your email address, then choose “Forgot password?”.");
      return;
    }

    setError(null);
    setPending("reset");
    try {
      const { error: identifyError } = await signIn.create({ identifier });
      if (identifyError && identifyError.code !== UNKNOWN_ACCOUNT) {
        setError(clerkMessage(identifyError));
        return;
      }
      if (!identifyError) {
        const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
        if (sendError && sendError.code !== UNKNOWN_ACCOUNT) {
          setError(clerkMessage(sendError));
          return;
        }
      }
      // The confirmation never reveals whether the account exists.
      setSentTo(identifier);
    } finally {
      setPending(null);
    }
  }

  async function handleBack() {
    setSentTo(null);
    setError(null);
    await signIn?.reset();
  }

  return (
    <section className={cardClassName} aria-labelledby="sign-in-title">
      <div className="flex items-center gap-[10px] px-[30px] pt-[26px]">
        <BrandMark className="size-[26px] shrink-0 text-primary" />
        <span className="text-[13.5px] font-semibold">Modpack Creator</span>
      </div>

      <div className="px-[30px] pt-6 pb-[30px]">
        {sentTo ? (
          <>
            <h1
              id="sign-in-title"
              className="text-[25px] leading-[1.2] font-semibold tracking-[-0.022em]"
            >
              Check your email
            </h1>
            <p className="mt-[9px] mb-[26px] text-[13.5px] text-muted-foreground">
              If an account exists for <span className="text-foreground">{sentTo}</span>, Clerk sent a
              password reset code to it.
            </p>
            <Button
              type="button"
              className="h-11 w-full rounded-md text-[14.5px] font-semibold"
              onClick={handleBack}
            >
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <h1
              id="sign-in-title"
              className="text-[25px] leading-[1.2] font-semibold tracking-[-0.022em]"
            >
              Sign in
            </h1>
            <p className="mt-[9px] mb-[26px] text-[13.5px] text-muted-foreground">
              Use the email and password for your account.
            </p>

            <form onSubmit={handlePassword} noValidate aria-busy={busy}>
              <div className="mb-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="sign-in-email" className={fieldLabel}>
                    Email
                  </label>
                </div>
                <input
                  id="sign-in-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={textField}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="mb-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="sign-in-password" className={fieldLabel}>
                    Password
                  </label>
                  <button type="button" className={quietLink} onClick={handleReset} disabled={busy || !ready}>
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="sign-in-password"
                    name="password"
                    type={revealed ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    className={textField}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-[5px] grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label={revealed ? "Hide password" : "Show password"}
                    aria-pressed={revealed}
                    onClick={() => setRevealed((current) => !current)}
                  >
                    <EyeMark off={revealed} />
                  </button>
                </div>
              </div>

              {error ? (
                <p role="alert" className="mb-3 text-[13px] text-destructive">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={busy || !ready}
                className="mt-1.5 h-11 w-full rounded-md text-[14.5px] font-semibold hover:bg-primary/90"
              >
                {pending === "password" ? "Signing in…" : "Sign in"}
              </Button>

              <div className="my-[18px] flex items-center gap-3 text-xs text-muted-foreground">
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                <span>or</span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                disabled={busy || !ready}
                className="h-11 w-full gap-[9px] rounded-md border-border bg-card text-[14.5px] font-medium hover:bg-[#F8F4EE] dark:bg-card dark:hover:bg-input/40"
                onClick={() => handleProvider("oauth_google")}
              >
                <GoogleMark />
                {pending === "oauth_google" ? "Opening Google…" : "Continue with Google"}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={busy || !ready}
                className="mt-2 h-11 w-full gap-[9px] rounded-md border-border bg-card text-[14.5px] font-medium hover:bg-[#F8F4EE] dark:bg-card dark:hover:bg-input/40"
                onClick={() => handleProvider("oauth_discord")}
              >
                <DiscordMark />
                {pending === "oauth_discord" ? "Opening Discord…" : "Continue with Discord"}
              </Button>
            </form>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-border bg-sidebar px-[30px] py-[15px] text-[13px] text-muted-foreground">
        <span>No account yet?</span>
        <SignUpButton mode="modal">
          <button
            type="button"
            className="rounded-xs border-b border-transparent font-semibold text-primary outline-none hover:border-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Create one
          </button>
        </SignUpButton>
      </div>
    </section>
  );
}
