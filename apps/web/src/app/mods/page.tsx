import type { Metadata } from "next";
import { ModBrowser } from "../../components/mod-browser";
import { parseModContext } from "../../lib/mods";

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
  return <ModBrowser gameVersion={gameVersion} loader={loader} />;
}
