import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { hasClerkConfiguration } from "../lib/auth-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Modpack Creator",
  description: "An open-source Minecraft modpack creator.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {hasClerkConfiguration() ? (
          <ClerkProvider afterSignOutUrl="/" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">{children}</ClerkProvider>
        ) : children}
      </body>
    </html>
  );
}
