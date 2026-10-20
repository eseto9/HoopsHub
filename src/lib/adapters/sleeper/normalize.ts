import {
  unifiedId,
  type InjuryStatus,
  type League,
  type LeagueActivity,
  type LeagueOverview,
  type LeagueStatus,
  type Matchup,
  type MatchupStatus,
  type Player,
  type RosterSlot,
  type StandingsRow,
  type StatLine,
  type Team,
} from "@/lib/schema";
import { gamesThisWeek, gameToday, type ProSchedule } from "../espn/schedule";
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
} from "./raw-types";

/**
 * Sleeper -> unified schema. Verified against fixtures/sleeper (a 14-team
 * points dynasty league). Only points scoring has been observed, so leagues
 * are treated as head-to-head points.
 *
 * Seasons: Sleeper's "2026" is the 2026-27 NBA season. Hoops Hub (like ESPN)
 * names a season by the year it ends, so it becomes "2027".
 */

const leagueKey = (leagueId: string) => unifiedId("sleeper", leagueId);
const teamKey = (leagueId: string, rosterId: number) => unifiedId("sleeper", `${leagueId}.${rosterId}`);
const playerKey = (playerId: string) => unifiedId("sleeper", playerId);

export const headshotUrl = (playerId: string) => `https://sleepercdn.com/content/nba/players/${playerId}.jpg`;
const avatarUrl = (avatar: string | null | undefined) => (avatar ? (avatar.startsWith("http") ? avatar : `https://sleepercdn.com/avatars/thumbs/${avatar}`) : undefined);
const seasonLabel = (sleeperSeason: number) => `${sleeperSeason}-${String(sleeperSeason + 1).slice(2)}`;

/** Sleeper team codes that differ from ESPN's (observed in both player lists). */
const TEAM: Record<string, string> = { GSW: "GS", NOP: "NO", NYK: "NY", SAS: "SA", UTA: "UTAH", WAS: "WSH" };
export const nbaTeam = (code: string | null) => (code ? (TEAM[code] ?? code) : null);

/** Lineup slots a player can fill, from their positions (Sleeper's standard slot names). */
export function eligibleSlots(positions: string[]): string[] {
  const out = new Set(positions);
  if (positions.some((p) => p === "PG" || p === "SG")) out.add("G");
  if (positions.some((p) => p === "SF" || p === "PF")) out.add("F");
  out.add("UTIL");
  out.add("BN");
  return [...out];
}

const INJURY: Record<string, InjuryStatus> = { Out: "OUT", DTD: "DTD", IR: "IR", Sus: "SUSP", GTD: "GTD", Questionable: "QUES" };

const STATUS: Record<string, LeagueStatus> = { pre_draft: "pre_draft", drafting: "drafting", in_season: "in_season", complete: "complete" };

// ---------------------------------------------------------------------------
// Players and stats
// ---------------------------------------------------------------------------

/** Fantasy points for one stat bag, using the league's points per stat. */
export function fantasyPoints(stats: Record<string, number>, scoring: Record<string, number>): number {
  let total = 0;
  for (const [key, pts] of Object.entries(scoring)) total += (stats[key] ?? 0) * pts;
  return Math.round(total * 100) / 100;
}

/**
 * A stat line from Sleeper's season totals (gp = games) or per-game
 * projections (gp = 1). Minutes come from "sp" (seconds played).
 */
