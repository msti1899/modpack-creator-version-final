import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { hasClerkConfiguration } from "./lib/auth-config";
import { withoutSelfRewrite } from "./lib/middleware-response";

const middleware = clerkMiddleware();

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!hasClerkConfiguration()) return NextResponse.next();
  const response = await middleware(request, event);
  return response ? withoutSelfRewrite(request.url, response) : response;
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)", "/__clerk/(.*)"],
};
