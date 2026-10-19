import "server-only";
import { cached } from "@/lib/cache";
import { NotFoundError, PlatformError } from "@/lib/errors";
import { acquire } from "@/lib/rate-limit";
import { unifiedId, type PlayerListing } from "@/lib/schema";
import type { AdapterConnection, ConnectResult, PlatformAdapter } from "../types";
import {
  myRoster,
  normalizeLeague,
  normalizeMatchups,
  normalizeOverview,
  normalizePlayer,
  normalizeRoster,
  normalizeStandings,
  normalizeTeams,
  normalizeTransactions,
  type StatsContext,
} from "./normalize";
import type {
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
  SleeperStatMap,
  SleeperState,
  SleeperTransaction,
  SleeperUser,
} from "./raw-types";

/**
 * Sleeper, read-only. The API (api.sleeper.app/v1) is public and has no write
 * endpoints, so lineups and moves stay in the Sleeper app. Connecting needs
 * only a username; there are no credentials to store.
 */

const BASE = "https://api.sleeper.app/v1";
const TTL = { state: 300, user: 600, league: 120, rosters: 60, matchups: 45, txns: 60, players: 86400, stats: 21600, draft: 3600 };

async function get<T>(path: string): Promise<T> {
  await acquire("sleeper");
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404) throw new NotFoundError(`Sleeper: ${path} not found`);
  if (!res.ok) throw new PlatformError("sleeper", res.status, `Sleeper returned ${res.status}`);
  return (await res.json()) as T;
}

const state = () => cached("sleeper:state", TTL.state, () => get<SleeperState>("/state/nba"));
const league = (id: string) => cached(`sleeper:league:${id}`, TTL.league, () => get<SleeperLeague>(`/league/${id}`));
const users = (id: string) => cached(`sleeper:users:${id}`, TTL.league, () => get<SleeperLeagueUser[]>(`/league/${id}/users`));
const rosters = (id: string) => cached(`sleeper:rosters:${id}`, TTL.rosters, () => get<SleeperRoster[]>(`/league/${id}/rosters`));
/** The full NBA player map (several MB): fetched at most once a day per server. */
const players = () => cached("sleeper:players", TTL.players, () => get<Record<string, SleeperPlayer>>("/players/nba"));
/** Undocumented stat endpoints (see raw-types); missing data just means no stats shown. */
const statMap = (path: string) => cached(`sleeper:stats:${path}`, TTL.stats, () => get<SleeperStatMap>(path).catch(() => ({}) as SleeperStatMap));

async function statsContext(l: SleeperLeague): Promise<StatsContext> {
  const season = Number(l.season);
  const [current, previous, projections] = await Promise.all([
    statMap(`/stats/nba/regular/${season}`),
    statMap(`/stats/nba/regular/${season - 1}`),
    statMap(`/projections/nba/regular/${season}`),
  ]);
  return { season, current, previous, projections, scoring: l.scoring_settings };
}

const userId = (conn: AdapterConnection) => conn.externalUserId || undefined;

