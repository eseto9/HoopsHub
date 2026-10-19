import "server-only";
import { PlatformError, ReconnectRequiredError } from "@/lib/errors";
import { acquire } from "@/lib/rate-limit";
import { saveCredentials } from "@/lib/services/credentials";
import { refreshTokens, type YahooTokens } from "@/lib/yahoo/oauth";
import type { AdapterConnection } from "../types";

export const YAHOO_API = "https://fantasysports.yahooapis.com/fantasy/v2";

/** Thrown when Yahoo hasn't approved this app for the Fantasy Sports API yet. */
export class YahooAccessError extends PlatformError {
  constructor(status: number) {
    super("yahoo", status, "Yahoo hasn't approved Hoops Hub for fantasy data yet. This starts working once Yahoo approves the API application.");
  }
}

function tokensOf(conn: AdapterConnection): YahooTokens {
  const c = conn.credentials;
  if (!c?.access_token || !c.refresh_token) throw new ReconnectRequiredError("yahoo", conn.id, "Connect your Yahoo account");
  return { access_token: c.access_token, refresh_token: c.refresh_token, expires_at: c.expires_at ?? "0", guid: c.guid };
}

/** Current access token, refreshed (and saved) when it has expired. */
async function accessToken(conn: AdapterConnection, force = false): Promise<string> {
  const tokens = tokensOf(conn);
  if (!force && Number(tokens.expires_at) > Date.now()) return tokens.access_token;
  let next: YahooTokens;
  try {
    next = await refreshTokens(tokens.refresh_token);
  } catch {
    throw new ReconnectRequiredError("yahoo", conn.id, "Your Yahoo connection expired");
  }
  const stored = { ...next, guid: next.guid ?? tokens.guid ?? "" };
  // Keep this request's copy current too, so later calls don't refresh again.
  conn.credentials = { ...stored };
  if (!conn.id.startsWith("pending:")) await saveCredentials(conn.id, stored);
  return next.access_token;
}

/**
 * GET a Fantasy API resource as JSON. Path is relative to /fantasy/v2,
 * e.g. "/users;use_login=1/games;game_keys=nba/leagues".
 */
export async function yahooFetch<T>(conn: AdapterConnection, path: string): Promise<T> {
  const url = `${YAHOO_API}${path}${path.includes("?") ? "&" : "?"}format=json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await acquire("yahoo");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${await accessToken(conn, attempt > 0)}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    const text = await res.text().catch(() => "");
    // An expired or revoked token says so; retry once with a fresh one.
    if (res.status === 401 && attempt === 0 && /token_expired|token_rejected|invalid_token/i.test(text)) continue;
    if (res.status === 401 || res.status === 403) throw new YahooAccessError(res.status);
    throw new PlatformError("yahoo", res.status, `Yahoo returned ${res.status}`);
  }
  throw new ReconnectRequiredError("yahoo", conn.id, "Your Yahoo connection expired");
}
