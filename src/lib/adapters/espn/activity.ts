import { unifiedId, type ActivityKind, type ActivityMove, type LeagueActivity, type Player } from "@/lib/schema";
import type { EspnTransaction, EspnTransactionsResponse } from "./raw-types";

/**
 * League activity from ESPN's mTransactions2 view (verified against real
 * league data in fixtures/espn/league-1151450222/transactions.json).
 *
 * - FREEAGENT / EXECUTED: instant pickup; items ADD (to team) and DROP (from team).
 * - WAIVER / EXECUTED with executionType PROCESS: a processed claim; its
 *   processDate is when it went through.
 * - Trades: no completed trade has been observed yet. Any EXECUTED transaction
 *   with TRADE items is treated as a completed trade (unverified).
 * - Pending items are only "pending" if no later transaction closes them via
 *   relatedTransactionId (ESPN leaves the original marked PENDING after a
 *   cancel, decline or waiver process).
 */

const leagueKey = (leagueId: string) => unifiedId("espn", leagueId);
const teamKey = (leagueId: string, teamId: number) => unifiedId("espn", `${leagueId}.${teamId}`);

export interface ActivityResult {
  /** Completed adds, drops, waiver claims and trades, newest first. */
  feed: LeagueActivity[];
  /** Still-open claims and trade offers involving the given team. */
  pendingForTeam: LeagueActivity[];
}

/** Ids of transactions that a later transaction closed (cancel, decline, process). */
export function closedIds(txns: EspnTransaction[]): Set<string> {
  return new Set(txns.flatMap((t) => (t.relatedTransactionId ? [t.relatedTransactionId] : [])));
}

function kindOf(t: EspnTransaction): ActivityKind | null {
  const items = t.items ?? [];
  if (items.some((i) => i.type === "TRADE")) return "trade";
  if (t.type === "WAIVER") return "waiver";
  if (t.type === "FREEAGENT") return "free_agent";
  return null;
}

/** Player ids worth resolving for display. */
export function activityPlayerIds(raw: EspnTransactionsResponse): number[] {
  const ids = new Set<number>();
  for (const t of raw.transactions ?? []) {
    if (!kindOf(t)) continue;
    for (const i of t.items ?? []) if (i.playerId > 0 && ["ADD", "DROP", "TRADE"].includes(i.type)) ids.add(i.playerId);
  }
  return [...ids];
}

function toActivity(t: EspnTransaction, kind: ActivityKind, status: LeagueActivity["status"], leagueId: string, players: Map<number, Player>): LeagueActivity {
  const moves: ActivityMove[] = (t.items ?? [])
    .filter((i) => ["ADD", "DROP", "TRADE"].includes(i.type))
    .map((i) => ({
      action: i.type === "ADD" ? "added" : i.type === "DROP" ? "dropped" : "traded",
      playerId: unifiedId("espn", i.playerId),
      player: players.get(i.playerId) ?? null,
      fromTeamId: i.fromTeamId > 0 ? teamKey(leagueId, i.fromTeamId) : null,
      toTeamId: i.toTeamId > 0 ? teamKey(leagueId, i.toTeamId) : null,
    }));
  const teams = new Set<string>([teamKey(leagueId, t.teamId)]);
  for (const m of moves) {
    if (m.fromTeamId) teams.add(m.fromTeamId);
    if (m.toTeamId) teams.add(m.toTeamId);
  }
  return {
    id: unifiedId("espn", `${leagueId}.${t.id}`),
    leagueId: leagueKey(leagueId),
    kind,
    status,
    date: new Date(t.processDate ?? t.proposedDate).toISOString(),
    teamId: teamKey(leagueId, t.teamId),
    teamIds: [...teams] as LeagueActivity["teamIds"],
    moves,
  };
}

export function normalizeActivity(
  raw: EspnTransactionsResponse,
  leagueId: string,
  players: Map<number, Player>,
  myTeamId?: string,
): ActivityResult {
  const txns = raw.transactions ?? [];
  const closed = closedIds(txns);
  const feed: LeagueActivity[] = [];
  const pendingForTeam: LeagueActivity[] = [];

  for (const t of txns) {
    const kind = kindOf(t);
    if (!kind) continue;
    if (t.status === "EXECUTED") {
      feed.push(toActivity(t, kind, "completed", leagueId, players));
    } else if (t.status === "PENDING" && !closed.has(t.id) && myTeamId) {
      const a = toActivity(t, kind, "pending", leagueId, players);
      // Other teams' open offers and claims stay private, as on ESPN.
      if (a.teamIds.includes(teamKey(leagueId, Number(myTeamId)))) pendingForTeam.push(a);
    }
  }
  const newest = (a: LeagueActivity, b: LeagueActivity) => b.date.localeCompare(a.date);
  return { feed: feed.sort(newest), pendingForTeam: pendingForTeam.sort(newest) };
}
