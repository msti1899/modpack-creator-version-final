"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

/**
 * Clerk finishes the OAuth handshake and needs to know where to land. The
 * destination is the validated `redirect_url` the sign-in screen carried, so a
 * provider sign-in returns to the route the person attempted.
 */
export function SsoCallback({ redirectTo = "/" }: { redirectTo?: string }) {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl={redirectTo}
      signUpFallbackRedirectUrl={redirectTo}
    />
  );
}
