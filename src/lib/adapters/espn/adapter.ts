import "server-only";
import { NotFoundError, PlatformError } from "@/lib/errors";
import type { League, Player } from "@/lib/schema";
import type { AdapterConnection, ConnectResult, FreeAgentQuery, LineupChange, PlatformAdapter, RosterResult } from "../types";
import { invalidate } from "@/lib/cache";
import { cacheScope, cached, communicationEndpoint, cookiesOf, espnFetch, espnPost, ESPN_READS, fanEndpoint, leagueEndpoint, type EspnCookies } from "./client";
import { buildAddDrop, buildCancel, buildTradeResponse, buildLineupTransaction, buildTradeProposal, transactionsUrl, type EspnTransactionResponse } from "./writes";
import { LINEUP_SLOTS, mapScoringType } from "./constants";
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
  EspnCommunicationResponse,
  EspnFanProfile,
  EspnFreeAgentsResponse,
  EspnNewsResponse,
  EspnPlayerCardResponse,
  EspnGame,
  EspnLeagueSettingsResponse,
  EspnMatchupsResponse,
  EspnProTeamsResponse,
  EspnRosterResponse,
  EspnTransactionsResponse,
} from "./raw-types";
import { activityPlayerIds, closedIds, communicationPlayerIds, normalizeActivity, normalizeCommunication } from "./activity";
import { draftPlayerIds, normalizeOverview, tradeBlockPlayerIds } from "./overview";
import { gamesById, normalizePlayerCard } from "./playercard";
import { normalizePlayerPool } from "./pool";
import { normalizeProSchedule } from "./schedule";

const TTL = { game: 3600, proTeams: 86400, settings: 120, roster: 60, matchups: 45, freeAgents: 300, fan: 600, activity: 60, players: 600, card: 300, news: 600 };

/** Headers espn.com sends with filtered player lookups (captured). */
const KONA_HEADERS = { "X-Fantasy-Platform": "espn-fantasy-web", "X-Fantasy-Source": "kona" };

/**
 * League message feed filter, as espn.com's Recent Activity page sends it
 * (captured). The excluded ids are ones espn.com itself hides.
 */
function communicationFilter(now: number) {
  return {
    topics: {
      filterDateRange: { value: now - 90 * 86_400_000, additionalValue: now },
      filterExcludeMessageTypeIds: { value: [106, 202, 232, 184, 183, 229, 228, 227, 230, 231, 286] },
      filterType: { value: ["ACTIVITY_SETTINGS", "ACTIVITY_STATUS"] },
      limit: 100,
      limitPerMessageSet: { value: 25 },
      offset: 0,
      sortMessageDate: { sortPriority: 1, sortAsc: false },
      sortFor: { sortPriority: 2, sortAsc: false },
    },
  };
}

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

async function getProTeamsRaw(season: number): Promise<EspnProTeamsResponse> {
  return cached(`espn:proTeamsRaw:${season}`, TTL.proTeams, () =>
    espnFetch<EspnProTeamsResponse>(`${ESPN_READS}/seasons/${season}?view=proTeamSchedules_wl`, { cookies: null }),
  );
}

