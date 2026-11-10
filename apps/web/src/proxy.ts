import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { hasClerkConfiguration } from "./lib/auth-config";

const middleware = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!hasClerkConfiguration()) return NextResponse.next();
  return middleware(request, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)", "/__clerk/(.*)"],
};
