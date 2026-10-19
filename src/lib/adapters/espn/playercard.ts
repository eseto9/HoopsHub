import type { GameInfo, GameLogEntry, NewsItem, PlayerDetail, StatLine } from "@/lib/schema";
import { statInfo } from "./constants";
import { STAT_KEYS, statLine, type ProTeamMap } from "./normalize";
import { normalizePlayerPool } from "./pool";
import type { EspnNewsResponse, EspnPlayerCardResponse, EspnProTeamsResponse, EspnStatEntry } from "./raw-types";
import { etDay, type ProSchedule } from "./schedule";

/**
 * Player page from kona_playercard (verified in
 * fixtures/espn/league-1151450222/playercard.json):
 * - split 0: season lines (actual source 0, projected source 1), as on Players.
 * - splits 1/2/3: last 7/15/30 days of the current season (empty pre-season;
 *   meaning from the espn-api library, as with stat ids).
 * - split 5: one entry per game, externalId = NBA game id; dates and
 *   opponents come from that season's pro schedule.
 * News is ESPN's public fantasy news feed (fixtures/espn/player-news.json).
 */

const SPLIT_LABEL: Record<number, string> = { 1: "Last 7 days", 2: "Last 15 days", 3: "Last 30 days" };

/** NBA game id -> date and teams, from a season's proTeamSchedules_wl. */
export function gamesById(raw: EspnProTeamsResponse): Map<string, { date: number; home: number; away: number }> {
  const out = new Map<string, { date: number; home: number; away: number }>();
  for (const t of raw.settings.proTeams)
    for (const games of Object.values(t.proGamesByScoringPeriod ?? {}))
      for (const g of games) if (g.id) out.set(String(g.id), { date: g.date, home: g.homeProTeamId, away: g.awayProTeamId });
  return out;
}

function gameLine(e: EspnStatEntry): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of STAT_KEYS) {
    const v = e.stats?.[String(id)];
    if (typeof v === "number") out[statInfo(id).key] = v;
  }
  return out;
}

export function normalizePlayerCard(
  raw: EspnPlayerCardResponse,
  news: EspnNewsResponse | null,
  leagueId: string,
  proTeams: ProTeamMap,
  schedule: ProSchedule,
  /** Pro schedules by season, to place game-log entries. */
  seasonGames: Map<number, Map<string, { date: number; home: number; away: number }>>,
  now: number,
): PlayerDetail | null {
  const entry = raw.players[0];
  if (!entry) return null;
  const listing = normalizePlayerPool([entry], leagueId, proTeams, schedule, now)[0];
  const stats = entry.player.stats ?? [];
  const season = Math.max(0, ...stats.map((s) => s.seasonId));

  const splits: StatLine[] = [];
  for (const split of [1, 2, 3]) {
    const line = statLine(
      stats.find((s) => s.statSourceId === 0 && s.statSplitTypeId === split && s.seasonId === season),
      SPLIT_LABEL[split],
    );
    if (line) splits.push(line);
  }
  const p = listing.player.stats;
  for (const line of [p?.current, p?.projected, p?.previous]) if (line) splits.push(line);

  const gameLog: GameLogEntry[] = stats
    .filter((s) => s.statSourceId === 0 && s.statSplitTypeId === 5 && s.externalId)
    .flatMap((s) => {
      const g = seasonGames.get(s.seasonId)?.get(String(s.externalId));
      if (!g) return [];
      const team = s.proTeamId ?? entry.player.proTeamId;
      const home = g.home === team;
      return [
        {
          gameId: String(s.externalId),
          date: etDay(g.date),
          opponent: proTeams[home ? g.away : g.home] ?? "?",
          home,
          stats: gameLine(s),
          fantasyPoints: s.appliedTotal,
        },
      ];
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const upcoming: GameInfo[] = (schedule.get(entry.player.proTeamId) ?? [])
    .filter((g) => g.date >= now - 3 * 3_600_000)
    .slice(0, 7)
    .map((g) => {
      const home = g.homeProTeamId === entry.player.proTeamId;
      return { opponent: proTeams[home ? g.awayProTeamId : g.homeProTeamId] ?? "?", home, date: new Date(g.date).toISOString() };
    });

  const items: NewsItem[] = (news?.news.feed ?? [])
    .filter((n) => !n.premium && (n.story || n.description))
    .slice(0, 10)
    .map((n) => ({
      id: String(n.id),
      headline: n.headline,
      body: n.story ?? n.description,
      published: n.published,
      source: n.type === "Rotowire" ? "RotoWire" : "ESPN",
      url: n.links?.web?.href,
    }));

  return { listing, splits, gameLog, outlook: entry.player.seasonOutlook || undefined, news: items, upcoming };
}
