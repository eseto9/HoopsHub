import "server-only";
import { getAdapter } from "@/lib/adapters/registry";
import type { AdapterConnection } from "@/lib/adapters/types";
import { PlatformError, ReconnectRequiredError } from "@/lib/errors";
import type { League, Platform, Team } from "@/lib/schema";
import type { DashboardData, DashboardLeague, DashboardProblem, MatchupSummary } from "@/lib/schema/views";
import { getAdapterConnections, listConnections, listLeaguePreferences, markNeedsReconnect, markSynced } from "./connections";

const PLATFORM_LABEL: Record<Platform, string> = { espn: "ESPN", yahoo: "Yahoo", sleeper: "Sleeper" };

function friendlyError(err: unknown): string {
  if (err instanceof PlatformError) return err.message;
  return "Something went wrong loading this league. Try again in a minute.";
}

async function summarize(conn: AdapterConnection, league: League): Promise<DashboardLeague> {
  const adapter = getAdapter(league.platform);
  const [teams, standings, matchups] = await Promise.all([
    adapter.getTeams(conn, league.externalId),
    adapter.getStandings(conn, league.externalId),
    adapter.getMatchups(conn, league.externalId),
  ]);
  const byId = new Map<string, Team>(teams.map((t) => [t.id, t]));
  const myTeam = league.myTeamId ? byId.get(league.myTeamId) : undefined;

  let matchup: MatchupSummary | undefined;
  if (myTeam) {
    const m = matchups.find((x) => x.home.teamId === myTeam.id || x.away?.teamId === myTeam.id);
    if (m) {
      const mine = m.home.teamId === myTeam.id ? m.home : m.away!;
      const theirs = m.home.teamId === myTeam.id ? m.away : m.home;
      const oppTeam = theirs ? byId.get(theirs.teamId) : undefined;
      matchup = {
        period: m.period,
        status: m.status,
        me: { team: myTeam, score: mine.score },
        opponent: theirs && oppTeam ? { team: oppTeam, score: theirs.score } : null,
      };
    }
  }

  return {
    league,
    teamCount: teams.length,
    myTeam,
    standing: myTeam ? standings.find((s) => s.teamId === myTeam.id) : undefined,
    matchup,
  };
}

/**
 * Everything the dashboard needs, across all of the user's connections and
 * public leagues. One failing platform or league never breaks the others.
 */
export async function getDashboard(userId: string): Promise<DashboardData> {
  const [conns, prefs] = await Promise.all([getAdapterConnections(userId), listLeaguePreferences(userId)]);
  const problems: DashboardProblem[] = [];
  const hidden = new Set(prefs.filter((p) => p.hidden).map((p) => `${p.platform}:${p.externalLeagueId}`));
  const pickedTeams = (platform: Platform) =>
    Object.fromEntries(
      prefs.filter((p) => p.platform === platform && p.myTeamExternalId).map((p) => [p.externalLeagueId, p.myTeamExternalId!]),
    );

  // 1) Leagues discovered through connected accounts.
  const sources: { conn: AdapterConnection; league: League }[] = [];
  await Promise.all(
    conns.map(async (conn) => {
      const label = PLATFORM_LABEL[conn.platform];
      if (conn.status === "needs_reconnect") {
        problems.push({ platform: conn.platform, kind: "reconnect", connectionId: conn.id, message: `Your ${label} connection expired.` });
        return;
      }
      const withPicks = { ...conn, myTeamByLeague: pickedTeams(conn.platform) };
      try {
        const leagues = await getAdapter(conn.platform).listLeagues(withPicks);
        for (const league of leagues) sources.push({ conn: withPicks, league });
        await markSynced(conn.id);
      } catch (err) {
        if (err instanceof ReconnectRequiredError) {
          await markNeedsReconnect(conn.id);
          problems.push({ platform: conn.platform, kind: "reconnect", connectionId: conn.id, message: `Your ${label} connection expired.` });
        } else {
          problems.push({ platform: conn.platform, kind: "error", connectionId: conn.id, message: friendlyError(err) });
        }
      }
    }),
  );

  // 2) Public leagues added by id (no account). Skip any already found above.
  const seen = new Set(sources.map((s) => s.league.id));
  const publicPrefs = prefs.filter((p) => !p.connectionId && !p.hidden && !seen.has(`${p.platform}:${p.externalLeagueId}`));
  await Promise.all(
    publicPrefs.map(async (p) => {
      const conn: AdapterConnection = {
        id: `public:${p.platform}`,
        userId,
        platform: p.platform,
        externalUserId: "",
        credentials: null,
        myTeamByLeague: p.myTeamExternalId ? { [p.externalLeagueId]: p.myTeamExternalId } : {},
      };
      try {
        sources.push({ conn, league: await getAdapter(p.platform).getLeague(conn, p.externalLeagueId) });
      } catch (err) {
        problems.push({ platform: p.platform, kind: "error", message: `League ${p.externalLeagueId}: ${friendlyError(err)}` });
      }
    }),
  );

  // 3) Summaries, in parallel; per-league failures become problems.
  const visible = sources.filter((s) => !hidden.has(s.league.id));
  const results = await Promise.all(
    visible.map(async ({ conn, league }) => {
      try {
        return await summarize(conn, league);
      } catch (err) {
        problems.push({ platform: league.platform, kind: "error", leagueName: league.name, message: friendlyError(err) });
        return null;
      }
    }),
  );

  const leagues = results
    .filter((r): r is DashboardLeague => r !== null)
    .sort((a, b) => a.league.platform.localeCompare(b.league.platform) || a.league.name.localeCompare(b.league.name));

  return { connections: await listConnections(userId), leagues, problems };
}

/** Look up a public league by id (no credentials) so the user can pick their team. */
export async function lookupPublicLeague(platform: Platform, externalLeagueId: string) {
  const conn: AdapterConnection = { id: `public:${platform}`, userId: "", platform, externalUserId: "", credentials: null };
  const adapter = getAdapter(platform);
  const [league, teams] = await Promise.all([adapter.getLeague(conn, externalLeagueId), adapter.getTeams(conn, externalLeagueId)]);
  return { league, teams };
}
