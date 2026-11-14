import { SsoCallback } from "../../components/sso-callback";
import { hasClerkConfiguration } from "../../lib/auth-config";

// The callback runs inside ClerkProvider only; prerendering it would need the provider at build time.
export const dynamic = "force-dynamic";

export default function SsoCallbackPage() {
  if (!hasClerkConfiguration()) {
    return (
      <main className="grid min-h-dvh place-items-center bg-sidebar px-6">
        <p className="text-sm text-muted-foreground">
          Accounts are unavailable until Clerk is configured for this deployment.
        </p>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-6">
      <p className="text-sm text-muted-foreground" role="status">
        Finishing sign-in…
      </p>
      <SsoCallback />
    </main>
  );
}
