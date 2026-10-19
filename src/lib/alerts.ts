import type { LeagueActivity, Team } from "@/lib/schema";
import type { DashboardAlert } from "@/lib/schema/views";

const RECENT_MS = 48 * 3_600_000;

/**
 * Dashboard alerts from a league's activity: offers waiting on you or on the
 * other manager, your open claims, and in the last 48 hours your processed
 * claims and completed trades.
 */
export function activityAlerts(
  activity: { feed: LeagueActivity[]; pendingForTeam: LeagueActivity[] },
  myTeamId: string,
  teams: Pick<Team, "id" | "name">[],
  now: number,
): DashboardAlert[] {
  const name = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "another team";
  const players = (a: LeagueActivity, action: string) =>
    a.moves
      .filter((m) => m.action === action)
      .map((m) => m.player?.name ?? "a player")
      .join(", ");
  const out: DashboardAlert[] = [];

  for (const a of activity.pendingForTeam) {
    if (a.kind === "trade") {
      const other = a.teamIds.find((id) => id !== myTeamId) ?? null;
      if (a.teamId === myTeamId) out.push({ kind: "offer_waiting", text: `Your trade offer to ${name(other)} is waiting for a reply.`, date: a.date, urgent: false });
      else out.push({ kind: "trade_offer", text: `${name(a.teamId)} sent you a trade offer.`, date: a.date, urgent: true });
    } else if (a.kind === "waiver" && a.teamId === myTeamId) {
      out.push({ kind: "claim_pending", text: `Waiver claim for ${players(a, "added")} is pending.`, date: a.date, urgent: false });
    }
  }

  for (const a of activity.feed) {
    if (now - Date.parse(a.date) > RECENT_MS || !a.teamIds.includes(myTeamId as LeagueActivity["teamIds"][number])) continue;
    if (a.kind === "waiver" && a.teamId === myTeamId) out.push({ kind: "claim_won", text: `Your claim went through: ${players(a, "added")} added.`, date: a.date, urgent: false });
    if (a.kind === "trade") out.push({ kind: "trade_done", text: `Trade completed with ${name(a.teamIds.find((id) => id !== myTeamId) ?? null)}.`, date: a.date, urgent: false });
  }

  return out.sort((x, y) => Number(y.urgent) - Number(x.urgent) || y.date.localeCompare(x.date));
}
