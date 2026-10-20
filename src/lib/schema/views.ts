import type { Connection, League, MatchupStatus, Platform, StandingsRow, Team } from "./index";

/**
 * View models composed from unified types for specific screens.
 * Still platform-agnostic: built only from League / Team / Matchup / StandingsRow.
 */

export interface MatchupSummary {
  period: number;
  status: MatchupStatus;
  me: { team: Team; score?: number; categoryRecord?: { wins: number; losses: number; ties: number } };
  opponent: { team: Team; score?: number; categoryRecord?: { wins: number; losses: number; ties: number } } | null; // null = bye
}

export interface DashboardLeague {
  league: League;
  teamCount: number;
  myTeam?: Team;
  standing?: StandingsRow;
  matchup?: MatchupSummary;
  alerts?: DashboardAlert[];
}

export interface DashboardProblem {
  platform: Platform;
  kind: "reconnect" | "error";
  connectionId?: string;
  leagueName?: string;
  message: string;
}

export interface DashboardData {
  connections: Connection[];
  leagues: DashboardLeague[];
  problems: DashboardProblem[];
}

/** Something in a league that needs the user's attention or just happened to them. */
export interface DashboardAlert {
  /** The activity it comes from. */
  id: string;
  kind: "trade_offer" | "offer_waiting" | "claim_pending" | "claim_won" | "trade_done";
  text: string;
  date: string;
  /** Trade offers to you need a decision. */
  urgent: boolean;
}
