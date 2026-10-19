import type {
  League,
  Matchup,
  Platform,
  Player,
  RosterSlot,
  StandingsRow,
  Team,
} from "@/lib/schema";

/**
 * Server-only context handed to adapters. `credentials` is the decrypted
 * credential blob for this connection (never sent to the client).
 */
export interface AdapterConnection {
  id: string;
  userId: string;
  platform: Platform;
  externalUserId: string;
  credentials: Record<string, string> | null;
  /**
   * Team the user picked per league (external league id -> external team id),
   * for platforms that can't identify the user, e.g. public ESPN leagues.
   */
  myTeamByLeague?: Record<string, string>;
}

/** Result of `connect`: what the platform says about the user. */
export interface ConnectResult {
  externalUserId: string;
  displayName: string;
  /** Plaintext credentials to be encrypted by the caller before storage. */
  credentials: Record<string, string> | null;
}

export interface FreeAgentQuery {
  position?: string;
  search?: string;
  limit?: number;
}

export interface RosterResult {
  team: Team;
  slots: RosterSlot[];
}

/** What a platform adapter can do. The UI hides controls for missing capabilities. */
export interface AdapterCapabilities {
  freeAgents: boolean;
  setLineup: boolean;
  addDrop: boolean;
  trades: boolean;
}

/** Write-side inputs (Phase 5). Shapes will be finalized against real platform data. */
export interface LineupChange {
  playerId: string;
  toSlot: string;
}
export interface TradeProposal {
  toTeamId: string;
  sendPlayerIds: string[];
  receivePlayerIds: string[];
  message?: string;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly capabilities: AdapterCapabilities;

  connect(userId: string, input: Record<string, string>): Promise<ConnectResult>;
  listLeagues(conn: AdapterConnection): Promise<League[]>;
  getLeague(conn: AdapterConnection, leagueId: string): Promise<League>;
  getTeams(conn: AdapterConnection, leagueId: string): Promise<Team[]>;
  getRoster(conn: AdapterConnection, leagueId: string, teamId: string): Promise<RosterResult>;
  getMatchups(conn: AdapterConnection, leagueId: string, period?: number): Promise<Matchup[]>;
  getStandings(conn: AdapterConnection, leagueId: string): Promise<StandingsRow[]>;
  getFreeAgents(conn: AdapterConnection, leagueId: string, query?: FreeAgentQuery): Promise<Player[]>;

  // Phase 5 write operations. Optional; presence must match `capabilities`.
  setLineup?(conn: AdapterConnection, leagueId: string, teamId: string, changes: LineupChange[]): Promise<void>;
  addDrop?(conn: AdapterConnection, leagueId: string, addPlayerId: string | null, dropPlayerId: string | null): Promise<void>;
  proposeTrade?(conn: AdapterConnection, leagueId: string, proposal: TradeProposal): Promise<void>;
  respondToTrade?(conn: AdapterConnection, leagueId: string, tradeId: string, accept: boolean): Promise<void>;
}
