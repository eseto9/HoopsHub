import "server-only";

/**
 * Yahoo OAuth 2.0 (authorization code flow), per Yahoo's OAuth 2.0 guide:
 * - authorize: api.login.yahoo.com/oauth2/request_auth
 * - tokens:    api.login.yahoo.com/oauth2/get_token, client id/secret as HTTP Basic auth
 * Access tokens last about an hour; the refresh token gets a new one.
 * The Fantasy Sports permission (read-only for now) is set on the Yahoo app itself.
 */

/** httpOnly cookie holding the OAuth state between connect and callback. */
export const STATE_COOKIE = "hh_yahoo_state";

const AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";

export interface YahooTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch ms when the access token stops working. */
  expires_at: string;
  /** Yahoo's id for the user, when the token response includes it. */
  guid?: string;
}

export class YahooConfigError extends Error {}

function config() {
  const clientId = process.env.YAHOO_CLIENT_ID?.trim();
  const clientSecret = process.env.YAHOO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.YAHOO_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new YahooConfigError("Yahoo isn't set up on this server yet");
  return { clientId, clientSecret, redirectUri };
}

export function yahooConfigured(): boolean {
  return !!(process.env.YAHOO_CLIENT_ID?.trim() && process.env.YAHOO_CLIENT_SECRET?.trim() && process.env.YAHOO_REDIRECT_URI?.trim());
}

export function authorizeUrl(state: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", state, language: "en-us" });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<YahooTokens> {
  const { clientId, clientSecret, redirectUri } = config();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ redirect_uri: redirectUri, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    // Never log the response: it can contain tokens.
    const reason = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
    throw new Error(`Yahoo sign-in failed (${reason})`);
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : String(body.refresh_token ?? ""),
    // Treat it as expired a minute early.
    expires_at: String(Date.now() + (expiresIn - 60) * 1000),
    guid: typeof json.xoauth_yahoo_guid === "string" ? json.xoauth_yahoo_guid : undefined,
  };
}

export function exchangeCode(code: string) {
  return tokenRequest({ grant_type: "authorization_code", code });
}

export function refreshTokens(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}
