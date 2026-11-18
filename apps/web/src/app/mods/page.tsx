import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppFrame } from "../../components/app-frame";
import { ModBrowser } from "../../components/mod-browser";
import { hasClerkConfiguration } from "../../lib/auth-config";
import { parseModContext } from "../../lib/mods";
import { THEME_COOKIE } from "../../lib/theme";

export const metadata: Metadata = {
  title: "Add mods · Modpack Creator",
  description: "Browse the Modrinth catalog for mods that fit the pack's Minecraft version and loader.",
};

// The browse context comes from the request's own search parameters.
export const dynamic = "force-dynamic";

export default async function ModsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { gameVersion, loader } = parseModContext(await searchParams);

  // The catalog lives inside the one global frame (approval A2, spec D1). The
  // theme is read here as well as in the root layout so the frame's control
  // starts in the theme the server already painted (decision D4).
  const theme = (await cookies()).get(THEME_COOKIE)?.value;

  return (
    <AppFrame
      clerkEnabled={hasClerkConfiguration()}
      initialDark={theme === "dark"}
      skipLink={{ href: "#mod-results", label: "Skip to results" }}
    >
      <ModBrowser gameVersion={gameVersion} loader={loader} />
    </AppFrame>
  );
}
