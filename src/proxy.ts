import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirects based only on whether a session cookie exists.
 * Real authorization happens in requireUser() on every page and action.
 */
export function proxy(request: NextRequest) {
  const hasSession = !!getSessionCookie(request);
  const { pathname, search } = request.nextUrl;
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  if (!hasSession && !isAuthPage && pathname !== "/") {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && (isAuthPage || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/sign-in", "/sign-up", "/dashboard/:path*", "/connections/:path*", "/leagues/:path*"],
};
