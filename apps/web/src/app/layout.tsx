import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "../components/query-provider";
import { hasClerkConfiguration } from "../lib/auth-config";
import { THEME_COOKIE } from "../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Modpack Creator",
  description: "An open-source Minecraft modpack creator.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The theme is read on the server so the first paint is already in the chosen
  // theme, instead of rendering light and flashing to dark (decision D4).
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const shell = <QueryProvider>{children}</QueryProvider>;

  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {hasClerkConfiguration() ? (
          <ClerkProvider afterSignOutUrl="/" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">{shell}</ClerkProvider>
        ) : shell}
      </body>
    </html>
  );
}
