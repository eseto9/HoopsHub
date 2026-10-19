import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { connectPlatform } from "@/lib/services/connections";
import { getCurrentUser } from "@/lib/session";
import { exchangeCode, STATE_COOKIE } from "@/lib/yahoo/oauth";

/** Yahoo redirects here after the user approves (or declines) access. */
export async function GET(request: NextRequest) {
  const back = (status: string) => NextResponse.redirect(new URL(`/connections?yahoo=${status}#yahoo-account`, request.url));
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/yahoo" });

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/connections", request.url));

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("declined");
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code || state !== expected || !state.endsWith(`.${user.id}`)) return back("invalid");

  try {
    const tokens = await exchangeCode(code);
    const conn = await connectPlatform(user.id, "yahoo", {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      guid: tokens.guid ?? "",
    });
    return back(conn.displayName.includes("waiting") ? "pending_approval" : "connected");
  } catch {
    // Never log the error: token responses can contain secrets.
    return back("failed");
  }
}
