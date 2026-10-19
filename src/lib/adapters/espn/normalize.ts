import {
  unifiedId,
  type League,
  type LeagueStatus,
  type Matchup,
  type MatchupSide,
  type MatchupStatus,
  type Player,
  type RosterSlot,
  type PlayerStats,
  type ScoringSettings,
  type StatLine,
  type StandingsRow,
  type Team,
} from "@/lib/schema";
import {
  BASE_POSITION_SLOTS,
  LINEUP_SLOTS,
  defaultPosition,
  headshotUrl,
  leagueUrl,
  mapInjury,
  mapScoringType,
  statInfo,
} from "./constants";
import type {
  EspnFanProfile,
  EspnLeagueSettingsResponse,
  EspnMatchupSide,
  EspnMatchupsResponse,
  EspnPlayer,
  EspnProTeamsResponse,
  EspnRosterResponse,
  EspnScheduleItem,
  EspnStatEntry,
  EspnTeam,
} from "./raw-types";
import { gamesThisWeek, gameToday, type ProSchedule } from "./schedule";

/** proTeamId -> NBA abbreviation. 0 (free agent) is omitted. */
export type ProTeamMap = Record<number, string>;

export interface LeagueContext {
  leagueId: string;
  connectionId: string;
  /** SWID of the connected user (cookie connections), used to find "my team". */
  swid?: string;
  /** Team the user picked for a public league. Takes precedence over swid. */
  myTeamExternalId?: string;
}

const leagueKey = (leagueId: string | number) => unifiedId("espn", leagueId);
const teamKey = (leagueId: string | number, teamId: number) => unifiedId("espn", `${leagueId}.${teamId}`);

export function normalizeProTeams(raw: EspnProTeamsResponse): ProTeamMap {
  const map: ProTeamMap = {};
  for (const t of raw.settings.proTeams) if (t.id !== 0) map[t.id] = t.abbrev;
  return map;
}

/** Fantasy basketball league ids for the given season from the fan profile. */
export function leagueIdsFromFanProfile(raw: EspnFanProfile, season: number): string[] {
  const ids = new Set<string>();
  for (const pref of raw.preferences ?? []) {
    const entry = pref.metaData?.entry;
    if (entry?.abbrev !== "FBA" || entry.seasonId !== season) continue;
    for (const g of entry.groups ?? []) ids.add(String(g.groupId));
  }
  return [...ids];
}

function sameSwid(a: string | undefined, b: string | undefined) {
  return !!a && !!b && a.replace(/[{}]/g, "").toUpperCase() === b.replace(/[{}]/g, "").toUpperCase();
}

function findMyTeam(teams: EspnTeam[], ctx: LeagueContext): EspnTeam | undefined {
  if (ctx.myTeamExternalId) return teams.find((t) => String(t.id) === ctx.myTeamExternalId);
  if (ctx.swid) return teams.find((t) => (t.owners ?? []).some((o) => sameSwid(o, ctx.swid)));
  return undefined;
}

function leagueStatus(raw: EspnLeagueSettingsResponse): LeagueStatus {
  if (raw.status.isExpired) return "complete";
  if (raw.draftDetail.inProgress) return "drafting";
  if (!raw.draftDetail.drafted) return "pre_draft";
  return "in_season";
}

function scoringSettings(raw: EspnLeagueSettingsResponse, format: League["format"]): ScoringSettings {
  const items = raw.settings.scoringSettings.scoringItems;
  if (format === "h2h-points" || format === "points") {
    const points: Record<string, number> = {};
    for (const i of items) points[statInfo(i.statId).key] = i.points;
    return { points };
  }
  return {
    categories: items.map((i) => {
      const s = statInfo(i.statId);
      return { stat: s.key, label: s.label, higherIsBetter: !i.isReverseItem };
    }),
  };
}

function rosterPositions(raw: EspnLeagueSettingsResponse): string[] {
  const out: string[] = [];
  const counts = raw.settings.rosterSettings.lineupSlotCounts;
  for (const slotId of Object.keys(counts).map(Number).sort((a, b) => a - b)) {
    const label = LINEUP_SLOTS[slotId];
    if (!label) continue;
    for (let i = 0; i < counts[slotId]; i++) out.push(label);
  }
  return out;
}

export function normalizeLeague(raw: EspnLeagueSettingsResponse, ctx: LeagueContext): League {
  const format = mapScoringType(raw.settings.scoringSettings.scoringType);
  const mine = findMyTeam(raw.teams, ctx);
  return {
    id: leagueKey(raw.id),
    platform: "espn",
    externalId: String(raw.id),
    connectionId: ctx.connectionId,
    name: raw.settings.name,
    season: String(raw.seasonId),
    format,
    size: raw.settings.size,
    scoring: scoringSettings(raw, format),
    rosterPositions: rosterPositions(raw),
    status: leagueStatus(raw),
    myTeamId: mine ? teamKey(raw.id, mine.id) : undefined,
    url: leagueUrl(raw.id, raw.seasonId),
  };
}

