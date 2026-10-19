import { describe, expect, it } from "vitest";
import { activityAlerts } from "@/lib/alerts";
import type { LeagueActivity } from "@/lib/schema";

const me = "espn:1.12" as const;
const them = "espn:1.3" as const;
const teams = [
  { id: me, name: "Mine" },
  { id: them, name: "Rivals" },
];
const base = { leagueId: "espn:1", status: "pending", moves: [] } as const;
const now = Date.parse("2026-11-01T12:00:00Z");
const act = (x: Partial<LeagueActivity>): LeagueActivity => ({ ...base, id: "espn:1.x", kind: "trade", date: "2026-11-01T10:00:00.000Z", teamId: me, teamIds: [me, them], ...x }) as LeagueActivity;

describe("dashboard alerts", () => {
  it("puts trade offers to you first and marks them urgent", () => {
    const alerts = activityAlerts(
      { feed: [], pendingForTeam: [act({ teamId: me, date: "2026-11-01T11:00:00.000Z" }), act({ teamId: them })] },
      me,
      teams,
      now,
    );
    expect(alerts.map((a) => [a.kind, a.urgent])).toEqual([["trade_offer", true], ["offer_waiting", false]]);
    expect(alerts[0].text).toBe("Rivals sent you a trade offer.");
  });

  it("reports your pending claim and recent results, ignoring old ones", () => {
    const player = { id: "espn:7", name: "Ace Bailey" } as never;
    const claim = act({ kind: "waiver", teamIds: [me], moves: [{ action: "added", playerId: "espn:7", player, fromTeamId: null, toTeamId: me }] });
    const done = { ...claim, status: "completed" as const };
    const old = { ...done, date: "2026-10-20T00:00:00.000Z" };
    const alerts = activityAlerts({ feed: [done, old], pendingForTeam: [claim] }, me, teams, now);
    expect(alerts.map((a) => a.kind)).toEqual(["claim_pending", "claim_won"]);
    expect(alerts[1].text).toBe("Your claim went through: Ace Bailey added.");
  });

  it("shows an accepted offer as waiting on review, not as a new offer", () => {
    const alerts = activityAlerts({ feed: [], pendingForTeam: [act({ teamId: them, accepted: true })] }, me, teams, now);
    expect(alerts).toEqual([expect.objectContaining({ kind: "offer_waiting", urgent: false, text: "Trade with Rivals accepted; waiting on league review." })]);
  });

  it("ignores other teams' moves", () => {
    expect(activityAlerts({ feed: [act({ kind: "waiver", status: "completed", teamId: them, teamIds: [them] })], pendingForTeam: [] }, me, teams, now)).toEqual([]);
  });
});
