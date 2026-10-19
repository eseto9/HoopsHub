import "server-only";
import { NotFoundError, PlatformError } from "@/lib/errors";
import type { League, Player } from "@/lib/schema";
import type { AdapterConnection, ConnectResult, FreeAgentQuery, PlatformAdapter, RosterResult } from "../types";
import { cacheScope, cached, cookiesOf, espnFetch, ESPN_READS, fanEndpoint, leagueEndpoint, type EspnCookies } from "./client";
import { LINEUP_SLOTS } from "./constants";
import {
  leagueIdsFromFanProfile,
  normalizeLeague,
  normalizeMatchups,
  normalizePlayer,
  normalizeProTeams,
  normalizeRoster,
  normalizeStandings,
  normalizeTeams,
  type LeagueContext,
  type ProTeamMap,
} from "./normalize";
import type {
  EspnFanProfile,
  EspnFreeAgentsResponse,
  EspnGame,
  EspnLeagueSettingsResponse,
  EspnMatchupsResponse,
  EspnProTeamsResponse,
  EspnRosterResponse,
} from "./raw-types";

const TTL = { game: 3600, proTeams: 86400, settings: 300, roster: 120, matchups: 60, freeAgents: 300, fan: 600 };

const SWID_RE = /^\{?[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}?$/i;

/** Normalize pasted cookie values; returns null if they look malformed. */
export function parseEspnCookies(input: Record<string, string>): EspnCookies | null {
  const espn_s2 = (input.espn_s2 ?? "").trim();
  const swidRaw = (input.swid ?? "").trim();
  if (espn_s2.length < 20 || /\s/.test(espn_s2) || !SWID_RE.test(swidRaw)) return null;
  return { espn_s2, swid: `{${swidRaw.replace(/[{}]/g, "").toUpperCase()}}` };
}

async function getSeason(): Promise<number> {
  const game = await cached("espn:game", TTL.game, () => espnFetch<EspnGame>(ESPN_READS, { cookies: null }));
  return game.currentSeasonId;
}

async function getProTeams(season: number): Promise<ProTeamMap> {
  return cached(`espn:proTeams:${season}`, TTL.proTeams, async () =>
    normalizeProTeams(await espnFetch<EspnProTeamsResponse>(`${ESPN_READS}/seasons/${season}?view=proTeamSchedules_wl`, { cookies: null })),
  );
}

function fetchOpts(conn: AdapterConnection) {
  const cookies = cookiesOf(conn);
  return { cookies, connectionId: cookies ? conn.id : undefined };
}

async function getSettings(conn: AdapterConnection, leagueId: string): Promise<EspnLeagueSettingsResponse> {
  const season = await getSeason();
  return cached(`espn:${cacheScope(conn)}:settings:${season}:${leagueId}`, TTL.settings, () =>
    espnFetch(leagueEndpoint(season, leagueId, ["mSettings", "mStatus", "mTeam"]), fetchOpts(conn)),
  );
}

function context(conn: AdapterConnection, leagueId: string): LeagueContext {
  return {
    leagueId,
    connectionId: conn.id,
    swid: cookiesOf(conn)?.swid,
    myTeamExternalId: conn.myTeamByLeague?.[leagueId],
  };
}

export const espnAdapter: PlatformAdapter = {
  platform: "espn",
  capabilities: { freeAgents: true, setLineup: false, addDrop: false, trades: false },

  /** Validates pasted espn_s2 / SWID cookies by loading the ESPN fan profile. */
  async connect(_userId, input): Promise<ConnectResult> {
    const cookies = parseEspnCookies(input);
    if (!cookies) throw new PlatformError("espn", 400, "Those don't look like valid espn_s2 and SWID values");

    const fan = await espnFetch<EspnFanProfile>(fanEndpoint(cookies.swid), { cookies });
    const season = await getSeason();
    let displayName = "ESPN account";
    const [firstLeague] = leagueIdsFromFanProfile(fan, season);
    if (firstLeague) {
      try {
        const s = await espnFetch<EspnLeagueSettingsResponse>(leagueEndpoint(season, firstLeague, ["mTeam"]), { cookies });
        const me = s.members?.find((m) => m.id.toUpperCase() === cookies.swid);
        if (me?.displayName) displayName = me.displayName;
      } catch {
        // Display name is cosmetic; the cookies are already proven valid.
      }
    }
    return { externalUserId: cookies.swid, displayName, credentials: { ...cookies } };
  },

  /** Cookie connections discover leagues from the fan profile; public leagues are added by id elsewhere. */
  async listLeagues(conn): Promise<League[]> {
    const cookies = cookiesOf(conn);
    if (!cookies) return [];
    const season = await getSeason();
    const fan = await cached(`espn:conn:${conn.id}:fan`, TTL.fan, () =>
      espnFetch<EspnFanProfile>(fanEndpoint(cookies.swid), { cookies, connectionId: conn.id }),
    );
    const ids = leagueIdsFromFanProfile(fan, season);
    return Promise.all(ids.map((id) => espnAdapter.getLeague(conn, id)));
  },

  async getLeague(conn, leagueId) {
    return normalizeLeague(await getSettings(conn, leagueId), context(conn, leagueId));
  },

  async getTeams(conn, leagueId) {
    return normalizeTeams(await getSettings(conn, leagueId), context(conn, leagueId));
  },

  async getRoster(conn, leagueId, teamId): Promise<RosterResult> {
    const settings = await getSettings(conn, leagueId);
    const team = normalizeTeams(settings, context(conn, leagueId)).find((t) => t.externalId === teamId);
    if (!team) throw new NotFoundError(`Team ${teamId} not found in ESPN league ${leagueId}`);
    const [roster, proTeams] = await Promise.all([
      cached(`espn:${cacheScope(conn)}:roster:${settings.seasonId}:${leagueId}`, TTL.roster, () =>
        espnFetch<EspnRosterResponse>(leagueEndpoint(settings.seasonId, leagueId, ["mRoster"]), fetchOpts(conn)),
      ),
      getProTeams(settings.seasonId),
    ]);
    return { team, slots: normalizeRoster(settings, roster, teamId, proTeams) };
  },

  async getMatchups(conn, leagueId, period) {
    const season = await getSeason();
    const raw = await cached(`espn:${cacheScope(conn)}:matchups:${season}:${leagueId}`, TTL.matchups, () =>
      espnFetch<EspnMatchupsResponse>(leagueEndpoint(season, leagueId, ["mMatchup", "mMatchupScore"]), fetchOpts(conn)),
    );
    return normalizeMatchups(raw, Number(leagueId), period);
  },

  async getStandings(conn, leagueId) {
    return normalizeStandings(await getSettings(conn, leagueId));
  },

  async getFreeAgents(conn, leagueId, query: FreeAgentQuery = {}): Promise<Player[]> {
    const settings = await getSettings(conn, leagueId);
    const season = settings.seasonId;
    const filter = {
      players: {
        filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
        limit: 50,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
      },
    };
    const extra: Record<string, string> = settings.scoringPeriodId ? { scoringPeriodId: String(settings.scoringPeriodId) } : {};
    const [raw, proTeams] = await Promise.all([
      cached(`espn:${cacheScope(conn)}:fa:${season}:${leagueId}`, TTL.freeAgents, () =>
        espnFetch<EspnFreeAgentsResponse>(leagueEndpoint(season, leagueId, ["kona_player_info"], extra), {
          ...fetchOpts(conn),
          headers: { "X-Fantasy-Filter": JSON.stringify(filter) },
        }),
      ),
      getProTeams(season),
    ]);

    let entries = raw.players;
    if (query.position) {
      const slotId = Number(Object.entries(LINEUP_SLOTS).find(([, label]) => label === query.position)?.[0]);
      if (!Number.isNaN(slotId)) entries = entries.filter((e) => e.player.eligibleSlots.includes(slotId));
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      entries = entries.filter((e) => e.player.fullName.toLowerCase().includes(q));
    }
    return entries.slice(0, query.limit ?? 50).map((e) => normalizePlayer(e.player, proTeams));
  },
};
