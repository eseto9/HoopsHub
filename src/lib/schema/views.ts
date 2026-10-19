import type { Connection, League, MatchupStatus, Platform, StandingsRow, Team } from "./index";

/**
 * View models composed from unified types for specific screens.
 * Still platform-agnostic: built only from League / Team / Matchup / StandingsRow.
 */

export interface MatchupSummary {
  period: number;
  status: MatchupStatus;
  me: { team: Team; score?: number };
  opponent: { team: Team; score?: number } | null; // null = bye
}

export interface DashboardLeague {
  league: League;
  teamCount: number;
  myTeam?: Team;
  standing?: StandingsRow;
  matchup?: MatchupSummary;
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
