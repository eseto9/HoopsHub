import { unifiedId, type ActivityKind, type ActivityMove, type LeagueActivity, type Player } from "@/lib/schema";
import { LINEUP_SLOTS } from "./constants";
import type { EspnCommunicationResponse, EspnTransaction, EspnTransactionsResponse } from "./raw-types";

/**
 * League activity from ESPN's mTransactions2 view (verified against real
 * league data in fixtures/espn/league-1151450222/transactions.json).
 *
 * - FREEAGENT / EXECUTED: instant pickup; items ADD (to team) and DROP (from team).
 * - WAIVER / EXECUTED with executionType PROCESS: a processed claim; its
 *   processDate is when it went through.
 * - ROSTER (today) and FUTURE_ROSTER (a later day) / EXECUTED: lineup moves,
 *   items of type LINEUP with from/to slot ids.
 * - Trades: no completed trade has been observed yet. Any EXECUTED transaction
 *   with TRADE items is treated as a completed trade (unverified).
 * - Pending items are only "pending" if no later transaction closes them via
 *   relatedTransactionId (ESPN leaves the original marked PENDING after a
 *   cancel, decline or waiver process).
 *
 * League-wide messages (renames, trade availability, draft) come from the
 * communication feed; see normalizeCommunication.
 */

const leagueKey = (leagueId: string) => unifiedId("espn", leagueId);
const teamKey = (leagueId: string, teamId: number) => unifiedId("espn", `${leagueId}.${teamId}`);
const MOVE_TYPES = ["ADD", "DROP", "TRADE", "LINEUP"];

export interface ActivityResult {
  /** Completed adds, drops, waiver claims, trades and lineup moves, newest first. */
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
  if ((t.type === "ROSTER" || t.type === "FUTURE_ROSTER") && items.some((i) => i.type === "LINEUP")) return "lineup";
  return null;
}

/** Player ids worth resolving for display. */
export function activityPlayerIds(raw: EspnTransactionsResponse): number[] {
  const ids = new Set<number>();
  for (const t of raw.transactions ?? []) {
    if (!kindOf(t)) continue;
    for (const i of t.items ?? []) if (i.playerId > 0 && MOVE_TYPES.includes(i.type)) ids.add(i.playerId);
  }
  return [...ids];
}

const slotLabel = (id: number | undefined) => (id !== undefined && id >= 0 ? LINEUP_SLOTS[id] : undefined);

