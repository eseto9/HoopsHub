import type { LineupChange } from "../types";
import { LINEUP_SLOTS } from "./constants";

/**
 * ESPN write requests, built from real captures in fixtures/espn/writes.
 * Endpoint: POST lm-api-writes.fantasy.espn.com/.../leagues/{id}/transactions/
 */

export const ESPN_WRITES = "https://lm-api-writes.fantasy.espn.com/apis/v3/games/fba";

export function transactionsUrl(season: number, leagueId: string) {
  return `${ESPN_WRITES}/seasons/${season}/segments/0/leagues/${leagueId}/transactions/`;
}

const SLOT_ID: Record<string, number> = Object.fromEntries(Object.entries(LINEUP_SLOTS).map(([id, label]) => [label, Number(id)]));

export function slotId(label: string): number {
  const id = SLOT_ID[label];
  if (id === undefined) throw new Error(`Unknown lineup slot "${label}"`);
  return id;
}

/** Body observed when ESPN's own site saves a lineup move (type ROSTER, items of type LINEUP). */
export function buildLineupTransaction(opts: {
  teamId: number;
  memberId: string;
  scoringPeriodId: number;
  changes: LineupChange[];
}) {
  return {
    isLeagueManager: false,
    teamId: opts.teamId,
    type: "ROSTER",
    memberId: opts.memberId,
    scoringPeriodId: opts.scoringPeriodId,
    executionType: "EXECUTE",
    items: opts.changes.map((c) => ({
      playerId: Number(c.playerId),
      type: "LINEUP",
      fromLineupSlotId: slotId(c.fromSlot),
      toLineupSlotId: slotId(c.toSlot),
    })),
  };
}

/**
 * Add (with optional drop). "WAIVER" matches the captured claim exactly
 * (fixtures/espn/writes/waiver-claim.json). "FREEAGENT" (instant pickup) uses
 * the same body with the type ESPN records for free-agent moves in
 * mTransactions2; that request itself has not been captured yet.
 */
export function buildAddDrop(opts: {
  type: "WAIVER" | "FREEAGENT";
  teamId: number;
  memberId: string;
  scoringPeriodId: number;
  addPlayerId: number;
  dropPlayerId?: number;
}) {
  const items: { playerId: number; type: "ADD" | "DROP"; toTeamId?: number; fromTeamId?: number }[] = [
    { playerId: opts.addPlayerId, type: "ADD", toTeamId: opts.teamId },
  ];
  if (opts.dropPlayerId) items.push({ playerId: opts.dropPlayerId, type: "DROP", fromTeamId: opts.teamId });
  return {
    isLeagueManager: false,
    teamId: opts.teamId,
    type: opts.type,
    memberId: opts.memberId,
    scoringPeriodId: opts.scoringPeriodId,
    executionType: "EXECUTE",
    items,
    bidAmount: null,
  };
}

/** Trade offer, as captured (fixtures/espn/writes/trade-proposal.json). */
export function buildTradeProposal(opts: {
  teamId: number;
  memberId: string;
  scoringPeriodId: number;
  otherTeamId: number;
  sendPlayerIds: number[];
  receivePlayerIds: number[];
  expirationDate: string; // ISO
  comment?: string;
}) {
  return {
    isLeagueManager: false,
    teamId: opts.teamId,
    type: "TRADE_PROPOSAL",
    memberId: opts.memberId,
    scoringPeriodId: opts.scoringPeriodId,
    executionType: "EXECUTE",
    items: [
      ...opts.receivePlayerIds.map((playerId) => ({ playerId, type: "TRADE", fromTeamId: opts.otherTeamId, toTeamId: opts.teamId })),
      ...opts.sendPlayerIds.map((playerId) => ({ playerId, type: "TRADE", fromTeamId: opts.teamId, toTeamId: opts.otherTeamId })),
    ],
    expirationDate: opts.expirationDate,
    comment: opts.comment ?? "",
  };
}

/** Cancel your own pending claim or trade offer (both captured). */
export function buildCancel(opts: {
  type: "WAIVER" | "TRADE_PROPOSAL";
  teamId: number;
  memberId: string;
  scoringPeriodId: number;
  relatedTransactionId: string;
}) {
  return {
    isLeagueManager: false,
    teamId: opts.teamId,
    type: opts.type,
    memberId: opts.memberId,
    scoringPeriodId: opts.scoringPeriodId,
    executionType: "CANCEL",
    relatedTransactionId: opts.relatedTransactionId,
  };
}

/**
 * Answer a trade offer made to you. Decline captured from espn.com
 * (fixtures/espn/writes/trade-decline.json); accept is the same body with
 * type TRADE_ACCEPT, sent live and confirmed by ESPN
 * (fixtures/espn/writes/trade-accept.json). The accept reply has no status.
 */
export function buildTradeResponse(opts: { accept: boolean; teamId: number; memberId: string; scoringPeriodId: number; relatedTransactionId: string }) {
  return {
    isLeagueManager: false,
    teamId: opts.teamId,
    type: opts.accept ? "TRADE_ACCEPT" : "TRADE_DECLINE",
    memberId: opts.memberId,
    scoringPeriodId: opts.scoringPeriodId,
    executionType: "EXECUTE",
    comment: "",
    relatedTransactionId: opts.relatedTransactionId,
  };
}

/** Observed: HTTP 200 with status "EXECUTED" (lineups), "PENDING" (claims, offers) or "CANCELED". */
export interface EspnTransactionResponse {
  id?: string;
  status?: string;
  isPending?: boolean;
}
