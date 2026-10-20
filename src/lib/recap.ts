import type { League, Matchup, MatchupSide, Player, RosterSlot, StandingsRow, Team } from "@/lib/schema";
import { scoreText } from "@/lib/score";
import { isStarterSlot } from "@/lib/hub";

/**
 * Weekly recap: last week's result in each league, from finished matchups,
 * plus the week ahead. Pure, so it's tested against real fixtures.
 */

export type Outcome = "win" | "loss" | "tie" | "bye";

export interface RecapInput {
  league: Pick<League, "id" | "name" | "platform" | "externalId" | "format">;
  myTeamId: string;
  teams: Pick<Team, "id" | "name">[];
  /** All of last week's matchups in the league. */
  lastWeek: Matchup[];
  standing?: StandingsRow;
  /** This week's matchup, for the week ahead. */
  thisWeek?: Matchup | null;
  /** Your roster (names for top performers, games left for the week ahead). */
  slots: RosterSlot[];
}

export interface RecapLeague {
  league: RecapInput["league"];
  week: number;
  outcome: Outcome;
  myScore: string;
  oppScore: string;
  oppName: string | null;
  /** "by 12.4" or "6-3-0". */
  margin?: string;
  /** Points leagues: where your score ranked among every team that week (1 = most). */
  weekRank?: { rank: number; of: number };
  /** Highest-scoring team in the league that week (points leagues). */
  leagueHigh?: { name: string; score: string; mine: boolean };
  topPerformers: { player: Player; points: number }[];
  record?: string;
  standing?: { rank: number; of: number };
  next?: { oppName: string | null; gamesLeft?: number };
}

const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function outcomeOf(m: Matchup, mine: MatchupSide, theirs: MatchupSide | null): Outcome {
  if (!theirs) return "bye";
  if (m.winner) return m.winner === "tie" ? "tie" : (m.winner === "home") === (m.home === mine) ? "win" : "loss";
  if (mine.categoryRecord) return mine.categoryRecord.wins > mine.categoryRecord.losses ? "win" : mine.categoryRecord.wins < mine.categoryRecord.losses ? "loss" : "tie";
  const a = mine.score ?? 0;
  const b = theirs.score ?? 0;
  return a > b ? "win" : a < b ? "loss" : "tie";
}

/** null when the league has no finished week yet (or you aren't in last week's games). */
export function recapLeague(input: RecapInput): RecapLeague | null {
  const name = (id: string | null | undefined) => (id ? (input.teams.find((t) => t.id === id)?.name ?? "Unknown") : null);
  const m = input.lastWeek.find((x) => x.home.teamId === input.myTeamId || x.away?.teamId === input.myTeamId);
  if (!m || m.status !== "final") return null;
  const mine = m.home.teamId === input.myTeamId ? m.home : m.away!;
  const theirs = mine === m.home ? m.away : m.home;
  const outcome = outcomeOf(m, mine, theirs);

  const points = !mine.categoryRecord;
  let margin: string | undefined;
  if (points && theirs && mine.score !== undefined && theirs.score !== undefined) margin = `by ${f1.format(Math.abs(mine.score - theirs.score))}`;
  if (!points) margin = scoreText(mine);

  let weekRank: RecapLeague["weekRank"];
  let leagueHigh: RecapLeague["leagueHigh"];
  if (points) {
    const sides = input.lastWeek.flatMap((x) => [x.home, x.away]).filter((s): s is MatchupSide => !!s && s.score !== undefined);
    const sorted = [...sides].sort((a, b) => b.score! - a.score!);
    const idx = sorted.findIndex((s) => s.teamId === input.myTeamId);
    if (idx >= 0) weekRank = { rank: idx + 1, of: sorted.length };
    if (sorted[0]) leagueHigh = { name: name(sorted[0].teamId) ?? "Unknown", score: scoreText(sorted[0]), mine: sorted[0].teamId === input.myTeamId };
  }

  const byId = new Map(input.slots.flatMap((s) => (s.player ? [[s.player.externalId, s.player] as const] : [])));
  const topPerformers = Object.entries(mine.playerPoints ?? {})
    .flatMap(([id, pts]) => (byId.has(id) ? [{ player: byId.get(id)!, points: pts }] : []))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  const s = input.standing;
  const record = s ? (s.rotoPoints !== undefined ? undefined : `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`) : undefined;
  const nextMine = input.thisWeek && (input.thisWeek.home.teamId === input.myTeamId ? input.thisWeek.home : input.thisWeek.away?.teamId === input.myTeamId ? input.thisWeek.away : null);
  const nextOpp = input.thisWeek && nextMine ? (nextMine === input.thisWeek.home ? input.thisWeek.away : input.thisWeek.home) : null;
  const gamesLeft = input.slots.some((x) => x.player?.schedule)
    ? input.slots.filter((x) => isStarterSlot(x.slot) && x.player).reduce((n, x) => n + (x.player!.schedule?.gamesThisWeek ?? 0), 0)
    : undefined;

  return {
    league: input.league,
    week: m.period,
    outcome,
    myScore: scoreText(mine),
    oppScore: scoreText(theirs),
    oppName: name(theirs?.teamId),
    margin,
    weekRank,
    leagueHigh,
    topPerformers,
    record,
    standing: s ? { rank: s.rank, of: input.teams.length } : undefined,
    next: input.thisWeek ? { oppName: name(nextOpp?.teamId), gamesLeft } : undefined,
  };
}

/** "2-1 last week across 3 leagues", for the page header and the Monday alert. */
export function recapSummary(rows: RecapLeague[]): { wins: number; losses: number; ties: number; text: string } {
  const wins = rows.filter((r) => r.outcome === "win").length;
  const losses = rows.filter((r) => r.outcome === "loss").length;
  const ties = rows.filter((r) => r.outcome === "tie").length;
  const games = rows.filter((r) => r.outcome !== "bye").length;
  const record = `${wins}-${losses}${ties ? `-${ties}` : ""}`;
  return { wins, losses, ties, text: games ? `${record} last week across ${games} ${games === 1 ? "league" : "leagues"}` : "No finished matchups yet" };
}