async function getProTeams(season: number): Promise<ProTeamMap> {
  return normalizeProTeams(await getProTeamsRaw(season));
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

async function getMatchupsRaw(conn: AdapterConnection, season: number, leagueId: string) {
  return cached(`espn:${cacheScope(conn)}:matchups:${season}:${leagueId}`, TTL.matchups, () =>
    espnFetch<EspnMatchupsResponse>(leagueEndpoint(season, leagueId, ["mMatchup", "mMatchupScore"]), fetchOpts(conn)),
  );
}

async function getTransactionsRaw(conn: AdapterConnection, season: number, leagueId: string) {
  return cached(`espn:${cacheScope(conn)}:activity:${season}:${leagueId}`, TTL.activity, () =>
    espnFetch<EspnTransactionsResponse>(leagueEndpoint(season, leagueId, ["mTransactions2"]), fetchOpts(conn)),
  );
}

/** Players by id (filterIds without a limit: ESPN rejects a limit that has no sort). */
async function playersById(conn: AdapterConnection, settings: EspnLeagueSettingsResponse, leagueId: string, ids: number[]) {
  const season = settings.seasonId;
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const extra: Record<string, string> = settings.scoringPeriodId ? { scoringPeriodId: String(settings.scoringPeriodId) } : {};
  const pool = await cached(`espn:${cacheScope(conn)}:players:${season}:${leagueId}:${sorted.join(",")}`, TTL.players, () =>
    espnFetch<EspnFreeAgentsResponse>(leagueEndpoint(season, leagueId, ["kona_player_info"], extra), {
      ...fetchOpts(conn),
      headers: { ...KONA_HEADERS, "X-Fantasy-Filter": JSON.stringify({ players: { filterIds: { value: sorted } } }) },
    }),
  );
  return pool.players;
}

function context(conn: AdapterConnection, leagueId: string): LeagueContext {
  return {
    leagueId,
    connectionId: conn.id,
    swid: cookiesOf(conn)?.swid,
    myTeamExternalId: conn.myTeamByLeague?.[leagueId],
  };
}

// ---------------------------------------------------------------------------
// Write helpers. Every write re-reads league state fresh and re-checks it.
// ---------------------------------------------------------------------------

async function writeContext(conn: AdapterConnection, leagueId: string, teamId: string) {
  const cookies = cookiesOf(conn);
  if (!cookies) throw new PlatformError("espn", 403, "Connect your ESPN account to make moves");
  invalidate(`espn:${cacheScope(conn)}:`);
  const settings = await getSettings(conn, leagueId);
  const mine = normalizeTeams(settings, context(conn, leagueId)).find((t) => t.isMine);
  if (!mine || mine.externalId !== teamId) throw new PlatformError("espn", 403, "You can only make moves for your own team");
  return { cookies, settings };
}

async function rosterPlayerIds(conn: AdapterConnection, season: number, leagueId: string, teamId: number): Promise<Set<number>> {
  const raw = await cached(`espn:${cacheScope(conn)}:roster:${season}:${leagueId}`, TTL.roster, () =>
    espnFetch<EspnRosterResponse>(leagueEndpoint(season, leagueId, ["mRoster"]), fetchOpts(conn)),
  );
  const team = raw.teams?.find((t) => t.id === teamId);
  return new Set((team?.roster.entries ?? []).map((e) => e.playerId));
}

async function lookupPlayers(conn: AdapterConnection, settings: EspnLeagueSettingsResponse, leagueId: string, ids: number[]) {
  const extra: Record<string, string> = settings.scoringPeriodId ? { scoringPeriodId: String(settings.scoringPeriodId) } : {};
  const res = await espnFetch<EspnFreeAgentsResponse>(leagueEndpoint(settings.seasonId, leagueId, ["kona_player_info"], extra), {
    ...fetchOpts(conn),
    headers: { ...KONA_HEADERS, "X-Fantasy-Filter": JSON.stringify({ players: { filterIds: { value: ids } } }) },
  });
  return res.players;
}

async function postTransaction(conn: AdapterConnection, cookies: EspnCookies, season: number, leagueId: string, body: unknown) {
  const res = await espnPost<EspnTransactionResponse>(transactionsUrl(season, leagueId), body, { cookies, connectionId: conn.id });
  invalidate(`espn:${cacheScope(conn)}:`);
  return res;
}

export const espnAdapter: PlatformAdapter = {
  platform: "espn",
  capabilities: { freeAgents: true, setLineup: true, addDrop: true, trades: true },

  /** Validates pasted espn_s2 / SWID cookies by loading the ESPN fan profile. */
  async connect(_userId, input): Promise<ConnectResult> {
    const cookies = parseEspnCookies(input);
    if (!cookies) throw new PlatformError("espn", 400, "Those don't look like valid espn_s2 and SWID values");

    let fan: EspnFanProfile;
    try {
      fan = await espnFetch<EspnFanProfile>(fanEndpoint(cookies.swid), { cookies });
    } catch (err) {
      // ESPN answers an unknown/invalid SWID with 404 rather than 401.
      if (err instanceof PlatformError && (err.status === 401 || err.status === 403 || err.status === 404)) {
        throw new PlatformError("espn", 401, "ESPN rejected these cookies");
      }
      throw err;
    }
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
    const proRaw = await getProTeamsRaw(settings.seasonId);
    return { team, slots: normalizeRoster(settings, roster, teamId, proTeams, { schedule: normalizeProSchedule(proRaw), now: Date.now() }) };
  },

  async getMatchups(conn, leagueId, period) {
    const season = await getSeason();
    const [raw, pro, settings] = await Promise.all([getMatchupsRaw(conn, season, leagueId), getProTeamsRaw(season), getSettings(conn, leagueId)]);
    const firstTip = Math.min(...pro.settings.proTeams.flatMap((t) => Object.values(t.proGamesByScoringPeriod ?? {}).flat().map((g) => g.date)));
    const format = mapScoringType(settings.settings.scoringSettings.scoringType);
    const categories = format === "h2h-categories" || format === "roto" ? new Set(settings.settings.scoringSettings.scoringItems.map((i) => i.statId)) : undefined;
    return normalizeMatchups(raw, Number(leagueId), period, Date.now() >= firstTip, categories);
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
    return entries.slice(0, query.limit ?? 50).map((e) => ({
      ...normalizePlayer(e.player, proTeams),
      availability: e.status === "WAIVERS" ? ("waivers" as const) : ("free_agent" as const),
      waiverClearsAt: e.waiverProcessDate ? new Date(e.waiverProcessDate).toISOString() : undefined,
    }));
  },

  /** Top 300 players by % rostered: free agents, waivers and rostered (statuses verified). */
  async getPlayerPool(conn, leagueId) {
    const settings = await getSettings(conn, leagueId);
    const season = settings.seasonId;
    const extra: Record<string, string> = settings.scoringPeriodId ? { scoringPeriodId: String(settings.scoringPeriodId) } : {};
    const filter = {
      players: {
        filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
        limit: 300,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
      },
    };
    const [raw, proRaw] = await Promise.all([
      cached(`espn:${cacheScope(conn)}:pool:${season}:${leagueId}`, TTL.freeAgents, () =>
        espnFetch<EspnFreeAgentsResponse>(leagueEndpoint(season, leagueId, ["kona_player_info"], extra), {
          ...fetchOpts(conn),
          headers: { ...KONA_HEADERS, "X-Fantasy-Filter": JSON.stringify(filter) },
        }),
      ),
      getProTeamsRaw(season),
    ]);
    return normalizePlayerPool(raw.players, leagueId, normalizeProTeams(proRaw), normalizeProSchedule(proRaw), Date.now());
  },

  /** League activity from mTransactions2, with player names resolved by id. */
  async getActivity(conn, leagueId) {
    const settings = await getSettings(conn, leagueId);
    const season = settings.seasonId;
    const scope = cacheScope(conn);
    const [raw, comm] = await Promise.all([
      getTransactionsRaw(conn, season, leagueId),
      // League messages are extra detail; the feed still works without them.
      cached(`espn:${scope}:communication:${season}:${leagueId}`, TTL.activity, () =>
        espnFetch<EspnCommunicationResponse>(communicationEndpoint(season, leagueId), {
          ...fetchOpts(conn),
          headers: { ...KONA_HEADERS, "X-Fantasy-Filter": JSON.stringify(communicationFilter(Date.now())) },
        }),
      ).catch((): EspnCommunicationResponse => ({ topics: [] })),
    ]);

    const [proTeams, entries] = await Promise.all([
      getProTeams(season),
      playersById(conn, settings, leagueId, [...activityPlayerIds(raw), ...communicationPlayerIds(comm)]),
    ]);
    const players = new Map(entries.map((e) => [e.player.id, normalizePlayer(e.player, proTeams)]));
    const teams = normalizeTeams(settings, context(conn, leagueId));
    const mine = teams.find((t) => t.isMine);
    const result = normalizeActivity(raw, leagueId, players, mine?.externalId);
    const teamName = (id: number) => teams.find((t) => t.externalId === String(id))?.name ?? `Team ${id}`;
    const messages = normalizeCommunication(comm, leagueId, players, teamName);
    return { ...result, feed: [...result.feed, ...messages].sort((a, b) => b.date.localeCompare(a.date)) };
  },

  async getPlayerDetail(conn, leagueId, playerId) {
    if (!/^\d+$/.test(playerId)) return null;
    const settings = await getSettings(conn, leagueId);
    const season = settings.seasonId;
    const scope = cacheScope(conn);
    // Same filter espn.com's player card sends (captured): 82 most recent games plus season/split lines.
    const spans = [`00${season}`, `10${season}`, `00${season - 1}`, `01${season}`, `02${season}`, `03${season}`, `04${season}`];
    const filter = { players: { filterIds: { value: [Number(playerId)] }, filterStatsForTopScoringPeriodIds: { value: 82, additionalValue: spans } } };
    const [card, news, pro, proPrev] = await Promise.all([
      cached(`espn:${scope}:card:${season}:${leagueId}:${playerId}`, TTL.card, () =>
        espnFetch<EspnPlayerCardResponse>(leagueEndpoint(season, leagueId, ["kona_playercard"], { scoringPeriodId: String(settings.scoringPeriodId || 1) }), {
          ...fetchOpts(conn),
          headers: { ...KONA_HEADERS, "X-Fantasy-Filter": JSON.stringify(filter) },
        }),
      ),
      // News is a nice-to-have; the page works without it.
      cached(`espn:news:${playerId}`, TTL.news, () =>
        espnFetch<EspnNewsResponse>(`https://site.api.espn.com/apis/fantasy/v3/games/fba/news/players?days=30&playerId=${playerId}`, { cookies: null }),
      ).catch(() => null),
      getProTeamsRaw(season),
      getProTeamsRaw(season - 1).catch(() => null),
    ]);
    const games = new Map([[season, gamesById(pro)]]);
    if (proPrev) games.set(season - 1, gamesById(proPrev));
    return normalizePlayerCard(card, news, leagueId, normalizeProTeams(pro), normalizeProSchedule(pro), games, Date.now());
  },

  async getLeagueOverview(conn, leagueId) {
    const settings = await getSettings(conn, leagueId);
    const season = settings.seasonId;
    const [matchups, txns, proRaw] = await Promise.all([
      getMatchupsRaw(conn, season, leagueId),
      getTransactionsRaw(conn, season, leagueId),
      getProTeamsRaw(season),
    ]);
    const proTeams = normalizeProTeams(proRaw);
    const entries = await playersById(conn, settings, leagueId, [...draftPlayerIds(txns), ...tradeBlockPlayerIds(settings)]);
    const players = new Map(entries.map((e) => [e.player.id, normalizePlayer(e.player, proTeams)]));
    return normalizeOverview(settings, matchups, txns, proRaw, players, Date.now());
  },

  /** Add a player (claim if on waivers, else instant pickup), optionally dropping one. */
  async addDrop(conn, leagueId, teamId, opts) {
    const { cookies, settings } = await writeContext(conn, leagueId, teamId);
    const addId = Number(opts.addPlayerId);
    const dropId = opts.dropPlayerId ? Number(opts.dropPlayerId) : undefined;

    const entry = (await lookupPlayers(conn, settings, leagueId, [addId])).find((e) => e.player.id === addId);
    if (!entry) throw new PlatformError("espn", 404, "Couldn't find that player on ESPN");
    if (entry.onTeamId) throw new PlatformError("espn", 409, `${entry.player.fullName} is already on a team`);
    if (dropId && !(await rosterPlayerIds(conn, settings.seasonId, leagueId, Number(teamId))).has(dropId)) {
      throw new PlatformError("espn", 409, "The player you chose to drop isn't on your roster anymore");
    }

    const body = buildAddDrop({
      type: entry.status === "WAIVERS" ? "WAIVER" : "FREEAGENT",
      teamId: Number(teamId),
      memberId: cookies.swid,
      scoringPeriodId: settings.scoringPeriodId,
      addPlayerId: addId,
      dropPlayerId: dropId,
    });
    const res = await postTransaction(conn, cookies, settings.seasonId, leagueId, body);
    if (res.status === "PENDING") return { status: "pending" };
    if (res.status === "EXECUTED") return { status: "completed" };
    throw new PlatformError("espn", 409, `ESPN didn't accept the move (status: ${res.status ?? "unknown"})`);
  },

  /** Offer a trade to another team. */
  async proposeTrade(conn, leagueId, teamId, proposal) {
    const { cookies, settings } = await writeContext(conn, leagueId, teamId);
    const me = Number(teamId);
    const other = Number(proposal.toTeamId);
    if (!settings.teams.some((t) => t.id === other) || other === me) throw new PlatformError("espn", 400, "Pick another team in this league");
    const send = proposal.sendPlayerIds.map(Number);
    const receive = proposal.receivePlayerIds.map(Number);
    if (!send.length || !receive.length) throw new PlatformError("espn", 400, "Pick at least one player on each side");

    const [mine, theirs] = await Promise.all([
      rosterPlayerIds(conn, settings.seasonId, leagueId, me),
      rosterPlayerIds(conn, settings.seasonId, leagueId, other),
    ]);
    if (!send.every((p) => mine.has(p))) throw new PlatformError("espn", 409, "One of your players isn't on your roster anymore");
    if (!receive.every((p) => theirs.has(p))) throw new PlatformError("espn", 409, "One of their players isn't on their roster anymore");

    const days = Math.min(7, Math.max(1, proposal.expiresInDays ?? 2));
    const body = buildTradeProposal({
      teamId: me,
      memberId: cookies.swid,
      scoringPeriodId: settings.scoringPeriodId,
      otherTeamId: other,
      sendPlayerIds: send,
      receivePlayerIds: receive,
      expirationDate: new Date(Date.now() + days * 86_400_000).toISOString(),
      comment: proposal.message?.slice(0, 500),
    });
    const res = await postTransaction(conn, cookies, settings.seasonId, leagueId, body);
    if (res.status !== "PENDING") throw new PlatformError("espn", 409, `ESPN didn't accept the offer (status: ${res.status ?? "unknown"})`);
    return { status: "pending" };
  },

  /** Cancel your own still-open waiver claim or trade offer. */
  async cancelPending(conn, leagueId, teamId, transactionId) {
    const { cookies, settings } = await writeContext(conn, leagueId, teamId);
    const raw = await espnFetch<EspnTransactionsResponse>(leagueEndpoint(settings.seasonId, leagueId, ["mTransactions2"]), fetchOpts(conn));
    const txns = raw.transactions ?? [];
    const t = txns.find((x) => x.id === transactionId);
    const cancellable =
      t && t.teamId === Number(teamId) && t.status === "PENDING" && !closedIds(txns).has(t.id) && (t.type === "WAIVER" || t.type === "TRADE_PROPOSAL");
    if (!cancellable) throw new PlatformError("espn", 409, "That move isn't open anymore");

    const body = buildCancel({
      type: t.type as "WAIVER" | "TRADE_PROPOSAL",
      teamId: Number(teamId),
      memberId: cookies.swid,
      scoringPeriodId: settings.scoringPeriodId,
      relatedTransactionId: t.id,
    });
    const res = await postTransaction(conn, cookies, settings.seasonId, leagueId, body);
    if (res.status !== "CANCELED") throw new PlatformError("espn", 409, `ESPN didn't cancel it (status: ${res.status ?? "unknown"})`);
  },

  async respondToTrade(conn, leagueId, teamId, transactionId, accept) {
    const { cookies, settings } = await writeContext(conn, leagueId, teamId);
    const raw = await espnFetch<EspnTransactionsResponse>(leagueEndpoint(settings.seasonId, leagueId, ["mTransactions2"]), fetchOpts(conn));
    const txns = raw.transactions ?? [];
    const t = txns.find((x) => x.id === transactionId);
    const toMe = t?.items?.some((i) => i.type === "TRADE" && (i.toTeamId === Number(teamId) || i.fromTeamId === Number(teamId)));
    const open = t && t.type === "TRADE_PROPOSAL" && t.status === "PENDING" && t.teamId !== Number(teamId) && toMe && !closedIds(txns).has(t.id);
    // closedIds counts accepts too, so an offer you already accepted can't be answered twice.
    if (!open) throw new PlatformError("espn", 409, "That offer isn't open anymore");

    const body = buildTradeResponse({ accept, teamId: Number(teamId), memberId: cookies.swid, scoringPeriodId: settings.scoringPeriodId, relatedTransactionId: t.id });
    const res = await postTransaction(conn, cookies, settings.seasonId, leagueId, body);
    // Captured replies: decline has status EXECUTED, accept has no status (then league review).
    if (res.status && res.status !== "EXECUTED" && res.status !== "PENDING") {
      throw new PlatformError("espn", 409, `ESPN didn't record your answer (status: ${res.status})`);
    }
  },

  /** Lineup moves, using the request format captured from espn.com (fixtures/espn/writes). */
  async setLineup(conn, leagueId, teamId, changes: LineupChange[], period?: number) {
    const cookies = cookiesOf(conn);
    if (!cookies) throw new PlatformError("espn", 403, "Connect your ESPN account to edit lineups");
    // Fresh settings: the scoring period (day) and ownership must be current.
    invalidate(`espn:${cacheScope(conn)}:settings:`);
    const settings = await getSettings(conn, leagueId);
    const mine = normalizeTeams(settings, context(conn, leagueId)).find((t) => t.isMine);
    if (!mine || mine.externalId !== teamId) throw new PlatformError("espn", 403, "You can only edit your own team");

    const body = buildLineupTransaction({
      teamId: Number(teamId),
      memberId: cookies.swid,
      scoringPeriodId: period ?? settings.scoringPeriodId,
      changes,
    });
    const res = await espnPost<EspnTransactionResponse>(transactionsUrl(settings.seasonId, leagueId), body, {
      cookies,
      connectionId: conn.id,
    });
    invalidate(`espn:${cacheScope(conn)}:`);
    if (res.status && res.status !== "EXECUTED") {
      throw new PlatformError("espn", 409, `ESPN didn't apply the move (status: ${res.status})`);
    }
  },
};
