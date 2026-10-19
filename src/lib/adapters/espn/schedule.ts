import type { GameInfo } from "@/lib/schema";
import type { EspnProTeamsResponse } from "./raw-types";

/**
 * NBA schedule from ESPN's proTeamSchedules_wl view (verified in
 * fixtures/espn/pro-teams-2027.json): proGamesByScoringPeriod maps each day to
 * games with date (ms), homeProTeamId and awayProTeamId.
 *
 * Weeks run Monday-Sunday in US Eastern time, like ESPN's weekly matchups.
 */

export interface ProGame {
  date: number;
  homeProTeamId: number;
  awayProTeamId: number;
}

export type ProSchedule = Map<number, ProGame[]>;

export function normalizeProSchedule(raw: EspnProTeamsResponse): ProSchedule {
  const out: ProSchedule = new Map();
  for (const team of raw.settings.proTeams) {
    if (team.id === 0) continue;
    const games = Object.values(team.proGamesByScoringPeriod ?? {})
      .flat()
      .map((g) => ({ date: g.date, homeProTeamId: g.homeProTeamId, awayProTeamId: g.awayProTeamId }))
      .sort((a, b) => a.date - b.date);
    out.set(team.id, games);
  }
  return out;
}

const etFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "YYYY-MM-DD" in US Eastern time. */
export function etDay(ms: number): string {
  return etFormat.format(new Date(ms));
}

/** Today and the coming Sunday (inclusive), as Eastern day keys. */
export function weekWindow(now: number): { today: string; sunday: string } {
  const dow = DAYS.indexOf(etWeekday.format(new Date(now)));
  const daysToSunday = (7 - dow) % 7;
  return { today: etDay(now), sunday: etDay(now + daysToSunday * 86_400_000) };
}

export function gamesThisWeek(schedule: ProSchedule, proTeamId: number, now: number): number {
  const { today, sunday } = weekWindow(now);
  return (schedule.get(proTeamId) ?? []).filter((g) => {
    const d = etDay(g.date);
    return d >= today && d <= sunday;
  }).length;
}

export function gameToday(schedule: ProSchedule, proTeamId: number, now: number, abbrev: Record<number, string>): GameInfo | null {
  const today = etDay(now);
  const g = (schedule.get(proTeamId) ?? []).find((x) => etDay(x.date) === today);
  if (!g) return null;
  const home = g.homeProTeamId === proTeamId;
  return { opponent: abbrev[home ? g.awayProTeamId : g.homeProTeamId] ?? "?", home, date: new Date(g.date).toISOString() };
}
