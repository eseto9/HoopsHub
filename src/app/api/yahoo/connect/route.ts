import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authorizeUrl, STATE_COOKIE, yahooConfigured } from "@/lib/yahoo/oauth";



/** Start "Connect Yahoo": send the signed-in user to Yahoo's consent screen. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/connections", request.url));
  if (!yahooConfigured()) return NextResponse.redirect(new URL("/connections?yahoo=not_configured", request.url));

  // Random state ties Yahoo's reply to this browser and this user (CSRF protection).
  const state = `${crypto.randomUUID()}.${user.id}`;
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/yahoo", maxAge: 600 });
  return NextResponse.redirect(authorizeUrl(state));
}
