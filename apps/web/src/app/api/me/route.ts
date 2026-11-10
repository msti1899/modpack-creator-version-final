import { auth } from "@clerk/nextjs/server";
import { hasClerkConfiguration } from "../../../lib/auth-config";
import { createIdentityProxy } from "../../../lib/identity";

export const dynamic = "force-dynamic";

export const GET = createIdentityProxy({
  enabled: hasClerkConfiguration(),
  apiUrl: process.env.API_URL ?? "http://127.0.0.1:3001",
  getToken: async () => {
    const session = await auth();
    return session.isAuthenticated ? session.getToken() : null;
  },
});