function toActivity(t: EspnTransaction, kind: ActivityKind, status: LeagueActivity["status"], leagueId: string, players: Map<number, Player>): LeagueActivity {
  const moves: ActivityMove[] = (t.items ?? [])
    .filter((i) => MOVE_TYPES.includes(i.type))
    .map((i) => ({
      action: i.type === "ADD" ? "added" : i.type === "DROP" ? "dropped" : i.type === "LINEUP" ? "moved" : "traded",
      fromSlot: i.type === "LINEUP" ? slotLabel(i.fromLineupSlotId) : undefined,
      toSlot: i.type === "LINEUP" ? slotLabel(i.toLineupSlotId) : undefined,
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
  // An accept (TRADE_ACCEPT, observed) points at the offer but doesn't end it:
  // the offer stays PENDING through league review.
  const accepted = new Set(txns.filter((t) => t.type === "TRADE_ACCEPT").flatMap((t) => (t.relatedTransactionId ? [t.relatedTransactionId] : [])));
  const closed = closedIds(txns.filter((t) => t.type !== "TRADE_ACCEPT"));
  const feed: LeagueActivity[] = [];
  const pendingForTeam: LeagueActivity[] = [];

  for (const t of txns) {
    const kind = kindOf(t);
    if (!kind) continue;
    if (t.status === "EXECUTED") {
      feed.push(toActivity(t, kind, "completed", leagueId, players));
    } else if (t.status === "PENDING" && kind !== "lineup" && !closed.has(t.id) && myTeamId) {
      const a = toActivity(t, kind, "pending", leagueId, players);
      if (accepted.has(t.id)) a.accepted = true;
      // Other teams' open offers and claims stay private, as on ESPN.
      if (a.teamIds.includes(teamKey(leagueId, Number(myTeamId)))) pendingForTeam.push(a);
    }
  }
  const newest = (a: LeagueActivity, b: LeagueActivity) => b.date.localeCompare(a.date);
  return { feed: feed.sort(newest), pendingForTeam: pendingForTeam.sort(newest) };
}

// ---------------------------------------------------------------------------
// League messages from the communication feed
// ---------------------------------------------------------------------------

/** Player ids mentioned by league messages (trade availability). */
export function communicationPlayerIds(raw: EspnCommunicationResponse): number[] {
  const ids = new Set<number>();
  for (const t of raw.topics ?? []) for (const m of t.messages) if (m.messageTypeId === 252 && typeof m.for === "number") ids.add(m.for);
  return [...ids];
}

const draftDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

/**
 * League-wide messages: team renames (164), abbreviation changes (162),
 * team name set at setup (166), league rename (156), draft time moved (111,
 * from/to are epoch ms), trade availability (252), draft completed (119).
 * Other settings/status messages carry no readable detail (bare ids) and
 * read "League settings updated."
 * Transactions and lineup moves are skipped here because mTransactions2 has
 * the full detail.
 */
export function normalizeCommunication(
  raw: EspnCommunicationResponse,
  leagueId: string,
  players: Map<number, Player>,
  teamName: (teamId: number) => string,
): LeagueActivity[] {
  const out: LeagueActivity[] = [];
  for (const t of raw.topics ?? []) {
    if (t.type !== "ACTIVITY_SETTINGS" && t.type !== "ACTIVITY_STATUS") continue;
    const lines: string[] = [];
    const teams = new Set<number>();
    for (const m of t.messages) {
      switch (m.messageTypeId) {
        case 164:
          lines.push(`Renamed team ${m.from} to ${m.to}.`);
          if (m.targetId) teams.add(m.targetId);
          break;
        case 162:
          lines.push(`Changed team abbreviation from ${m.from} to ${m.to}.`);
          if (m.targetId) teams.add(m.targetId);
          break;
        case 252: {
          const p = typeof m.for === "number" ? players.get(m.for) : undefined;
          const team = m.targetId ? teamName(m.targetId) : "A team";
          lines.push(`${team} changed trade availability for ${p ? `${p.name} (${p.nbaTeam ?? "FA"})` : "a player"}.`);
          if (m.targetId) teams.add(m.targetId);
          break;
        }
        case 166:
          lines.push(`Changed team name from ${m.from} to ${m.to}.`);
          if (m.targetId) teams.add(m.targetId);
          break;
        case 156:
          lines.push(`Renamed the league from ${m.from} to ${m.to}.`);
          break;
        case 111:
          if (typeof m.to === "number") lines.push(`Moved the draft to ${draftDate.format(new Date(m.to))}.`);
          break;
        case 119:
          lines.push("Draft completed.");
          break;
        default:
          lines.push(t.type === "ACTIVITY_STATUS" ? "League status updated." : "League settings updated.");
      }
    }
    const teamIds = [...teams].map((id) => teamKey(leagueId, id));
    const text = [...new Set(lines)];
    // ESPN sometimes posts the same message several times within seconds.
    const dupe = out.find((o) => o.teamId === (teamIds[0] ?? null) && Math.abs(Date.parse(o.date) - t.date) < 300_000 && o.lines?.join() === text.join());
    if (dupe) continue;
    out.push({
      id: unifiedId("espn", `${leagueId}.comm.${t.id}`),
      leagueId: leagueKey(leagueId),
      kind: "league",
      status: "completed",
      date: new Date(t.date).toISOString(),
      teamId: teamIds[0] ?? null,
      teamIds: teamIds as LeagueActivity["teamIds"],
      moves: [],
      lines: text,
    });
  }
  return out;
}
