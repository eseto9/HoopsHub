import { planMove } from "@/lib/lineup";
import type { League, LeagueActivity, Player, PlayerListing, RosterSlot, Team } from "@/lib/schema";

/**
 * Cross-league views (My Teams hub). Pure functions over the unified schema,
 * so ESPN and Sleeper leagues mix freely.
 */

export const BENCH = new Set(["BN", "IR", "TAXI"]);
export const isStarterSlot = (slot: string) => !BENCH.has(slot);
const OUT = new Set(["OUT", "IR", "SUSP"]);

/** The same NBA player across platforms: name without accents or suffixes. */
export function nameKey(name: string | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z]/g, "");
}

/** A player's per-game fantasy value: this season, else projection, else last season. */
export function playerValue(p: Player | null | undefined): number {
  const s = p?.stats;
  const line = s?.current ?? s?.projected ?? s?.previous;
  return line?.fantasyPointsPerGame ?? line?.perGame.pts ?? 0;
}

export interface LeagueRoster {
  league: Pick<League, "id" | "name" | "platform" | "externalId">;
  slots: RosterSlot[];
}

// ---------------------------------------------------------------------------
// Lineup Check
// ---------------------------------------------------------------------------

export type LineupIssueKind = "empty" | "out" | "no_game";

export interface LineupIssue {
  kind: LineupIssueKind;
  /** Index into the roster's slots. */
  slotIndex: number;
  slot: string;
  player: Player | null;
  /** Best bench player who can take the slot, if any. */
  fix?: { from: number; player: Player };
}

/**
 * Starters who are out, have no game today, or empty slots, each with the
 * best eligible bench player (healthy, playing today when schedules exist).
 * "No game today" only counts when a bench player who plays could take the
 * spot, so off days (no NBA games) don't flood the list. Undrafted rosters
 * (no players at all) have no issues. Uses the roster editor's move rules.
 */
export function lineupIssues(slots: RosterSlot[]): LineupIssue[] {
  if (!slots.some((s) => s.player)) return [];
  const hasSchedule = slots.some((s) => s.player?.schedule);
  const plays = (p: Player | null) => !hasSchedule || !!p?.schedule?.today;
  const used = new Set<number>();
  const issues: LineupIssue[] = [];
  slots.forEach((s, i) => {
    if (!isStarterSlot(s.slot)) return;
    let kind: LineupIssueKind | null = null;
    if (!s.player) kind = "empty";
    else if (s.player.injuryStatus && OUT.has(s.player.injuryStatus)) kind = "out";
    else if (hasSchedule && !s.player.schedule?.today) kind = "no_game";
    if (!kind) return;
    const candidates = slots
      .map((b, j) => ({ b, j }))
      .filter(({ b, j }) => b.slot === "BN" && b.player && !used.has(j) && plays(b.player) && !(b.player.injuryStatus && OUT.has(b.player.injuryStatus)))
      .filter(({ j }) => planMove(slots, j, i).ok)
      .sort((x, y) => playerValue(y.b.player) - playerValue(x.b.player));
    const best = candidates[0];
    if (kind === "no_game" && !best) return;
    if (best) used.add(best.j);
    issues.push({ kind, slotIndex: i, slot: s.slot, player: s.player, fix: best ? { from: best.j, player: best.b.player! } : undefined });
  });
  return issues;
}

// ---------------------------------------------------------------------------
// Tonight's Slate
// ---------------------------------------------------------------------------

export interface SlateGame {
  key: string;
  date: string;
  home: string;
  away: string;
  players: { player: Player; league: LeagueRoster["league"]; slot: string; starter: boolean }[];
}

