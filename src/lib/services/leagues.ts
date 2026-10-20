import "server-only";
import { getAdapter } from "@/lib/adapters/registry";
import type { AdapterConnection } from "@/lib/adapters/types";
import { PlatformError, ReconnectRequiredError } from "@/lib/errors";
import type { League, LeagueActivity, NewsItem, Platform, Player, PlayerListing, RosterSlot, Team } from "@/lib/schema";
import type { DashboardData, DashboardLeague, DashboardProblem, MatchupSummary } from "@/lib/schema/views";
import { watchedPlayerIds } from "./watchlist";
import { activityAlerts, pushPlan, recapMessage, recapWindow } from "@/lib/alerts";
import { claimAlert, getAlertPrefs, sendToUser } from "./push";
import { exposure, nameKey } from "@/lib/hub";
import { recapLeague, recapSummary, type RecapLeague } from "@/lib/recap";
import { mapLimit, playerNews } from "@/lib/nba/news";
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

  // Alerts need the user's own account (pending moves are private); a failure here never hides the league.
  let alerts: DashboardLeague["alerts"];
  if (myTeam && conn.credentials && adapter.getActivity) {
    try {
      alerts = activityAlerts(await adapter.getActivity(conn, league.externalId), myTeam.id, teams, Date.now());
    } catch {
      alerts = undefined;
    }
  }

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
        me: { team: myTeam, score: mine.score, categoryRecord: mine.categoryRecord },
        opponent: theirs && oppTeam ? { team: oppTeam, score: theirs.score, categoryRecord: theirs.categoryRecord } : null,
      };
    }
  }

  return {
    league,
    teamCount: teams.length,
    myTeam,
    alerts,
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

export type LeagueTab = "roster" | "matchup" | "players" | "activity" | "league" | "teams" | "standings" | "trade";

/** Data for one tab of the league page. Only fetches what that tab shows. */
export async function getLeagueTab(resolved: ResolvedLeague, tab: LeagueTab, opts: { teamId?: string; position?: string; period?: number; matchupId?: string } = {}) {
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
      const matchups = await adapter.getMatchups(conn, id, opts.period);
      const mine = myTeam ? matchups.find((m) => m.home.teamId === myTeam.id || m.away?.teamId === myTeam.id) : undefined;
      // Any game in the league can be opened; default to yours.
      const chosen = (opts.matchupId && matchups.find((m) => m.id === opts.matchupId)) || mine;
      const sides = chosen ? [chosen.home, chosen.away].filter((s): s is NonNullable<typeof s> => !!s) : [];
      const rosters = await Promise.all(sides.map((s) => adapter.getRoster(conn, id, byId.get(s.teamId)!.externalId)));
      return { tab, teams, matchup: chosen ?? null, isMine: !!chosen && chosen === mine, mineId: mine?.id ?? null, rosters, all: matchups } as const;
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
    case "league":
      return { tab, teams, overview: adapter.getLeagueOverview ? await adapter.getLeagueOverview(conn, id) : null } as const;
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

/** Player page: details plus what the viewer can do with the player. */
export async function getPlayerPage(resolved: ResolvedLeague, playerId: string) {
  const { conn, league } = resolved;
  const adapter = getAdapter(league.platform);
  if (!adapter.getPlayerDetail) return null;
  const id = league.externalId;
  const [detail, teams, watched] = await Promise.all([
    adapter.getPlayerDetail(conn, id, playerId),
    adapter.getTeams(conn, id),
    watchedPlayerIds(conn.userId, league.platform),
  ]);
  if (!detail) return null;
  const myTeam = teams.find((t) => t.isMine);
  const canAdd = resolved.viaAccount && adapter.capabilities.addDrop && !!myTeam && detail.listing.status !== "rostered";
  const mine = canAdd ? await adapter.getRoster(conn, id, myTeam!.externalId) : null;
  const owner = detail.listing.fantasyTeamId ? (teams.find((t) => t.id === detail.listing.fantasyTeamId) ?? null) : null;
  const canTrade = resolved.viaAccount && adapter.capabilities.trades && !!myTeam && !!owner && !owner.isMine;
  return { detail, teams, owner, mySlots: mine?.slots ?? null, watched: watched.includes(playerId), canTrade };
}

export interface MyTeamSection {
  league: League;
  myTeam: Team;
  matchup?: MatchupSummary;
  slots: RosterSlot[];
  /** Points league: show fantasy point columns. */
  points: boolean;
  hasPlayerPages: boolean;
  /** Lineup swaps can be made from Hoops Hub (ESPN, connected account). */
  canEditLineup: boolean;
  error?: string;
}

interface LoadedTeam {
  section: MyTeamSection;
  /** Server-only: connection with credentials. Never returned to pages. */
  resolved: ResolvedLeague | null;
}

async function loadMyTeams(userId: string): Promise<{ items: LoadedTeam[]; problems: DashboardData["problems"] }> {
  const { leagues, problems } = await getDashboard(userId);
  const withTeams = leagues.filter((l): l is DashboardLeague & { myTeam: Team } => !!l.myTeam);
  const items = await Promise.all(
    withTeams.map(async (l): Promise<LoadedTeam> => {
      const adapter = getAdapter(l.league.platform);
      const base = {
        league: l.league,
        myTeam: l.myTeam,
        matchup: l.matchup,
        points: l.league.format === "h2h-points" || l.league.format === "points",
        hasPlayerPages: !!adapter.getPlayerDetail,
        canEditLineup: false,
      };
      try {
        const resolved = await resolveLeague(userId, l.league.platform, l.league.externalId);
        if (!resolved) return { section: { ...base, slots: [], error: "This league isn't available right now." }, resolved: null };
        const roster = await adapter.getRoster(resolved.conn, l.league.externalId, l.myTeam.externalId);
        const canEditLineup = resolved.viaAccount && adapter.capabilities.setLineup;
        return { section: { ...base, canEditLineup, slots: roster.slots }, resolved };
      } catch (err) {
        return { section: { ...base, slots: [], error: friendlyError(err) }, resolved: null };
      }
    }),
  );
  return { items, problems };
}

/** Every league where the user has a team, with their roster. One failing league never hides the others. */
export async function getMyTeams(userId: string): Promise<{ sections: MyTeamSection[]; problems: DashboardData["problems"] }> {
  const { items, problems } = await loadMyTeams(userId);
  return { sections: items.map((i) => i.section), problems };
}

/** Matchup Center: your lineup and your opponent's, per league. */
export async function getMatchupCenter(userId: string) {
  const { items } = await loadMyTeams(userId);
  return Promise.all(
    items.map(async ({ section, resolved }) => {
      const opp = section.matchup?.opponent?.team;
      if (!resolved || !opp) return { section, opponentSlots: null as RosterSlot[] | null };
      try {
        const r = await getAdapter(section.league.platform).getRoster(resolved.conn, section.league.externalId, opp.externalId);
        return { section, opponentSlots: r.slots };
      } catch {
        return { section, opponentSlots: null };
      }
    }),
  );
}

/** Waiver Radar: each league's player pool (free agents and waivers). */
export async function getWaiverPools(userId: string) {
  const { items } = await loadMyTeams(userId);
  return Promise.all(
    items.map(async ({ section, resolved }) => {
      const adapter = getAdapter(section.league.platform);
      if (!resolved || !adapter.getPlayerPool) return { section, pool: [] as PlayerListing[], error: resolved ? "Not available for this platform." : section.error };
      try {
        return { section, pool: await adapter.getPlayerPool(resolved.conn, section.league.externalId) };
      } catch (err) {
        return { section, pool: [] as PlayerListing[], error: friendlyError(err) };
      }
    }),
  );
}

/** Combined activity: every league's feed plus its teams. */
export async function getActivityFeeds(userId: string) {
  const { items } = await loadMyTeams(userId);
  return Promise.all(
    items.map(async ({ section, resolved }) => {
      const adapter = getAdapter(section.league.platform);
      if (!resolved || !adapter.getActivity) return { section, teams: [] as Team[], feed: [] as LeagueActivity[] };
      try {
        const [teams, activity] = await Promise.all([
          adapter.getTeams(resolved.conn, section.league.externalId),
          adapter.getActivity(resolved.conn, section.league.externalId),
        ]);
        return { section, teams, feed: activity.feed };
      } catch {
        return { section, teams: [] as Team[], feed: [] as LeagueActivity[] };
      }
    }),
  );
}


export interface MyNewsEntry {
  player: Player;
  leagues: { name: string; slot: string; platform: Platform }[];
  news: NewsItem[];
}

/**
 * News and injuries for players you roster. Injured players first, then the
 * freshest news, capped to keep the page fast. Sleeper players borrow the
 * ESPN id of the same player on one of your ESPN rosters, when there is one.
 */
export async function getMyNews(userId: string, cap = 24): Promise<{ entries: MyNewsEntry[]; injured: MyNewsEntry[] }> {
  const { items } = await loadMyTeams(userId);
  const rosters = items.map((i) => ({ league: i.section.league, slots: i.section.slots }));
  const espnIdByName = new Map<string, string>();
  for (const r of rosters) for (const s of r.slots) if (s.player && r.league.platform === "espn") espnIdByName.set(nameKey(s.player.name), s.player.externalId);
  const entries: MyNewsEntry[] = exposure(rosters).map((e) => ({
    player: e.player,
    leagues: e.leagues.map((l) => ({ name: l.league.name, slot: l.slot, platform: l.league.platform })),
    news: [],
  }));
  const injured = entries.filter((e) => e.player.injuryStatus);
  const ranked = [...entries].sort(
    (a, b) => Number(!!b.player.injuryStatus) - Number(!!a.player.injuryStatus) || (b.player.newsAt ?? "").localeCompare(a.player.newsAt ?? ""),
  );
  const withIds = ranked.flatMap((e) => {
    const id = e.player.platform === "espn" ? e.player.externalId : espnIdByName.get(nameKey(e.player.name));
    return id ? [{ e, id }] : [];
  });
  await mapLimit(withIds.slice(0, cap), 6, async ({ e, id }) => {
    e.news = await playerNews(id);
  });
  return { entries: entries.filter((e) => e.news.length).sort((a, b) => (b.news[0]?.published ?? "").localeCompare(a.news[0]?.published ?? "")), injured };
}

/**
 * Push alerts for one user: trade offers, results and lineup reminders that
 * haven't been sent yet. Returns how many went out.
 */
export async function runAlertsForUser(userId: string, now = Date.now()): Promise<number> {
  const prefs = await getAlertPrefs(userId);
  const [{ leagues }, { sections }] = await Promise.all([getDashboard(userId), prefs.lineup ? getMyTeams(userId) : Promise.resolve({ sections: [] as MyTeamSection[] })]);
  const plan = pushPlan(
    leagues,
    sections.map((s) => ({ leagueId: s.league.id, leagueName: s.league.name, url: `/leagues/${s.league.platform}/${s.league.externalId}`, slots: s.slots })),
    prefs,
    now,
  );
  // Monday morning: one recap of last week across all leagues ("Results" switch).
  const recapKey = prefs.results ? recapWindow(now) : null;
  if (recapKey) {
    const { rows } = await getRecap(userId);
    if (rows.length) plan.push(recapMessage(recapKey, recapSummary(rows).text, rows.map((r) => ({ name: r.league.name, outcome: r.outcome, myScore: r.myScore }))));
  }
  let sent = 0;
  for (const m of plan) {
    if (!(await claimAlert(userId, m.key))) continue;
    sent += (await sendToUser(userId, { title: m.title, body: m.body, url: m.url, tag: m.tag })) > 0 ? 1 : 0;
  }
  return sent;
}

/** Weekly recap: last finished week in each league, plus the week ahead. */
export async function getRecap(userId: string): Promise<{ rows: RecapLeague[]; waiting: string[] }> {
  const { items } = await loadMyTeams(userId);
  const rows: RecapLeague[] = [];
  const waiting: string[] = [];
  await Promise.all(
    items.map(async ({ section, resolved }) => {
      if (!resolved || section.error) return;
      const adapter = getAdapter(section.league.platform);
      const id = section.league.externalId;
      try {
        const thisWeek = await adapter.getMatchups(resolved.conn, id);
        const period = thisWeek[0]?.period ?? 1;
        if (period <= 1) {
          waiting.push(section.league.name);
          return;
        }
        const [lastWeek, standings, teams] = await Promise.all([
          adapter.getMatchups(resolved.conn, id, period - 1),
          adapter.getStandings(resolved.conn, id),
          adapter.getTeams(resolved.conn, id),
        ]);
        const mine = section.myTeam.id;
        const row = recapLeague({
          league: section.league,
          myTeamId: mine,
          teams,
          lastWeek,
          standing: standings.find((s) => s.teamId === mine),
          thisWeek: thisWeek.find((m) => m.home.teamId === mine || m.away?.teamId === mine) ?? null,
          slots: section.slots,
        });
        if (row) rows.push(row);
        else waiting.push(section.league.name);
      } catch {
        waiting.push(section.league.name);
      }
    }),
  );
  return { rows: rows.sort((a, b) => a.league.name.localeCompare(b.league.name)), waiting };
}