export function normalizeTeams(raw: EspnLeagueSettingsResponse, ctx: LeagueContext): Team[] {
  const mine = findMyTeam(raw.teams, ctx);
  const memberName = new Map(raw.members.map((m) => [m.id.toUpperCase(), m.displayName]));
  return raw.teams.map((t) => ({
    id: teamKey(raw.id, t.id),
    leagueId: leagueKey(raw.id),
    externalId: String(t.id),
    name: t.name,
    ownerName: (t.primaryOwner && memberName.get(t.primaryOwner.toUpperCase())) || t.abbrev,
    avatarUrl: t.logo,
    isMine: mine?.id === t.id,
  }));
}

/** Stat keys shown in the UI. ESPN returns ~45; keep the common ones to stay lean. */
export const STAT_KEYS = [0, 6, 3, 2, 1, 17, 11, 19, 20, 40, 13, 14, 15, 16, 4];
/** Percentages are rates, not sums: never total them. */
const RATE_KEYS = new Set([19, 20]);

function seasonLabel(seasonId: number) {
  return `${seasonId - 1}-${String(seasonId).slice(2)}`;
}

export function statLine(e: EspnStatEntry | undefined, label: string): StatLine | undefined {
  const gp = e?.stats?.["42"] ?? 0;
  if (!e || !e.averageStats || gp <= 0) return undefined;
  const perGame: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const id of STAT_KEYS) {
    const key = statInfo(id).key;
    const avg = e.averageStats[String(id)];
    if (typeof avg === "number") perGame[key] = avg;
    const tot = RATE_KEYS.has(id) ? avg : e.stats?.[String(id)];
    if (typeof tot === "number") totals[key] = tot;
  }
  return { label, gamesPlayed: gp, fantasyPointsPerGame: e.appliedAverage, fantasyPointsTotal: e.appliedTotal, perGame, totals };
}

/** Season actual / previous season / projection from ESPN's stat spans. */
export function normalizePlayerStats(p: EspnPlayer): PlayerStats | undefined {
  const entries = p.stats ?? [];
  if (entries.length === 0) return undefined;
  const season = Math.max(...entries.map((e) => e.seasonId));
  const find = (source: number, seasonId: number) =>
    entries.find((e) => e.statSourceId === source && e.statSplitTypeId === 0 && e.seasonId === seasonId && e.scoringPeriodId === 0);
  const stats: PlayerStats = {
    current: statLine(find(0, season), seasonLabel(season)),
    previous: statLine(find(0, season - 1), seasonLabel(season - 1)),
    projected: statLine(find(1, season), `${seasonLabel(season)} proj.`),
  };
  return stats.current || stats.previous || stats.projected ? stats : undefined;
}

/** Optional NBA schedule context, so players carry games-this-week and today's opponent. */
export interface ScheduleContext {
  schedule: ProSchedule;
  now: number;
}

export function normalizePlayer(p: EspnPlayer, proTeams: ProTeamMap, sched?: ScheduleContext): Player {
  const positions = BASE_POSITION_SLOTS.filter((s) => p.eligibleSlots.includes(s)).map((s) => LINEUP_SLOTS[s]);
  if (positions.length === 0) {
    const pos = defaultPosition(p.defaultPositionId);
    if (pos) positions.push(pos);
  }
  return {
    id: unifiedId("espn", p.id),
    platform: "espn",
    externalId: String(p.id),
    name: p.fullName,
    nbaTeam: proTeams[p.proTeamId] ?? null,
    positions,
    injuryStatus: mapInjury(p.injuryStatus),
    headshotUrl: headshotUrl(p.id),
    eligibleSlots: p.eligibleSlots.flatMap((id) => (LINEUP_SLOTS[id] ? [LINEUP_SLOTS[id]] : [])),
    stats: normalizePlayerStats(p),
    ownership: p.ownership
      ? { percentRostered: p.ownership.percentOwned, percentRosteredChange: p.ownership.percentChange, percentStarted: p.ownership.percentStarted }
      : undefined,
    schedule: sched
      ? {
          gamesThisWeek: gamesThisWeek(sched.schedule, p.proTeamId, sched.now),
          today: gameToday(sched.schedule, p.proTeamId, sched.now, proTeams),
        }
      : undefined,
  };
}

/**
 * One RosterSlot per lineup slot defined by the league (empty slots get
 * player: null), followed by any entries in slots the league doesn't define.
 */
