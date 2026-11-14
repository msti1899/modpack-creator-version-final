import { AuthControls } from "../components/auth-controls";
import { hasClerkConfiguration } from "../lib/auth-config";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="text-sm text-primary">Development scaffold</p>
      <h1 className="mt-4 text-balance text-4xl font-semibold">Modpack Creator</h1>
      <p className="mt-6 text-pretty text-lg text-foreground">
        Project scaffold is ready.
      </p>
      <p className="mt-3 text-pretty text-muted-foreground">
        Next.js frontend and an independent Hono API running on Bun.
        Clerk provides account access; the modpack interface is not connected yet.
      </p>
      <AuthControls enabled={hasClerkConfiguration()} />
      <a
        className="mt-8 inline-block rounded text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        href="https://nextjs.org/docs"
      >
        Read the Next.js documentation
      </a>
    </main>
  );
}
