import { cached } from "@/lib/cache";
import { PlatformError, ReconnectRequiredError } from "@/lib/errors";
import { acquire } from "@/lib/rate-limit";
import type { AdapterConnection } from "../types";

export const ESPN_READS = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba";
const FAN_API = "https://fan.api.espn.com/apis/v2/fans";

export interface EspnCookies {
  espn_s2: string;
  swid: string;
}

export function cookiesOf(conn: Pick<AdapterConnection, "credentials">): EspnCookies | null {
  const c = conn.credentials;
  return c?.espn_s2 && c?.swid ? { espn_s2: c.espn_s2, swid: c.swid } : null;
}

interface FetchOptions {
  cookies: EspnCookies | null;
  /** Set when the cookies belong to a stored connection, so 401s prompt a reconnect. */
  connectionId?: string;
  headers?: Record<string, string>;
}

export async function espnFetch<T>(url: string, opts: FetchOptions): Promise<T> {
  await acquire("espn");
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (opts.cookies) headers.Cookie = `espn_s2=${opts.cookies.espn_s2}; SWID=${opts.cookies.swid}`;

  const res = await fetch(url, { headers, redirect: "manual", cache: "no-store" });

  if (res.status === 401 || res.status === 403) {
    if (opts.cookies && opts.connectionId) throw new ReconnectRequiredError("espn", opts.connectionId, "ESPN cookies expired or were rejected");
    throw new PlatformError(
      "espn",
      res.status,
      opts.cookies ? "ESPN rejected these cookies" : "This ESPN league is private. Connect your ESPN account to view it.",
    );
  }
  if (res.status === 404) throw new PlatformError("espn", 404, "ESPN league not found for this season");
  if (!res.ok) throw new PlatformError("espn", res.status, `ESPN returned ${res.status}`);
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    throw new PlatformError("espn", res.status, "ESPN returned an unexpected response");
  }
  return (await res.json()) as T;
}

/**
 * POST a write to ESPN with the user's cookies. Failures carry a short,
 * credential-free message taken from ESPN's response when it has one.
 */
export async function espnPost<T>(url: string, body: unknown, opts: { cookies: EspnCookies; connectionId: string }): Promise<T> {
  await acquire("espn");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `espn_s2=${opts.cookies.espn_s2}; SWID=${opts.cookies.swid}`,
    },
    body: JSON.stringify(body),
    redirect: "manual",
    cache: "no-store",
  });
  if (res.status === 401) throw new ReconnectRequiredError("espn", opts.connectionId, "ESPN cookies expired or were rejected");
  const text = await res.text();
  if (!res.ok) throw new PlatformError("espn", res.status, describeEspnError(text) ?? `ESPN rejected the change (${res.status})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PlatformError("espn", res.status, "ESPN returned an unexpected response");
  }
}

/** ESPN's error body shape for writes isn't captured yet: look for a readable message without assuming structure. */
function describeEspnError(text: string): string | undefined {
  try {
    const found: string[] = [];
    (function walk(v: unknown, key = "") {
      if (found.length) return;
      if (typeof v === "string" && /message|reason|detail/i.test(key) && v.length < 300) found.push(v);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    })(JSON.parse(text));
    return found[0];
  } catch {
    return undefined;
  }
}

export function leagueEndpoint(season: number, leagueId: string, views: string[], extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const v of views) params.append("view", v);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return `${ESPN_READS}/seasons/${season}/segments/0/leagues/${leagueId}?${params}`;
}

export function fanEndpoint(swid: string) {
  return `${FAN_API}/${encodeURIComponent(swid)}?displayEvents=true&featureFlags=challengeEntries&platform=web`;
}

/**
 * Cache key scoped to who is asking: private league data fetched with one
 * user's cookies must never be served to another user.
 */
export function cacheScope(conn: Pick<AdapterConnection, "id" | "credentials">) {
  return cookiesOf(conn) ? `conn:${conn.id}` : "public";
}

export { cached };
