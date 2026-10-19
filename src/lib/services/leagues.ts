import "server-only";
import { getAdapter } from "@/lib/adapters/registry";
import type { AdapterConnection } from "@/lib/adapters/types";
import { PlatformError, ReconnectRequiredError } from "@/lib/errors";
import type { League, Platform, Team } from "@/lib/schema";
import type { DashboardData, DashboardLeague, DashboardProblem, MatchupSummary } from "@/lib/schema/views";
import { watchedPlayerIds } from "./watchlist";
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

export interface ResolvedLeague {
  conn: AdapterConnection;
  league: League;
  /** True when loaded through the user's own account (writes possible later). */
  viaAccount: boolean;
}

/**
 * Find how this user can open a league: through a connected account first,
 * then as a public league they added. Returns null if neither works.
 */
export async function resolveLeague(userId: string, platform: Platform, externalLeagueId: string): Promise<ResolvedLeague | null> {
  const [conns, prefs] = await Promise.all([getAdapterConnections(userId), listLeaguePreferences(userId)]);
  const adapter = getAdapter(platform);
  const pref = prefs.find((p) => p.platform === platform && p.externalLeagueId === externalLeagueId);
  const picks = pref?.myTeamExternalId ? { [externalLeagueId]: pref.myTeamExternalId } : {};

  for (const c of conns.filter((c) => c.platform === platform && c.status === "active")) {
    const conn = { ...c, myTeamByLeague: picks };
    try {
      return { conn, league: await adapter.getLeague(conn, externalLeagueId), viaAccount: true };
    } catch (err) {
      if (err instanceof ReconnectRequiredError) await markNeedsReconnect(c.id);
      else if (!(err instanceof PlatformError)) throw err;
    }
  }

  if (pref && !pref.connectionId) {
    const conn: AdapterConnection = { id: `public:${platform}`, userId, platform, externalUserId: "", credentials: null, myTeamByLeague: picks };
    return { conn, league: await adapter.getLeague(conn, externalLeagueId), viaAccount: false };
  }
  return null;
}

export type LeagueTab = "roster" | "matchup" | "players" | "activity" | "teams" | "standings" | "trade";

/** Data for one tab of the league page. Only fetches what that tab shows. */
export async function getLeagueTab(resolved: ResolvedLeague, tab: LeagueTab, opts: { teamId?: string; position?: string } = {}) {
  const { conn, league } = resolved;
  const adapter = getAdapter(league.platform);
  const id = league.externalId;
  const teams = await adapter.getTeams(conn, id);
  const byId = new Map<string, Team>(teams.map((t) => [t.id, t]));
  const myTeam = teams.find((t) => t.isMine);

  switch (tab) {
    case "roster": {
      const teamExt = opts.teamId ?? myTeam?.externalId;
      return { tab, teams, roster: teamExt ? await adapter.getRoster(conn, id, teamExt) : null } as const;
    }
    case "matchup": {
      const matchups = await adapter.getMatchups(conn, id);
      const mine = myTeam ? matchups.find((m) => m.home.teamId === myTeam.id || m.away?.teamId === myTeam.id) : undefined;
      const sides = mine ? [mine.home, mine.away].filter((s): s is NonNullable<typeof s> => !!s) : [];
      const rosters = await Promise.all(sides.map((s) => adapter.getRoster(conn, id, byId.get(s.teamId)!.externalId)));
      return { tab, teams, matchup: mine ?? null, rosters, all: matchups } as const;
    }
    case "players": {
      // Your roster too (for the drop picker) when the league is connected through your account.
      const canAdd = resolved.viaAccount && adapter.capabilities.addDrop && !!myTeam;
      const [pool, mine, watched] = await Promise.all([
        adapter.getPlayerPool
          ? adapter.getPlayerPool(conn, id)
          : adapter.getFreeAgents(conn, id, { limit: 50 }).then((ps) =>
              ps.map((player) => ({ player, status: "free_agent" as const, fantasyTeamId: null, gamesThisWeek: 0, today: null })),
            ),
        canAdd ? adapter.getRoster(conn, id, myTeam!.externalId) : Promise.resolve(null),
        watchedPlayerIds(conn.userId, league.platform),
      ]);
      return { tab, teams, pool, mySlots: mine?.slots ?? null, watched } as const;
    }
    case "trade": {
      const other = teams.find((t) => t.externalId === opts.teamId && !t.isMine);
      if (!other || !myTeam || !resolved.viaAccount || !adapter.capabilities.trades) return { tab, teams, trade: null } as const;
      const [mine, theirs] = await Promise.all([adapter.getRoster(conn, id, myTeam.externalId), adapter.getRoster(conn, id, other.externalId)]);
      return { tab, teams, trade: { myTeam, other, mySlots: mine.slots, theirSlots: theirs.slots } } as const;
    }
    case "standings":
      return { tab, teams, standings: await adapter.getStandings(conn, id) } as const;
    case "teams":
      return { tab, teams } as const;
    case "activity": {
      const activity = adapter.getActivity ? await adapter.getActivity(conn, id) : { feed: [], pendingForTeam: [] };
      return { tab, teams, activity } as const;
    }
  }
}

/** Look up a public league by id (no credentials) so the user can pick their team. */
export async function lookupPublicLeague(platform: Platform, externalLeagueId: string) {
  const conn: AdapterConnection = { id: `public:${platform}`, userId: "", platform, externalUserId: "", credentials: null };
  const adapter = getAdapter(platform);
  const [league, teams] = await Promise.all([adapter.getLeague(conn, externalLeagueId), adapter.getTeams(conn, externalLeagueId)]);
  return { league, teams };
}
