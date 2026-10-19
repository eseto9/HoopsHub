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

/** Observed success: HTTP 200 with status "EXECUTED". */
export interface EspnTransactionResponse {
  id?: string;
  status?: string;
  isPending?: boolean;
}