export const sleeperAdapter: PlatformAdapter = {
  platform: "sleeper",
  capabilities: { freeAgents: true, setLineup: false, addDrop: false, trades: false },

  /** Input: { username }. Sleeper user lookups are public. */
  async connect(_userId, input): Promise<ConnectResult> {
    const username = (input.username ?? "").trim();
    if (!/^[A-Za-z0-9_]{2,40}$/.test(username)) throw new PlatformError("sleeper", 400, "Enter your Sleeper username");
    const user = await get<SleeperUser | null>(`/user/${encodeURIComponent(username)}`).catch(() => null);
    if (!user?.user_id) throw new PlatformError("sleeper", 404, `No Sleeper user named "${username}"`);
    return { externalUserId: user.user_id, displayName: user.display_name || username, credentials: null };
  },

  async listLeagues(conn) {
    const s = await state();
    const leagues = await cached(`sleeper:leagues:${conn.externalUserId}:${s.season}`, TTL.user, () =>
      get<SleeperLeague[]>(`/user/${conn.externalUserId}/leagues/nba/${s.season}`),
    );
    return Promise.all(
      (leagues ?? []).map(async (l) => normalizeLeague(l, conn.id, myRoster(await rosters(l.league_id), userId(conn)))),
    );
  },

  async getLeague(conn, leagueId) {
    const [l, r] = await Promise.all([league(leagueId), rosters(leagueId)]);
    return normalizeLeague(l, conn.id, myRoster(r, userId(conn)));
  },

  async getTeams(conn, leagueId) {
    const [u, r] = await Promise.all([users(leagueId), rosters(leagueId)]);
    return normalizeTeams(leagueId, u, r, userId(conn));
  },

  async getRoster(conn, leagueId, teamId) {
    const [l, u, r, p] = await Promise.all([league(leagueId), users(leagueId), rosters(leagueId), players()]);
    const roster = r.find((x) => String(x.roster_id) === teamId);
    if (!roster) throw new NotFoundError("Team not found");
    const team = normalizeTeams(leagueId, u, r, userId(conn)).find((t) => t.externalId === teamId)!;
    return { team, slots: normalizeRoster(l, roster, p, await statsContext(l)) };
  },

  async getMatchups(_conn, leagueId, period) {
    const s = await state();
    const week = period ?? s.week;
    const raw = await cached(`sleeper:matchups:${leagueId}:${week}`, TTL.matchups, () => get<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`));
    return normalizeMatchups(leagueId, raw ?? [], week, s, Date.now());
  },

  async getStandings(_conn, leagueId) {
    const [l, r] = await Promise.all([league(leagueId), rosters(leagueId)]);
    return normalizeStandings(l, r);
  },

  async getFreeAgents(_conn, leagueId, query = {}) {
    const [l, r, p] = await Promise.all([league(leagueId), rosters(leagueId), players()]);
    const taken = new Set(r.flatMap((x) => x.players ?? []));
    const ctx = await statsContext(l);
    return Object.values(p)
      .filter((x) => x.active && x.team && !taken.has(x.player_id))
      .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))
      .slice(0, query.limit ?? 50)
      .map((x) => normalizePlayer(x, ctx));
  },

  /** Every rostered player plus the top unrostered ones by Sleeper's rank. */
  async getPlayerPool(_conn, leagueId): Promise<PlayerListing[]> {
    const [l, r, p] = await Promise.all([league(leagueId), rosters(leagueId), players()]);
    const ctx = await statsContext(l);
    const owner = new Map<string, number>();
    for (const x of r) for (const id of x.players ?? []) owner.set(id, x.roster_id);
    const free = Object.values(p)
      .filter((x) => x.active && x.team && !owner.has(x.player_id))
      .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))
      .slice(0, 300);
    const rostered = [...owner.keys()].map((id) => p[id]).filter((x): x is SleeperPlayer => !!x);
    return [...rostered, ...free].map((x) => ({
      player: normalizePlayer(x, ctx),
      status: owner.has(x.player_id) ? ("rostered" as const) : ("free_agent" as const),
      fantasyTeamId: owner.has(x.player_id) ? unifiedId("sleeper", `${leagueId}.${owner.get(x.player_id)}`) : null,
      // Sleeper has no ownership % or NBA schedule here.
      gamesThisWeek: 0,
      today: null,
    }));
  },

  /** Transactions are per week; this season's weeks so far. */
  async getActivity(_conn, leagueId) {
    const [s, p, u, r] = await Promise.all([state(), players(), users(leagueId), rosters(leagueId)]);
    const weeks = Array.from({ length: Math.max(1, s.week) }, (_, i) => i + 1);
    const lists = await Promise.all(
      weeks.map((w) => cached(`sleeper:txns:${leagueId}:${w}`, TTL.txns, () => get<SleeperTransaction[]>(`/league/${leagueId}/transactions/${w}`).catch(() => []))),
    );
    const names = new Map(normalizeTeams(leagueId, u, r).map((t) => [Number(t.externalId), t.name]));
    return { feed: normalizeTransactions(leagueId, lists.flat(), p, (id) => names.get(id) ?? `Team ${id}`), pendingForTeam: [] };
  },

  async getLeagueOverview(_conn, leagueId) {
    const [l, r, p, s] = await Promise.all([league(leagueId), rosters(leagueId), players(), state()]);
    const picks = l.draft_id
      ? await cached(`sleeper:draft:${l.draft_id}`, TTL.draft, () => get<SleeperDraftPick[]>(`/draft/${l.draft_id}/picks`).catch(() => []))
      : [];
    return normalizeOverview(l, r, picks, p, s.week);
  },
};
