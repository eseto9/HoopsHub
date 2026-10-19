/**
 * Raw ESPN fantasy basketball (fba) response types.
 *
 * Written from real responses saved in fixtures/espn (season 2027). Only the
 * fields Hoops Hub reads are typed; ESPN returns many more.
 */

export interface EspnGame {
  currentSeasonId: number;
  currentSeason: { id: number; currentScoringPeriod: { id: number } };
}

export interface EspnProTeam {
  id: number; // 0 = free agent
  abbrev: string;
  location: string;
  name: string;
}

export interface EspnProTeamsResponse {
  settings: { proTeams: EspnProTeam[] };
}

export interface EspnFanProfile {
  preferences?: {
    type?: { code?: string };
    metaData?: {
      entry?: {
        abbrev?: string; // "FBA" for fantasy basketball
        gameId?: number;
        seasonId?: number;
        groups?: { groupId: number; groupName: string }[];
      };
    };
  }[];
}

export interface EspnRecordLine {
  wins: number;
  losses: number;
  ties: number;
  percentage: number;
  pointsFor: number;
  pointsAgainst: number;
  gamesBack: number;
  streakLength: number;
  streakType: string;
}

export interface EspnTeam {
  id: number;
  abbrev: string;
  name: string;
  logo?: string;
  owners?: string[]; // SWIDs, e.g. "{XXXXXXXX-...}"
  primaryOwner?: string;
  playoffSeed: number;
  points: number;
  record: { overall: EspnRecordLine; home: EspnRecordLine; away: EspnRecordLine; division: EspnRecordLine };
}

export interface EspnMember {
  id: string; // SWID
  displayName: string;
  firstName?: string;
  lastName?: string;
}

export interface EspnScoringItem {
  statId: number;
  points: number;
  isReverseItem: boolean;
  pointsOverrides?: Record<string, number>;
}

export interface EspnStatus {
  currentMatchupPeriod: number;
  firstScoringPeriod: number;
  finalScoringPeriod: number;
  latestScoringPeriod: number;
  isActive: boolean;
  isExpired?: boolean;
}

export interface EspnDraftDetail {
  drafted: boolean;
  inProgress: boolean;
}

export interface EspnSettings {
  name: string;
  size: number;
  isPublic: boolean;
  scoringSettings: {
    scoringType: string; // observed: "H2H_POINTS"
    scoringItems: EspnScoringItem[];
  };
  rosterSettings: { lineupSlotCounts: Record<string, number> };
  scheduleSettings: {
    matchupPeriodCount: number;
    matchupPeriods: Record<string, number[]>; // matchup period -> scoring periods (days)
  };
}

/** league?view=mSettings&view=mStatus&view=mTeam */
export interface EspnLeagueSettingsResponse {
  id: number;
  seasonId: number;
  scoringPeriodId: number;
  draftDetail: EspnDraftDetail;
  status: EspnStatus;
  settings: EspnSettings;
  teams: EspnTeam[];
  members: EspnMember[];
}

/**
 * One stat span. Observed ids are `${statSourceId}${statSplitTypeId}${seasonId}`:
 * source 0 = actual, 1 = projected; split 0 = full season (1-3 are present but
 * empty pre-season; presumably last 7/15/30 days).
 */
export interface EspnStatEntry {
  id: string;
  seasonId: number;
  scoringPeriodId: number;
  statSourceId: number;
  statSplitTypeId: number;
  appliedTotal?: number;
  appliedAverage?: number;
  stats?: Record<string, number>;
  averageStats?: Record<string, number>;
}

export interface EspnPlayer {
  stats?: EspnStatEntry[];
  id: number;
  fullName: string;
  proTeamId: number;
  defaultPositionId: number;
  eligibleSlots: number[];
  injured: boolean;
  injuryStatus?: string; // observed: ACTIVE, DAY_TO_DAY, OUT
  active?: boolean;
  ownership?: { percentOwned: number; percentStarted: number; averageDraftPosition: number };
}

export interface EspnPlayerPoolEntry {
  id: number;
  onTeamId: number;
  lineupLocked?: boolean;
  status?: string; // observed: "FREEAGENT", "WAIVERS" (with waiverProcessDate)
  waiverProcessDate?: number;
  player: EspnPlayer;
}

export interface EspnRosterEntry {
  playerId: number;
  lineupSlotId: number;
  injuryStatus?: string;
  playerPoolEntry: EspnPlayerPoolEntry;
}

/** league?view=mRoster. Pre-draft leagues return no `teams`. */
export interface EspnRosterResponse {
  teams?: { id: number; roster: { entries: EspnRosterEntry[] } }[];
}

export interface EspnMatchupSide {
  teamId: number;
  totalPoints: number;
  totalPointsLive?: number;
}

export interface EspnScheduleItem {
  id: number;
  matchupPeriodId: number;
  winner: string; // observed: "UNDECIDED"; presumably "HOME" | "AWAY" | "TIE" once decided
  playoffTierType: string;
  home: EspnMatchupSide;
  away?: EspnMatchupSide;
}

/** league?view=mMatchup&view=mMatchupScore */
export interface EspnMatchupsResponse {
  status: EspnStatus;
  schedule: EspnScheduleItem[];
}

/** league?view=kona_player_info with X-Fantasy-Filter */
export interface EspnFreeAgentsResponse {
  players: EspnPlayerPoolEntry[];
}

export interface EspnTransactionItem {
  type: string; // observed: ADD, DROP, TRADE, LINEUP, DRAFT
  playerId: number;
  fromTeamId: number; // 0 = none (free agency)
  toTeamId: number;
  fromLineupSlotId?: number;
  toLineupSlotId?: number;
}

/**
 * league?view=mTransactions2. Observed types: FREEAGENT, WAIVER, TRADE_PROPOSAL,
 * TRADE_DECLINE, ROSTER, FUTURE_ROSTER, DRAFT. Observed statuses: EXECUTED,
 * PENDING, CANCELED. A pending item is closed by a later transaction whose
 * relatedTransactionId points at it (CANCEL, TRADE_DECLINE, or a waiver PROCESS),
 * while the original keeps status PENDING.
 */
export interface EspnTransaction {
  id: string;
  type: string;
  status: string;
  executionType?: string; // EXECUTE | PROCESS | CANCEL
  teamId: number;
  proposedDate: number;
  processDate?: number;
  relatedTransactionId?: string;
  scoringPeriodId: number;
  items?: EspnTransactionItem[];
  teamActions?: Record<string, string>;
}

export interface EspnTransactionsResponse {
  transactions?: EspnTransaction[];
}