export function statLine(raw: Record<string, number> | undefined, label: string, scoring: Record<string, number>, perGameInput: boolean): StatLine | undefined {
  if (!raw) return undefined;
  const games = perGameInput ? 1 : (raw.gp ?? 0);
  if (games <= 0) return undefined;
  const total = (k: string) => raw[k] ?? 0;
  const totals: Record<string, number> = {
    min: total("sp") / 60,
    fgm: total("fgm"),
    fga: total("fga"),
    ftm: total("ftm"),
    fta: total("fta"),
    "3pm": total("tpm"),
    reb: total("reb"),
    ast: total("ast"),
    stl: total("stl"),
    blk: total("blk"),
    to: total("to"),
    pts: total("pts"),
  };
  const perGame: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) perGame[k] = v / games;
  const fg = totals.fga ? totals.fgm / totals.fga : undefined;
  const ft = totals.fta ? totals.ftm / totals.fta : undefined;
  for (const bag of [perGame, totals]) {
    if (fg !== undefined) bag.fg_pct = fg;
    if (ft !== undefined) bag.ft_pct = ft;
  }
  const fpts = fantasyPoints(raw, scoring);
  return {
    label,
    gamesPlayed: perGameInput ? 0 : games,
    perGame,
    totals: perGameInput ? undefined : totals,
    fantasyPointsPerGame: fpts / games,
    fantasyPointsTotal: perGameInput ? undefined : fpts,
  };
}

export interface StatsContext {
  /** Sleeper season number of the current season, e.g. 2026. */
  season: number;
  /** NBA schedule (from ESPN's public data), for games this week and today. */
  nba?: { schedule: ProSchedule; abbrev: Record<number, string>; idByAbbrev: Map<string, number>; now: number };
  current?: SleeperStatMap;
  previous?: SleeperStatMap;
  projections?: SleeperStatMap;
  scoring: Record<string, number>;
}

export function normalizePlayer(p: SleeperPlayer, ctx?: StatsContext): Player {
  const id = p.player_id;
  const stats = ctx && {
    current: statLine(ctx.current?.[id], seasonLabel(ctx.season), ctx.scoring, false),
    previous: statLine(ctx.previous?.[id], seasonLabel(ctx.season - 1), ctx.scoring, false),
    projected: statLine(ctx.projections?.[id], `${seasonLabel(ctx.season)} proj.`, ctx.scoring, true),
  };
  const positions = p.fantasy_positions?.length ? p.fantasy_positions : p.position ? [p.position] : [];
  const team = nbaTeam(p.team);
  const teamId = team && ctx?.nba ? ctx.nba.idByAbbrev.get(team) : undefined;
  const note = [p.injury_body_part, p.injury_notes].filter(Boolean).join(": ");
  return {
    id: playerKey(id),
    platform: "sleeper",
    externalId: id,
    name: p.full_name,
    nbaTeam: team,
    positions,
    eligibleSlots: eligibleSlots(positions),
    injuryStatus: p.injury_status ? INJURY[p.injury_status] ?? "OTHER" : undefined,
    injuryNote: p.injury_status && note ? note : undefined,
    newsAt: p.news_updated ? new Date(p.news_updated).toISOString() : undefined,
    schedule:
      teamId !== undefined && ctx?.nba
        ? { gamesThisWeek: gamesThisWeek(ctx.nba.schedule, teamId, ctx.nba.now), today: gameToday(ctx.nba.schedule, teamId, ctx.nba.now, ctx.nba.abbrev) }
        : undefined,
    headshotUrl: headshotUrl(id),
    stats: stats && (stats.current || stats.previous || stats.projected) ? stats : undefined,
  };
}

/** Unknown ids (retired, not in the player map) still get a row. */
function playerOrStub(id: string, players: Record<string, SleeperPlayer>, ctx?: StatsContext): Player {
  const p = players[id];
  return p ? normalizePlayer(p, ctx) : { id: playerKey(id), platform: "sleeper", externalId: id, name: `Player ${id}`, nbaTeam: null, positions: [] };
}

// ---------------------------------------------------------------------------
// League, teams, rosters
// ---------------------------------------------------------------------------

export function myRoster(rosters: SleeperRoster[], userId: string | undefined): SleeperRoster | undefined {
  if (!userId) return undefined;
  return rosters.find((r) => r.owner_id === userId || r.co_owners?.includes(userId));
}

