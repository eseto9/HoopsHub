import { unifiedId, type LeagueOverview, type Player, type ScheduleWeek } from "@/lib/schema";
import { LINEUP_SLOTS, statInfo } from "./constants";
import type { EspnLeagueSettingsResponse, EspnMatchupsResponse, EspnProTeamsResponse, EspnTransactionsResponse } from "./raw-types";
import { etDay } from "./schedule";

/**
 * League tab from mSettings/mTeam (waiver order, rules), mMatchup (full
 * schedule), mTransactions2 (DRAFT picks with overallPickNumber) and the pro
 * schedule (date of the first scoring period). All shapes verified in
 * fixtures/espn/league-1151450222.
 *
 * scheduleSettings.matchupPeriods maps each matchup to week units ("1":[1],
 * playoff "18":[18,19]), not days. Week 1 is taken to run from opening day to
 * the first Sunday and later weeks Monday-Sunday (Eastern); checked against
 * espn.com's schedule page (Matchup 1 Oct 20 - 25, a two-unit matchup Feb 15 - 28).
 */

const teamKey = (leagueId: string, teamId: number) => unifiedId("espn", `${leagueId}.${teamId}`);

const SCORING_FORMAT: Record<string, string> = {
  H2H_POINTS: "Head-to-head points",
  H2H_CATEGORY: "Head-to-head categories",
  H2H_MOST_CATEGORIES: "Head-to-head most categories",
  ROTO: "Rotisserie",
  TOTAL_POINTS: "Season points",
};
const ACQUISITION: Record<string, string> = { WAIVERS_TRADITIONAL: "Traditional waivers (rolling order)" };
const SEEDING: Record<string, string> = { TOTAL_POINTS_SCORED: "Total points scored", H2H_RECORD: "Head-to-head record" };
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** First and last day of a week unit, given opening day. */
export function weekUnitRange(openingDay: string, unit: number): { start: string; end: string } {
  const dow = new Date(`${openingDay}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const firstSunday = addDays(openingDay, (7 - dow) % 7);
  return {
    start: unit === 1 ? openingDay : addDays(firstSunday, 1 + 7 * (unit - 2)),
    end: addDays(firstSunday, 7 * (unit - 1)),
  };
}

/** Scoring period (day) -> "YYYY-MM-DD" in Eastern time, from the NBA schedule. */
export function scoringPeriodDays(raw: EspnProTeamsResponse): Map<number, string> {
  const out = new Map<number, string>();
  for (const team of raw.settings.proTeams) {
    for (const [sp, games] of Object.entries(team.proGamesByScoringPeriod ?? {})) {
      if (games[0] && !out.has(Number(sp))) out.set(Number(sp), etDay(games[0].date));
    }
  }
  return out;
}

export function normalizeOverview(
  settings: EspnLeagueSettingsResponse,
  matchups: EspnMatchupsResponse,
  txns: EspnTransactionsResponse,
  proTeams: EspnProTeamsResponse,
  players: Map<number, Player>,
  now: number,
): LeagueOverview {
  const today = etDay(now);
  const leagueId = String(settings.id);
  const s = settings.settings;
  const size = s.size || settings.teams.length;

  const waiverOrder = settings.teams
    .filter((t) => (t.waiverRank ?? 0) > 0)
    .map((t) => ({
      teamId: teamKey(leagueId, t.id),
      rank: t.waiverRank!,
      acquisitions: t.transactionCounter?.acquisitions ?? 0,
      drops: t.transactionCounter?.drops ?? 0,
      trades: t.transactionCounter?.trades ?? 0,
      moveToIR: t.transactionCounter?.moveToIR ?? 0,
    }))
    .sort((a, b) => a.rank - b.rank);

  const points = s.scoringSettings.scoringType.includes("POINTS");
  const scoring = s.scoringSettings.scoringItems.map((i) => ({ label: statInfo(i.statId).label, points: points ? i.points : undefined }));

  const draft = (txns.transactions ?? [])
    .filter((t) => t.type === "DRAFT" && t.status === "EXECUTED")
    .flatMap((t) => (t.items ?? []).filter((i) => i.type === "DRAFT" && i.overallPickNumber))
    .sort((a, b) => a.overallPickNumber! - b.overallPickNumber!)
    .map((i) => ({
      overall: i.overallPickNumber!,
      round: Math.ceil(i.overallPickNumber! / size),
      pick: ((i.overallPickNumber! - 1) % size) + 1,
      teamId: teamKey(leagueId, i.toTeamId),
      playerId: unifiedId("espn", i.playerId),
      player: players.get(i.playerId) ?? null,
      keeper: i.isKeeper || undefined,
    }));

  const opening = scoringPeriodDays(proTeams).get(settings.status.firstScoringPeriod || 1);
  const regular = s.scheduleSettings.matchupPeriodCount;
  const schedule: ScheduleWeek[] = Object.entries(s.scheduleSettings.matchupPeriods)
    .map(([period, sps]) => {
      const p = Number(period);
      const range = opening && sps.length ? { start: weekUnitRange(opening, Math.min(...sps)).start, end: weekUnitRange(opening, Math.max(...sps)).end } : undefined;
      const games = matchups.schedule
        .filter((m) => m.matchupPeriodId === p)
        .map((m) => {
          const decided = m.winner === "HOME" || m.winner === "AWAY" || m.winner === "TIE";
          // latestScoringPeriod is already 1 before opening night, so go by date.
          const scored = decided || (range !== undefined && range.start <= today);
          return {
            home: teamKey(leagueId, m.home.teamId),
            away: m.away ? teamKey(leagueId, m.away.teamId) : null,
            homeScore: scored ? m.home.totalPointsLive ?? m.home.totalPoints : undefined,
            awayScore: m.away && scored ? m.away.totalPointsLive ?? m.away.totalPoints : undefined,
            winner: decided ? (m.winner.toLowerCase() as "home" | "away" | "tie") : undefined,
          };
        });
      return {
        period: p,
        label: p <= regular ? `Week ${p}` : `Playoffs Round ${p - regular}`,
        playoff: p > regular,
        start: range?.start,
        end: range?.end,
        games,
      };
    })
    .sort((a, b) => a.period - b.period);

  const slotCounts = Object.entries(s.rosterSettings.lineupSlotCounts)
    .map(([id, n]) => ({ label: LINEUP_SLOTS[Number(id)], n }))
    .filter((x) => x.label && x.n > 0);
  const starters = slotCounts.filter((x) => x.label !== "BN" && x.label !== "IR");
  const count = (label: string) => slotCounts.find((x) => x.label === label)?.n ?? 0;

  const acq = s.acquisitionSettings;
  const trade = s.tradeSettings;
  const draftS = s.draftSettings;
  const sched = s.scheduleSettings;
  const rules: LeagueOverview["rules"] = [
    {
      title: "Scoring",
      rows: [
        { label: "Format", value: SCORING_FORMAT[s.scoringSettings.scoringType] ?? s.scoringSettings.scoringType },
        { label: "Teams", value: String(size) },
        { label: "Regular season", value: `${regular} weeks` },
      ],
    },
    {
      title: "Roster",
      rows: [
        { label: "Starters", value: starters.map((x) => (x.n > 1 ? `${x.label} ×${x.n}` : x.label)).join(", ") },
        { label: "Bench", value: String(count("BN")) },
        { label: "IR spots", value: String(count("IR")) },
        ...(s.rosterSettings.lineupLocktimeType === "INDIVIDUAL_GAME" ? [{ label: "Lineup lock", value: "Each player at tip-off" }] : []),
        ...(s.rosterSettings.moveLimit !== undefined
          ? [{ label: "Lineup moves", value: s.rosterSettings.moveLimit < 0 ? "Unlimited" : String(s.rosterSettings.moveLimit) }]
          : []),
      ],
    },
  ];
  if (acq) {
    rules.push({
      title: "Waivers & Free Agents",
      rows: [
        { label: "System", value: ACQUISITION[acq.acquisitionType] ?? acq.acquisitionType },
        { label: "Dropped players on waivers", value: `${acq.waiverHours} hours` },
        { label: "Waivers process", value: acq.waiverProcessDays.map(titleCase).join(", ") || "Daily" },
        { label: "Season acquisition limit", value: acq.acquisitionLimit < 0 ? "None" : String(acq.acquisitionLimit) },
        ...(acq.isUsingAcquisitionBudget ? [{ label: "FAAB budget", value: `$${acq.acquisitionBudget}` }] : []),
      ],
    });
  }
  if (trade) {
    rules.push({
      title: "Trades",
      rows: [
        { label: "Trade deadline", value: dateFmt.format(new Date(trade.deadlineDate)) + " ET" },
        { label: "Review period", value: `${trade.revisionHours} hours` },
        { label: "Votes to veto", value: String(trade.vetoVotesRequired) },
      ],
    });
  }
  if (draftS) {
    rules.push({
      title: "Draft",
      rows: [
        { label: "Type", value: titleCase(draftS.type) },
        { label: "Date", value: dateFmt.format(new Date(draftS.date)) + " ET" },
        { label: "Time per pick", value: `${draftS.timePerSelection} seconds` },
        { label: "Keepers", value: String(draftS.keeperCount) },
      ],
    });
  }
  if (sched.playoffTeamCount) {
    const firstPlayoff = schedule.find((w) => w.playoff);
    rules.push({
      title: "Playoffs",
      rows: [
        { label: "Playoff teams", value: String(sched.playoffTeamCount) },
        ...(sched.playoffSeedingRule ? [{ label: "Seeding", value: SEEDING[sched.playoffSeedingRule] ?? sched.playoffSeedingRule }] : []),
        ...(sched.playoffMatchupPeriodLength ? [{ label: "Round length", value: `${sched.playoffMatchupPeriodLength} weeks` }] : []),
        ...(firstPlayoff?.start ? [{ label: "Start", value: dateOnly.format(new Date(`${firstPlayoff.start}T12:00:00Z`)) }] : []),
      ],
    });
  }

  return { waiverOrder, rules, scoring, draft, schedule, currentPeriod: settings.status.currentMatchupPeriod };
}

/** Drafted player ids, for the player lookup. */
export function draftPlayerIds(txns: EspnTransactionsResponse): number[] {
  return (txns.transactions ?? []).flatMap((t) => (t.type === "DRAFT" ? (t.items ?? []).map((i) => i.playerId) : [])).filter((id) => id > 0);
}
