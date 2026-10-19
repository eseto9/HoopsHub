/**
 * Unified Hoops Hub schema.
 *
 * The frontend reads ONLY these types. Platform adapters normalize raw
 * ESPN / Yahoo / Sleeper responses into them. Nothing here may carry
 * credentials or platform-specific payloads.
 *
 * Per-format details (category results, roto points) are intentionally
 * loose until real fixtures for each platform are captured.
 */

export const PLATFORMS = ["sleeper", "yahoo", "espn"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const LEAGUE_FORMATS = ["roto", "h2h-categories", "h2h-points", "points"] as const;
export type LeagueFormat = (typeof LEAGUE_FORMATS)[number];

/** Unified ids are `${platform}:${externalId}` so they are globally unique. */
export type UnifiedId = `${Platform}:${string}`;

export function unifiedId(platform: Platform, externalId: string | number): UnifiedId {
  return `${platform}:${externalId}`;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export type ConnectionStatus = "active" | "needs_reconnect";

/** Client-safe view of a connection. Encrypted credentials never appear here. */
export interface Connection {
  id: string;
  userId: string;
  platform: Platform;
  externalUserId: string;
  displayName: string;
  status: ConnectionStatus;
  lastSyncedAt: string | null;
}

export interface ScoringCategory {
  /** Normalized stat key, e.g. "pts", "reb", "fg_pct", "to". */
  stat: string;
  label: string;
  higherIsBetter: boolean;
}

export interface ScoringSettings {
  /** Roto and H2H categories leagues. */
  categories?: ScoringCategory[];
  /** Points leagues: normalized stat key -> points per unit. */
  points?: Record<string, number>;
}

export type LeagueStatus = "pre_draft" | "drafting" | "in_season" | "complete";

export interface League {
  id: UnifiedId;
  platform: Platform;
  externalId: string;
  connectionId: string;
  name: string;
  season: string;
  format: LeagueFormat;
  size: number;
  scoring: ScoringSettings;
  /** Starting + bench slot labels, e.g. ["PG","SG","G","SF","PF","F","C","UTIL","BN","BN","IR"]. */
  rosterPositions: string[];
  status: LeagueStatus;
  myTeamId?: UnifiedId;
  avatarUrl?: string;
  /** Deep link to the league on its own platform. */
  url?: string;
}

export interface Team {
  id: UnifiedId;
  leagueId: UnifiedId;
  externalId: string;
  name: string;
  ownerName: string;
  avatarUrl?: string;
  isMine: boolean;
}

export type InjuryStatus = "OUT" | "DTD" | "GTD" | "QUES" | "SUSP" | "IR" | "OTHER";

export interface Player {
  id: UnifiedId;
  platform: Platform;
  externalId: string;
  name: string;
  /** NBA team abbreviation, e.g. "BOS". Null for free agents not on an NBA roster. */
  nbaTeam: string | null;
  positions: string[];
  injuryStatus?: InjuryStatus;
  headshotUrl?: string;
  /** Lineup slots this player may occupy, e.g. ["PG","G","UTIL","BN","IR"]. */
  eligibleSlots?: string[];
  stats?: PlayerStats;
}

/**
 * Per-game averages for one span. Stat keys are normalized ("pts", "reb",
 * "fg_pct"...); percentages are fractions (0.489 = 48.9%).
 */
export interface StatLine {
  /** Human label, e.g. "2026-27", "2025-26", "2026-27 proj." */
  label: string;
  gamesPlayed: number;
  /** In this league's scoring (points leagues). */
  fantasyPointsPerGame?: number;
  perGame: Record<string, number>;
}

export interface PlayerStats {
  /** This season's actual stats, once games have been played. */
  current?: StatLine;
  /** Last season's actual stats. */
  previous?: StatLine;
  /** Platform projection for this season. */
  projected?: StatLine;
}

export interface RosterSlot {
  teamId: UnifiedId;
  /** Slot label: "PG", "UTIL", "BN", "IR", ... */
  slot: string;
  player: Player | null;
  /** Player can't be moved right now (e.g. their game has started). */
  locked?: boolean;
}

export interface MatchupSide {
  teamId: UnifiedId;
  score?: number;
  /** H2H categories: stat key -> this side's value. */
  categoryValues?: Record<string, number>;
  /** H2H categories: wins-losses-ties for this side within the matchup. */
  categoryRecord?: { wins: number; losses: number; ties: number };
}

export type MatchupStatus = "upcoming" | "live" | "final";

export interface Matchup {
  id: UnifiedId;
  leagueId: UnifiedId;
  /** Week / scoring period number as the platform defines it. */
  period: number;
  home: MatchupSide;
  away: MatchupSide | null; // null = bye
  status: MatchupStatus;
}

export interface StandingsRow {
  leagueId: UnifiedId;
  teamId: UnifiedId;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor?: number;
  pointsAgainst?: number;
  /** Roto leagues. */
  rotoPoints?: number;
  /** Roto leagues: stat key -> rank in that category. */
  categoryRanks?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// League activity (Recent Activity page)
// ---------------------------------------------------------------------------

export type ActivityKind = "free_agent" | "waiver" | "trade";

export interface ActivityMove {
  action: "added" | "dropped" | "traded";
  playerId: UnifiedId;
  /** Resolved player, when the platform could look it up. */
  player: Player | null;
  fromTeamId: UnifiedId | null; // null = free agency / waivers
  toTeamId: UnifiedId | null; // null = dropped to free agency
}

export interface LeagueActivity {
  id: UnifiedId;
  leagueId: UnifiedId;
  kind: ActivityKind;
  status: "completed" | "pending";
  /** ISO timestamp the move happened (processed time for waivers). */
  date: string;
  /** Team that made the move (proposer for trades). */
  teamId: UnifiedId;
  /** Every team involved, including teamId. */
  teamIds: UnifiedId[];
  moves: ActivityMove[];
}
