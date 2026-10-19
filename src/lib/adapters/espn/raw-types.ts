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
  /** Scoring period (day) -> games that day. */
  proGamesByScoringPeriod?: Record<string, { id?: number; date: number; homeProTeamId: number; awayProTeamId: number; scoringPeriodId?: number }[]>;
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
  /** 1 = first waiver claim (observed in mTeam). */
  waiverRank?: number;
  /** Observed (mTeam): {} when empty, else {players: {"6440": "ON_THE_BLOCK"}}. */
  tradeBlock?: { players?: Record<string, string> };
  transactionCounter?: { acquisitions: number; drops: number; trades: number; moveToIR: number; moveToActive: number };
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
  rosterSettings: {
    lineupSlotCounts: Record<string, number>;
    isBenchUnlimited?: boolean;
    moveLimit?: number; // -1 = none
    lineupLocktimeType?: string; // observed: INDIVIDUAL_GAME
  };
  scheduleSettings: {
    matchupPeriodCount: number;
    matchupPeriods: Record<string, number[]>; // matchup period -> scoring periods (days)
    playoffTeamCount?: number;
    playoffSeedingRule?: string; // observed: TOTAL_POINTS_SCORED
    playoffMatchupPeriodLength?: number;
  };
  /** Observed in mSettings; all fields seen in fixtures/espn/.../settings.json. */
  acquisitionSettings?: {
    acquisitionType: string; // observed: WAIVERS_TRADITIONAL
    acquisitionLimit: number; // -1 = none
    matchupAcquisitionLimit?: number;
    waiverHours: number;
    waiverProcessDays: string[]; // observed: ["SUNDAY"]
    waiverProcessHour: number;
    isUsingAcquisitionBudget: boolean;
    acquisitionBudget: number;
  };
  tradeSettings?: { deadlineDate: number; vetoVotesRequired: number; revisionHours: number; max: number };
  draftSettings?: {
    type: string; // observed: SNAKE
    date: number;
    timePerSelection: number; // seconds
    pickOrder: number[]; // team ids in first-round order
    keeperCount: number;
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
  /** Split 5 (per game): the NBA game id. */
  externalId?: string;
  proTeamId?: number;
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
  ownership?: { percentOwned: number; percentStarted: number; percentChange?: number; averageDraftPosition: number };
  /** Epoch ms of ESPN's latest news on the player (observed in mRoster). */
  lastNewsDate?: number;
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
  /** DRAFT items. */
  overallPickNumber?: number;
  isKeeper?: boolean;
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
  /** Missing on TRADE_ACCEPT records (observed). */
  status?: string;
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

/**
 * Communication feed (lm-api-communication .../communication/?view=kona_league_communication).
 * Message meanings verified against espn.com Recent Activity: 164 team renamed
 * (from/to names, targetId team), 162 abbreviation changed, 252 trade
 * availability changed (targetId team, for = player), 119 draft completed,
 * 188 lineup move. Transactions also appear here but come from mTransactions2.
 */
export interface EspnCommunicationMessage {
  messageTypeId: number;
  date: number;
  from?: number | string;
  to?: number | string;
  targetId?: number;
  for?: number;
}

export interface EspnCommunicationResponse {
  topics?: { id: string; type: string; date: number; targetId?: number; messages: EspnCommunicationMessage[] }[];
}

/**
 * league?view=kona_playercard with X-Fantasy-Filter
 * {players:{filterIds, filterStatsForTopScoringPeriodIds:{value:82, additionalValue:[...]}}}
 * (captured from espn.com). Stats include split 5 entries: one per game
 * (externalId = NBA game id, scoringPeriodId = day), plus splits 1-3.
 */
export interface EspnPlayerCardResponse {
  players: (EspnPlayerPoolEntry & { player: EspnPlayer & { seasonOutlook?: string; jersey?: string } })[];
}

/** site.api.espn.com/apis/fantasy/v3/games/fba/news/players?days=30&playerId= (public). */
export interface EspnNewsResponse {
  news: {
    feed: {
      id: number;
      type: string; // observed: Rotowire, Media, Story
      headline: string;
      story?: string;
      description?: string;
      published: string;
      premium?: boolean;
      links?: { web?: { href: string } };
    }[];
  };
}