/** Today's NBA games that involve at least one of your players, by tip-off. */
export function slate(rosters: LeagueRoster[]): SlateGame[] {
  const games = new Map<string, SlateGame>();
  for (const r of rosters) {
    for (const s of r.slots) {
      const p = s.player;
      const g = p?.schedule?.today;
      if (!p || !g || !p.nbaTeam) continue;
      const home = g.home ? p.nbaTeam : g.opponent;
      const away = g.home ? g.opponent : p.nbaTeam;
      const key = `${g.date}|${away}@${home}`;
      const game = games.get(key) ?? { key, date: g.date, home, away, players: [] };
      game.players.push({ player: p, league: r.league, slot: s.slot, starter: isStarterSlot(s.slot) });
      games.set(key, game);
    }
  }
  for (const g of games.values()) g.players.sort((a, b) => Number(b.starter) - Number(a.starter) || playerValue(b.player) - playerValue(a.player));
  return [...games.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Matchups
// ---------------------------------------------------------------------------

/** NBA games left this week for a lineup's starters (a rough "games edge"). */
export function startersGamesLeft(slots: RosterSlot[]): number | undefined {
  if (!slots.some((s) => s.player?.schedule)) return undefined;
  return slots.filter((s) => isStarterSlot(s.slot) && s.player).reduce((n, s) => n + (s.player!.schedule?.gamesThisWeek ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

export interface Exposure {
  key: string;
  player: Player;
  leagues: { league: LeagueRoster["league"]; slot: string }[];
  /** Per-game fantasy value summed over every league you roster him in. */
  totalValue: number;
}

/** Every player you roster, with how many of your leagues he's in. */
export function exposure(rosters: LeagueRoster[]): Exposure[] {
  const byKey = new Map<string, Exposure>();
  for (const r of rosters) {
    for (const s of r.slots) {
      if (!s.player) continue;
      const key = nameKey(s.player.name);
      const e = byKey.get(key) ?? { key, player: s.player, leagues: [], totalValue: 0 };
      e.leagues.push({ league: r.league, slot: s.slot });
      e.totalValue += playerValue(s.player);
      // Prefer the copy with the most information (stats and schedule).
      if (!e.player.stats && s.player.stats) e.player = s.player;
      byKey.set(key, e);
    }
  }
  return [...byKey.values()].sort((a, b) => b.leagues.length - a.leagues.length || b.totalValue - a.totalValue);
}

// ---------------------------------------------------------------------------
// Waiver Radar
// ---------------------------------------------------------------------------

export interface WaiverLeague {
  league: LeagueRoster["league"];
  pool: PlayerListing[];
}

export interface WaiverPick {
  listing: PlayerListing;
  /** How many of your leagues have this player available. */
  openIn: number;
}

/** The best available players per league, and how widely each is available. */
export function waiverRadar(leagues: WaiverLeague[], perLeague = 8): { league: WaiverLeague["league"]; picks: WaiverPick[] }[] {
  const openCount = new Map<string, number>();
  for (const l of leagues) {
    const seen = new Set<string>();
    for (const x of l.pool) {
      if (x.status === "rostered" || !x.player.nbaTeam) continue;
      const k = nameKey(x.player.name);
      if (seen.has(k)) continue;
      seen.add(k);
      openCount.set(k, (openCount.get(k) ?? 0) + 1);
    }
  }
  return leagues.map((l) => ({
    league: l.league,
    picks: l.pool
      // Unsigned players (no NBA team) and injured-out players aren't useful pickups.
      .filter((x) => x.status !== "rostered" && x.player.nbaTeam && !(x.player.injuryStatus && OUT.has(x.player.injuryStatus)))
      .sort((a, b) => playerValue(b.player) - playerValue(a.player))
      .slice(0, perLeague)
      .map((listing) => ({ listing, openIn: openCount.get(nameKey(listing.player.name)) ?? 1 })),
  }));
}

// ---------------------------------------------------------------------------
// Combined activity
// ---------------------------------------------------------------------------

export interface TaggedActivity {
  activity: LeagueActivity;
  league: LeagueRoster["league"];
  teams: Pick<Team, "id" | "name" | "isMine">[];
  /** Involves your team, or a player you roster somewhere. */
  mine: boolean;
}

export function combinedActivity(
  feeds: { league: LeagueRoster["league"]; teams: Pick<Team, "id" | "name" | "isMine">[]; feed: LeagueActivity[] }[],
  myPlayerKeys: Set<string>,
): TaggedActivity[] {
  return feeds
    .flatMap((f) =>
      f.feed
        .filter((a) => a.kind !== "lineup")
        .map((a) => ({
          activity: a,
          league: f.league,
          teams: f.teams,
          mine: a.teamIds.some((id) => f.teams.find((t) => t.id === id)?.isMine) || a.moves.some((m) => m.player && myPlayerKeys.has(nameKey(m.player.name))),
        })),
    )
    .sort((a, b) => b.activity.date.localeCompare(a.activity.date));
}