export function normalizeLeague(raw: SleeperLeague, connectionId: string, mine?: SleeperRoster): League {
  const points: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.scoring_settings)) if (v) points[k === "tpm" ? "3pm" : k] = v;
  return {
    id: leagueKey(raw.league_id),
    platform: "sleeper",
    externalId: raw.league_id,
    connectionId,
    name: raw.name,
    season: String(Number(raw.season) + 1),
    format: "h2h-points",
    size: raw.total_rosters,
    scoring: { points },
    rosterPositions: raw.roster_positions,
    status: STATUS[raw.status] ?? "in_season",
    myTeamId: mine ? teamKey(raw.league_id, mine.roster_id) : undefined,
    avatarUrl: avatarUrl(raw.avatar),
    url: `https://sleeper.com/leagues/${raw.league_id}`,
  };
}

export function normalizeTeams(leagueId: string, users: SleeperLeagueUser[], rosters: SleeperRoster[], userId?: string): Team[] {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const mine = myRoster(rosters, userId);
  return rosters.map((r) => {
    const u = r.owner_id ? byId.get(r.owner_id) : undefined;
    return {
      id: teamKey(leagueId, r.roster_id),
      leagueId: leagueKey(leagueId),
      externalId: String(r.roster_id),
      name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      ownerName: u?.display_name ?? "Open team",
      avatarUrl: avatarUrl(u?.metadata?.avatar ?? u?.avatar),
      isMine: mine?.roster_id === r.roster_id,
    };
  });
}

/**
 * Starters fill the league's starting slots in order ("0" = empty slot);
 * everyone else is bench, with reserve as IR and taxi as TAXI.
 */
export function normalizeRoster(league: SleeperLeague, roster: SleeperRoster, players: Record<string, SleeperPlayer>, ctx?: StatsContext): RosterSlot[] {
  const teamId = teamKey(league.league_id, roster.roster_id);
  const startingSlots = league.roster_positions.filter((s) => s !== "BN");
  const starters = roster.starters ?? [];
  const reserve = new Set(roster.reserve ?? []);
  const taxi = new Set(roster.taxi ?? []);
  const placed = new Set<string>();
  const slots: RosterSlot[] = startingSlots.map((slot, i) => {
    const id = starters[i];
    if (id && id !== "0") placed.add(id);
    return { teamId, slot, player: id && id !== "0" ? playerOrStub(id, players, ctx) : null };
  });
  const bench = (roster.players ?? []).filter((id) => !placed.has(id) && !reserve.has(id) && !taxi.has(id));
  for (const id of bench) slots.push({ teamId, slot: "BN", player: playerOrStub(id, players, ctx) });
  for (const id of reserve) slots.push({ teamId, slot: "IR", player: playerOrStub(id, players, ctx) });
  for (const id of taxi) slots.push({ teamId, slot: "TAXI", player: playerOrStub(id, players, ctx) });
  return slots;
}

// ---------------------------------------------------------------------------
// Matchups and standings
// ---------------------------------------------------------------------------

export function matchupStatus(week: number, state: SleeperState, now: number): MatchupStatus {
  if (week < state.week) return "final";
  if (week > state.week) return "upcoming";
  return now >= Date.parse(`${state.season_start_date}T12:00:00Z`) ? "live" : "upcoming";
}

/** Rosters sharing a matchup_id play each other; a null matchup_id is a bye. */
export function normalizeMatchups(leagueId: string, raw: SleeperMatchup[], week: number, state: SleeperState, now: number): Matchup[] {
  const status = matchupStatus(week, state, now);
  const scored = status !== "upcoming";
  const groups = new Map<string, SleeperMatchup[]>();
  for (const m of raw) {
    const key = m.matchup_id === null ? `bye-${m.roster_id}` : String(m.matchup_id);
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()]
    .map(([key, [a, b]]) => ({
      id: unifiedId("sleeper", `${leagueId}.${week}.${key}`),
      leagueId: leagueKey(leagueId),
      period: week,
      home: { teamId: teamKey(leagueId, a.roster_id), score: scored ? a.points : undefined, playerPoints: scored ? a.players_points : undefined },
      away: b ? { teamId: teamKey(leagueId, b.roster_id), score: scored ? b.points : undefined, playerPoints: scored ? b.players_points : undefined } : null,
      status,
    }))
    .sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
}

