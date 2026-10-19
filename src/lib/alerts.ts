import { lineupIssues } from "@/lib/hub";
import type { LeagueActivity, RosterSlot, Team } from "@/lib/schema";
import type { DashboardAlert, DashboardLeague } from "@/lib/schema/views";

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
      if (a.accepted) out.push({ id: a.id, kind: "offer_waiting", text: `Trade with ${name(other === myTeamId ? a.teamId : other)} accepted; waiting on league review.`, date: a.date, urgent: false });
      else if (a.teamId === myTeamId) out.push({ id: a.id, kind: "offer_waiting", text: `Your trade offer to ${name(other)} is waiting for a reply.`, date: a.date, urgent: false });
      else out.push({ id: a.id, kind: "trade_offer", text: `${name(a.teamId)} sent you a trade offer.`, date: a.date, urgent: true });
    } else if (a.kind === "waiver" && a.teamId === myTeamId) {
      out.push({ id: a.id, kind: "claim_pending", text: `Waiver claim for ${players(a, "added")} is pending.`, date: a.date, urgent: false });
    }
  }

  for (const a of activity.feed) {
    if (now - Date.parse(a.date) > RECENT_MS || !a.teamIds.includes(myTeamId as LeagueActivity["teamIds"][number])) continue;
    if (a.kind === "waiver" && a.teamId === myTeamId) out.push({ id: a.id, kind: "claim_won", text: `Your claim went through: ${players(a, "added")} added.`, date: a.date, urgent: false });
    if (a.kind === "trade") out.push({ id: a.id, kind: "trade_done", text: `Trade completed with ${name(a.teamIds.find((id) => id !== myTeamId) ?? null)}.`, date: a.date, urgent: false });
  }

  return out.sort((x, y) => Number(y.urgent) - Number(x.urgent) || y.date.localeCompare(x.date));
}

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

export interface AlertPrefs {
  tradeOffers: boolean;
  results: boolean;
  lineup: boolean;
}

export interface PushMessage {
  /** Stable id, so each alert is sent once. */
  key: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** How long before a league's first tip-off the lineup reminder goes out. */
export const LINEUP_LEAD_MS = 90 * 60_000;

const etDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));

/**
 * What to push right now, from the dashboard's alerts and each league's
 * roster. Trade offers to you; your claims and trades going through; and a
 * lineup reminder once a day per league, in the 90 minutes before your first
 * player tips off, when Lineup Check finds something.
 */
export function pushPlan(
  leagues: (Pick<DashboardLeague, "league" | "alerts">)[],
  rosters: { leagueId: string; leagueName: string; url: string; slots: RosterSlot[] }[],
  prefs: AlertPrefs,
  now: number,
): PushMessage[] {
  const out: PushMessage[] = [];
  for (const l of leagues) {
    const url = `/leagues/${l.league.platform}/${l.league.externalId}?tab=activity`;
    for (const a of l.alerts ?? []) {
      if (a.kind === "trade_offer" && prefs.tradeOffers) out.push({ key: `${a.kind}:${a.id}`, title: "Trade offer", body: `${a.text} (${l.league.name})`, url, tag: a.id });
      if ((a.kind === "claim_won" || a.kind === "trade_done") && prefs.results) {
        out.push({ key: `${a.kind}:${a.id}`, title: a.kind === "claim_won" ? "Waiver claim" : "Trade completed", body: `${a.text} (${l.league.name})`, url, tag: a.id });
      }
    }
  }
  if (prefs.lineup) {
    for (const r of rosters) {
      const tips = r.slots.flatMap((s) => (s.player?.schedule?.today ? [Date.parse(s.player.schedule.today.date)] : []));
      if (!tips.length) continue;
      const first = Math.min(...tips);
      if (now < first - LINEUP_LEAD_MS || now > first) continue;
      const issues = lineupIssues(r.slots);
      if (!issues.length) continue;
      const out_ = issues.filter((i) => i.kind === "out").length;
      const noGame = issues.filter((i) => i.kind === "no_game").length;
      const empty = issues.filter((i) => i.kind === "empty").length;
      const parts = [out_ && `${out_} starter${out_ > 1 ? "s" : ""} out`, noGame && `${noGame} without a game`, empty && `${empty} empty slot${empty > 1 ? "s" : ""}`].filter(Boolean);
      out.push({
        key: `lineup:${r.leagueId}:${etDay(now)}`,
        title: `Lineup check: ${r.leagueName}`,
        body: `${parts.join(", ")}. Games start soon.`,
        url: "/my-teams?view=lineup",
        tag: `lineup:${r.leagueId}`,
      });
    }
  }
  return out;
}
