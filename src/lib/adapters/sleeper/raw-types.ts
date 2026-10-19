/**
 * Raw Sleeper API shapes (api.sleeper.app/v1), written from real responses in
 * fixtures/sleeper (league 1382095100900802562, captured 2026-10-19). Only
 * fields the adapter reads are typed. Sleeper's API is public and read-only.
 */

/** /state/nba */
export interface SleeperState {
  week: number;
  season: string; // "2026" = the 2026-27 NBA season
  season_type: string; // observed: "regular"
  season_start_date: string; // "2026-10-20"
}

/** /user/<username or id> */
export interface SleeperUser {
  user_id: string;
  username?: string;
  display_name: string;
  avatar: string | null;
}

/** /league/<id> and items of /user/<id>/leagues/nba/<season> */
export interface SleeperLeague {
  league_id: string;
  name: string;
  status: string; // observed: "in_season"; Sleeper also uses pre_draft, drafting, complete
  season: string;
  sport: string; // "nba"
  avatar: string | null;
  total_rosters: number;
  roster_positions: string[]; // e.g. PG,SG,G,SF,PF,F,C,UTIL x5,BN x13
  /** Points per stat, keyed by Sleeper stat key (pts, reb, ast, stl, blk, to, fgm, fga, ftm, fta, tpm, oreb, dd, td, ff, tf...). */
  scoring_settings: Record<string, number>;
  settings: {
    type: number; // observed 2 (dynasty)
    num_teams: number;
    playoff_teams: number;
    playoff_week_start: number;
    trade_deadline: number;
    trade_review_days: number;
    waiver_type: number; // observed 0
    waiver_budget: number;
    waiver_clear_days: number;
    reserve_slots: number;
    taxi_slots: number;
    draft_rounds: number;
    start_week: number;
  };
  draft_id: string;
}

/** /league/<id>/users */
export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner: boolean | null;
  /** team_name set in about half the observed users; avatar may be a full URL. */
  metadata: { team_name?: string; avatar?: string } | null;
}

/** /league/<id>/rosters */
export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  players: string[] | null;
  starters: string[] | null; // in roster_positions order (starting slots only)
  reserve: string[] | null; // IR
  taxi: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    waiver_position: number;
    waiver_budget_used: number;
    total_moves: number;
  };
}

/** /league/<id>/matchups/<week>: one entry per roster; same matchup_id = opponents. */
export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[];
  starters_points: number[];
  players: string[];
  players_points: Record<string, number>;
}

/** /league/<id>/transactions/<week>. Observed types: free_agent, trade (status complete). */
export interface SleeperTransaction {
  transaction_id: string;
  type: string; // free_agent | waiver | trade
  status: string; // complete | failed | pending
  created: number;
  status_updated: number;
  roster_ids: number[];
  adds: Record<string, number> | null; // player id -> roster id
  drops: Record<string, number> | null;
  draft_picks: { round: number; season: string; roster_id: number; owner_id: number; previous_owner_id: number }[];
  settings: { waiver_bid?: number } | null;
}

/** /players/nba (map by player id). */
export interface SleeperPlayer {
  player_id: string;
  full_name: string;
  team: string | null;
  position: string | null;
  fantasy_positions: string[] | null;
  injury_status: string | null; // observed: Out, DTD, IR, or empty
  active: boolean;
  search_rank: number | null;
}

/**
 * /stats/nba/regular/<season> (season totals) and /projections/nba/regular/<season>
 * (per game, gp: 1). Undocumented endpoints; "sp" is seconds played
 * (checked against ESPN minutes for the same players).
 */
export type SleeperStatMap = Record<string, Record<string, number>>;

/** /draft/<id>/picks */
export interface SleeperDraftPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  player_id: string;
  is_keeper: boolean | null;
  metadata: { first_name?: string; last_name?: string; team?: string; position?: string };
}

/** /players/nba/trending/add */
export interface SleeperTrending {
  player_id: string;
  count: number;
}