export function normalizeRoster(
  settings: EspnLeagueSettingsResponse,
  roster: EspnRosterResponse,
  teamExternalId: string,
  proTeams: ProTeamMap,
  sched?: ScheduleContext,
): RosterSlot[] {
  const teamId = teamKey(settings.id, Number(teamExternalId));
  const entries = roster.teams?.find((t) => String(t.id) === teamExternalId)?.roster.entries ?? [];
  const bySlot = new Map<number, typeof entries>();
  for (const e of entries) bySlot.set(e.lineupSlotId, [...(bySlot.get(e.lineupSlotId) ?? []), e]);

  const slots: RosterSlot[] = [];
  const counts = settings.settings.rosterSettings.lineupSlotCounts;
  for (const slotId of Object.keys(counts).map(Number).sort((a, b) => a - b)) {
    const label = LINEUP_SLOTS[slotId];
    if (!label) continue;
    const filled = bySlot.get(slotId) ?? [];
    bySlot.delete(slotId);
    const size = Math.max(counts[slotId], filled.length);
    for (let i = 0; i < size; i++) {
      const e = filled[i];
      slots.push({ teamId, slot: label, player: e ? normalizePlayer(e.playerPoolEntry.player, proTeams, sched) : null, locked: e?.playerPoolEntry.lineupLocked || undefined });
    }
  }
  for (const [slotId, rest] of bySlot) {
    for (const e of rest) {
      slots.push({ teamId, slot: LINEUP_SLOTS[slotId] ?? `SLOT_${slotId}`, player: normalizePlayer(e.playerPoolEntry.player, proTeams, sched) });
    }
  }
  return slots;
}

function matchupStatus(item: EspnScheduleItem, currentPeriod: number, leagueActive: boolean): MatchupStatus {
  if (item.winner && item.winner !== "UNDECIDED") return "final";
  if (item.matchupPeriodId < currentPeriod) return "final";
  if (item.matchupPeriodId === currentPeriod && leagueActive) return "live";
  return "upcoming";
}

function side(leagueId: number, s: EspnMatchupSide, status: MatchupStatus): MatchupSide {
  return {
    teamId: teamKey(leagueId, s.teamId),
    score: status === "live" ? (s.totalPointsLive ?? s.totalPoints) : s.totalPoints,
  };
}

/**
 * Matchups for one matchup period (defaults to the league's current one).
 * latestScoringPeriod is already 1 the day before opening night, so callers
 * pass whether the NBA season has actually tipped off.
 */
export function normalizeMatchups(raw: EspnMatchupsResponse, leagueId: number, period?: number, seasonStarted = true): Matchup[] {
  const current = raw.status.currentMatchupPeriod;
  const target = period ?? current;
  const active = raw.status.isActive && raw.status.latestScoringPeriod > 0 && seasonStarted;
  return raw.schedule
    .filter((m) => m.matchupPeriodId === target)
    .map((m) => {
      const status = matchupStatus(m, current, active);
      return {
        id: unifiedId("espn", `${leagueId}.${m.id}`),
        leagueId: leagueKey(leagueId),
        period: m.matchupPeriodId,
        home: side(leagueId, m.home, status),
        away: m.away ? side(leagueId, m.away, status) : null,
        status,
      };
    });
}

/**
 * Standings from mTeam records. ESPN's playoffSeed is used as rank when every
 * team has one; otherwise rank by win percentage, then points for.
 */
export function normalizeStandings(raw: EspnLeagueSettingsResponse): StandingsRow[] {
  const allSeeded = raw.teams.every((t) => t.playoffSeed > 0);
  const sorted = [...raw.teams].sort((a, b) =>
    allSeeded
      ? a.playoffSeed - b.playoffSeed
      : b.record.overall.percentage - a.record.overall.percentage || b.record.overall.pointsFor - a.record.overall.pointsFor,
  );
  return sorted.map((t, i) => ({
    leagueId: leagueKey(raw.id),
    teamId: teamKey(raw.id, t.id),
    rank: i + 1,
    wins: t.record.overall.wins,
    losses: t.record.overall.losses,
    ties: t.record.overall.ties,
    pointsFor: t.record.overall.pointsFor,
    pointsAgainst: t.record.overall.pointsAgainst,
    winPct: t.record.overall.percentage,
    gamesBack: t.record.overall.gamesBack,
    // streakType observed: "NONE" pre-season; WIN/LOSS/TIE per espn-api.
    streak:
      t.record.overall.streakLength > 0 && t.record.overall.streakType !== "NONE"
        ? `${t.record.overall.streakType.charAt(0)}${t.record.overall.streakLength}`
        : undefined,
    inPlayoffs: raw.settings.scheduleSettings.playoffTeamCount ? i < raw.settings.scheduleSettings.playoffTeamCount : undefined,
  }));
}
