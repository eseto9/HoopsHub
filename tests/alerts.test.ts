import { describe, expect, it } from "vitest";
import { activityAlerts, pushPlan } from "@/lib/alerts";
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

describe("push plan", () => {
  const league = { id: "espn:1", platform: "espn", externalId: "1", name: "Test League" } as never;
  const prefs = { tradeOffers: true, results: true, lineup: true };
  const offer = { id: "espn:1.t1", kind: "trade_offer", text: "Rivals sent you a trade offer.", date: "2026-11-01T10:00:00.000Z", urgent: true } as const;
  const won = { id: "espn:1.w1", kind: "claim_won", text: "Your claim went through: Ace Bailey added.", date: "2026-11-01T10:00:00.000Z", urgent: false } as const;
  const waiting = { id: "espn:1.o1", kind: "offer_waiting", text: "Your offer is waiting.", date: "2026-11-01T10:00:00.000Z", urgent: false } as const;

  it("sends offers and results with stable keys, never 'waiting' updates", () => {
    const plan = pushPlan([{ league, alerts: [offer, won, waiting] }], [], prefs, now);
    expect(plan.map((p) => p.key)).toEqual(["trade_offer:espn:1.t1", "claim_won:espn:1.w1"]);
    expect(plan[0]).toMatchObject({ title: "Trade offer", url: "/leagues/espn/1?tab=activity" });
  });

  it("respects each alert switch", () => {
    expect(pushPlan([{ league, alerts: [offer, won] }], [], { ...prefs, tradeOffers: false }, now).map((p) => p.key)).toEqual(["claim_won:espn:1.w1"]);
    expect(pushPlan([{ league, alerts: [offer, won] }], [], { ...prefs, results: false }, now).map((p) => p.key)).toEqual(["trade_offer:espn:1.t1"]);
  });

  it("reminds about lineups only in the 90 minutes before the first tip-off", () => {
    const tip = Date.parse("2026-11-01T23:00:00Z");
    const player = (name: string, today: boolean) =>
      ({ id: `espn:${name}`, platform: "espn", externalId: name, name, nbaTeam: "BOS", positions: ["PG"], eligibleSlots: ["PG", "UTIL", "BN"], injuryStatus: name === "hurt" ? "OUT" : undefined, schedule: { gamesThisWeek: 3, today: today ? { opponent: "NY", home: true, date: new Date(tip).toISOString() } : null } }) as never;
    const slots = [
      { teamId: "espn:1.1", slot: "PG", player: player("hurt", true) },
      { teamId: "espn:1.1", slot: "BN", player: player("sub", true) },
    ] as never;
    const rosters = [{ leagueId: "espn:1", leagueName: "Test League", url: "/x", slots }];
    expect(pushPlan([], rosters, prefs, tip - 2 * 3_600_000)).toEqual([]);
    const plan = pushPlan([], rosters, prefs, tip - 30 * 60_000);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ title: "Lineup check: Test League", body: "1 starter out. Games start soon.", url: "/my-teams?view=lineup" });
    expect(plan[0].key).toBe("lineup:espn:1:2026-11-01");
    expect(pushPlan([], rosters, { ...prefs, lineup: false }, tip - 30 * 60_000)).toEqual([]);
  });
});
