import "server-only";
import { PlatformError } from "@/lib/errors";
import type { ConnectResult, PlatformAdapter } from "../types";
import { yahooFetch, YahooAccessError } from "./client";

/**
 * Yahoo Fantasy, read-only: Yahoo grants no write access ("The Yahoo Fantasy
 * Sports API currently provides read access only", sports.yahoo.com/developer/access).
 *
 * Data methods are filled in from real responses saved to fixtures/yahoo
 * (scripts/fetch-yahoo.ts). Until then they say so instead of guessing.
 */

const notYet = () => new PlatformError("yahoo", 501, "Your Yahoo account is connected. Yahoo leagues show up here once Hoops Hub's Yahoo support is finished.");

/** Leagues the signed-in user is in, for this season's NBA game. */
export const MY_NBA_LEAGUES = "/users;use_login=1/games;game_keys=nba/leagues";

export const yahooAdapter: PlatformAdapter = {
  platform: "yahoo",
  capabilities: { freeAgents: false, setLineup: false, addDrop: false, trades: false },

  /** Input: tokens from the OAuth callback. Keeps the connection even if Yahoo hasn't approved the app yet. */
  async connect(_userId, input): Promise<ConnectResult> {
    if (!input.access_token || !input.refresh_token) throw new PlatformError("yahoo", 400, "Yahoo sign-in didn't return a token");
    const credentials = { access_token: input.access_token, refresh_token: input.refresh_token, expires_at: input.expires_at ?? "0", guid: input.guid ?? "" };
    let displayName = "Yahoo account";
    try {
      await yahooFetch(
        { id: "pending:yahoo", userId: _userId, platform: "yahoo", externalUserId: "", credentials },
        MY_NBA_LEAGUES,
      );
    } catch (err) {
      if (err instanceof YahooAccessError) displayName = "Yahoo account (waiting on Yahoo's approval)";
      else throw err;
    }
    return { externalUserId: input.guid || "me", displayName, credentials };
  },

  async listLeagues(conn) {
    // Calling Yahoo here surfaces "not approved yet" on the dashboard.
    await yahooFetch(conn, MY_NBA_LEAGUES);
    throw notYet();
  },
  async getLeague() {
    throw notYet();
  },
  async getTeams() {
    throw notYet();
  },
  async getRoster() {
    throw notYet();
  },
  async getMatchups() {
    throw notYet();
  },
  async getStandings() {
    throw notYet();
  },
  async getFreeAgents() {
    throw notYet();
  },
};