const decimal = (whole: number | undefined, dec: number | undefined) => (whole ?? 0) + (dec ?? 0) / 100;

/** Sorted by wins, then points for (Sleeper's default tiebreak). */
export function normalizeStandings(league: SleeperLeague, rosters: SleeperRoster[]): StandingsRow[] {
  const rows = rosters.map((r) => {
    const s = r.settings;
    const games = s.wins + s.losses + s.ties;
    return {
      r,
      pf: decimal(s.fpts, s.fpts_decimal),
      pa: decimal(s.fpts_against, s.fpts_against_decimal),
      pct: games ? (s.wins + s.ties / 2) / games : 0,
    };
  });
  rows.sort((a, b) => b.r.settings.wins - a.r.settings.wins || b.pf - a.pf || a.r.roster_id - b.r.roster_id);
  const leader = rows[0];
  return rows.map((x, i) => ({
    leagueId: leagueKey(league.league_id),
    teamId: teamKey(league.league_id, x.r.roster_id),
    rank: i + 1,
    wins: x.r.settings.wins,
    losses: x.r.settings.losses,
    ties: x.r.settings.ties,
    pointsFor: x.pf,
    pointsAgainst: x.pa,
    winPct: x.pct,
    gamesBack: leader ? (leader.r.settings.wins - x.r.settings.wins + (x.r.settings.losses - leader.r.settings.losses)) / 2 : 0,
    inPlayoffs: i < league.settings.playoff_teams,
  }));
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

const KIND: Record<string, LeagueActivity["kind"]> = { free_agent: "free_agent", waiver: "waiver", trade: "trade" };

/**
 * Completed transactions (observed: free_agent, trade; "waiver" assumed from
 * Sleeper's docs). adds/drops map player id -> roster id. Draft-pick-only
 * trades get a readable line per pick.
 */
export function normalizeTransactions(
  leagueId: string,
  txns: SleeperTransaction[],
  players: Record<string, SleeperPlayer>,
  teamName: (rosterId: number) => string = (r) => `Team ${r}`,
): LeagueActivity[] {
  return txns
    .filter((t) => t.status === "complete" && KIND[t.type])
    .map((t) => {
      const kind = KIND[t.type];
      const moves: LeagueActivity["moves"] = [];
      for (const [pid, rid] of Object.entries(t.adds ?? {})) {
        const fromRid = kind === "trade" ? t.drops?.[pid] : undefined;
        moves.push({
          action: kind === "trade" ? "traded" : "added",
          playerId: playerKey(pid),
          player: players[pid] ? normalizePlayer(players[pid]) : null,
          fromTeamId: fromRid ? teamKey(leagueId, fromRid) : null,
          toTeamId: teamKey(leagueId, rid),
        });
      }
      if (kind !== "trade") {
        for (const [pid, rid] of Object.entries(t.drops ?? {})) {
          moves.push({ action: "dropped", playerId: playerKey(pid), player: players[pid] ? normalizePlayer(players[pid]) : null, fromTeamId: teamKey(leagueId, rid), toTeamId: null });
        }
      }
      const lines = t.draft_picks.map((p) => `${teamName(p.owner_id)} gets ${teamName(p.roster_id)}'s ${p.season} round ${p.round} pick.`);
      return {
        id: unifiedId("sleeper", `${leagueId}.${t.transaction_id}`),
        leagueId: leagueKey(leagueId),
        kind,
        status: "completed" as const,
        date: new Date(t.status_updated || t.created).toISOString(),
        teamId: t.roster_ids[0] ? teamKey(leagueId, t.roster_ids[0]) : null,
        teamIds: t.roster_ids.map((r) => teamKey(leagueId, r)),
        moves,
        lines: lines.length ? lines : undefined,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// League tab
// ---------------------------------------------------------------------------

const STAT_LABEL: Record<string, string> = {
  pts: "PTS", reb: "REB", ast: "AST", stl: "STL", blk: "BLK", to: "TO", fgm: "FGM", fga: "FGA", ftm: "FTM", fta: "FTA",
  tpm: "3PM", oreb: "OREB", dreb: "DREB", dd: "DD", td: "TD", ff: "Flagrant foul", tf: "Technical foul", fgmi: "FG missed",
  ftmi: "FT missed", tpmi: "3PT missed", bonus_pt_40p: "40+ pts bonus", bonus_pt_50p: "50+ pts bonus", bonus_ast_15p: "15+ ast bonus", bonus_reb_20p: "20+ reb bonus",
};

export function normalizeOverview(league: SleeperLeague, rosters: SleeperRoster[], picks: SleeperDraftPick[], players: Record<string, SleeperPlayer>, currentWeek: number): LeagueOverview {
  const s = league.settings;
  const id = league.league_id;
  const slotCounts = new Map<string, number>();
  for (const p of league.roster_positions) slotCounts.set(p, (slotCounts.get(p) ?? 0) + 1);
  const starters = [...slotCounts].filter(([p]) => p !== "BN").map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).join(", ");

  return {
    waiverOrder: rosters
      .map((r) => ({ teamId: teamKey(id, r.roster_id), rank: r.settings.waiver_position, acquisitions: r.settings.total_moves }))
      .sort((a, b) => a.rank - b.rank),
    rules: [
      { title: "Scoring", rows: [{ label: "Format", value: "Head-to-head points" }, { label: "Teams", value: String(s.num_teams) }, { label: "League type", value: s.type === 2 ? "Dynasty" : s.type === 1 ? "Keeper" : "Redraft" }] },
      { title: "Roster", rows: [{ label: "Starters", value: starters }, { label: "Bench", value: String(slotCounts.get("BN") ?? 0) }, { label: "IR spots", value: String(s.reserve_slots) }, ...(s.taxi_slots ? [{ label: "Taxi squad", value: String(s.taxi_slots) }] : [])] },
      {
        title: "Waivers & Free Agents",
        rows: [
          // Only FAAB (2) is a known code; others are shown generically.
          { label: "System", value: s.waiver_type === 2 ? `FAAB (${s.waiver_budget})` : "Waiver priority order" },
          { label: "Dropped players on waivers", value: `${s.waiver_clear_days} days` },
        ],
      },
      { title: "Trades", rows: [{ label: "Trade deadline", value: `Week ${s.trade_deadline}` }, { label: "Review period", value: `${s.trade_review_days} days` }] },
      { title: "Playoffs", rows: [{ label: "Playoff teams", value: String(s.playoff_teams) }, { label: "Start", value: `Week ${s.playoff_week_start}` }] },
    ],
    scoring: Object.entries(league.scoring_settings)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ label: STAT_LABEL[k] ?? k, points: v })),
    draft: picks
      .slice()
      .sort((a, b) => a.pick_no - b.pick_no)
      .map((p) => ({
        overall: p.pick_no,
        round: p.round,
        pick: ((p.pick_no - 1) % s.num_teams) + 1,
        teamId: teamKey(id, p.roster_id),
        playerId: playerKey(p.player_id),
        player: players[p.player_id] ? normalizePlayer(players[p.player_id]) : null,
        keeper: p.is_keeper || undefined,
      })),
    tradeBlock: [],
    schedule: [],
    currentPeriod: currentWeek,
  };
}
