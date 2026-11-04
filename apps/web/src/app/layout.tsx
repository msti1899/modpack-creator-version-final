import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Modpack Creator",
  description: "An open-source Minecraft modpack creator.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-zinc-950 font-sans text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
