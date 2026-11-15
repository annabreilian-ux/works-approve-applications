import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_HISTORY_COOKIE_NAME,
} from "@/lib/auth/constants";

export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("returnTo", returnTo);

  if (request.cookies.has(SESSION_HISTORY_COOKIE_NAME)) {
    signInUrl.searchParams.set("reason", "session-expired");
  }

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/applications/:path*"],
};
