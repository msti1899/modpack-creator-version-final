import type { Metadata } from "next";
import { SignInCard } from "../../components/sign-in-card";
import { BrandMark } from "../../components/brand-mark";
import { hasClerkConfiguration } from "../../lib/auth-config";
import { safeRedirectPath } from "../../lib/groups";

export const metadata: Metadata = {
  title: "Sign in · Modpack Creator",
  description: "Sign in to Modpack Creator with email and password, Google or Discord.",
};

// Auth state is per request, and the card must never prerender outside ClerkProvider.
export const dynamic = "force-dynamic";

const cardShell =
  "relative w-[420px] max-w-full overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(28,25,23,0.05),0_28px_56px_-28px_rgba(28,25,23,0.32)]";

const gridLine = "color-mix(in oklab, var(--foreground) 5%, transparent) 1px";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The destination is validated before it is used: only a same-origin path is
  // accepted, so a crafted `redirect_url` cannot send the person elsewhere.
  const { redirect_url } = await searchParams;
  const redirectTo = safeRedirectPath(Array.isArray(redirect_url) ? redirect_url[0] : redirect_url);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-sidebar px-4 py-6 sm:px-6 sm:py-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-10%]"
        style={{
          backgroundImage: "radial-gradient(58% 44% at 50% 34%, var(--card) 0%, transparent 68%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, ${gridLine}, transparent 1px), linear-gradient(to bottom, ${gridLine}, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(78% 62% at 50% 42%, transparent 42%, #000 100%)",
          WebkitMaskImage: "radial-gradient(78% 62% at 50% 42%, transparent 42%, #000 100%)",
        }}
      />

      {hasClerkConfiguration() ? (
        <SignInCard cardClassName={cardShell} redirectTo={redirectTo} />
      ) : (
        <section className={cardShell} aria-labelledby="sign-in-unavailable">
          <div className="flex items-center gap-[10px] px-[30px] pt-[26px]">
            <BrandMark className="size-[26px] shrink-0 text-primary" />
            <span className="text-[13.5px] font-semibold">Modpack Creator</span>
          </div>
          <div className="px-[30px] pt-6 pb-[30px]">
            <h1 id="sign-in-unavailable" className="text-[25px] leading-[1.2] font-semibold tracking-[-0.022em]">
              Sign in
            </h1>
            <p className="mt-3 text-[13.5px] text-muted-foreground">
              Accounts are unavailable until Clerk is configured for this deployment.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
