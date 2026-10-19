import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { draftPlayerIds, normalizeOverview } from "@/lib/adapters/espn/overview";
import type { EspnLeagueSettingsResponse, EspnMatchupsResponse, EspnProTeamsResponse, EspnTransactionsResponse } from "@/lib/adapters/espn/raw-types";

const dir = path.join(__dirname, "..", "..", "fixtures", "espn");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

const LEAGUE = "1151450222";
const settings = load<EspnLeagueSettingsResponse>(`league-${LEAGUE}/settings.json`);
const txns = load<EspnTransactionsResponse>(`league-${LEAGUE}/transactions.json`);
const o = normalizeOverview(settings, load<EspnMatchupsResponse>(`league-${LEAGUE}/matchups.json`), txns, load<EspnProTeamsResponse>("pro-teams-2027.json"), new Map(), Date.parse("2026-10-19T16:00:00Z"));

describe("ESPN league overview", () => {
  it("orders waivers 1..12 with each team's transaction counts", () => {
    expect(o.waiverOrder.map((w) => w.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const t = settings.teams.find((x) => x.waiverRank === 2)!;
    expect(o.waiverOrder[1]).toMatchObject({ teamId: `espn:${LEAGUE}.${t.id}`, trades: t.transactionCounter!.trades });
  });

  it("builds the snake draft board from DRAFT transactions", () => {
    expect(o.draft).toHaveLength(156);
    expect(o.draft.map((p) => p.overall)).toEqual(Array.from({ length: 156 }, (_, i) => i + 1));
    expect(o.draft[12]).toMatchObject({ round: 2, pick: 1 });
    // Snake: the last pick of round 1 also has the first pick of round 2.
    expect(o.draft[12].teamId).toBe(o.draft[11].teamId);
    expect(new Set(o.draft.slice(0, 12).map((p) => p.teamId)).size).toBe(12);
    expect(draftPlayerIds(txns)).toHaveLength(156);
  });

  it("lists 17 regular weeks with dates and 6 games each, then the playoff rounds", () => {
    const regular = o.schedule.filter((w) => !w.playoff);
    expect(regular).toHaveLength(17);
    expect(regular.every((w) => w.games.length === 6 && w.start && w.end && w.start <= w.end)).toBe(true);
    // Opening day Tue Oct 20 through Sunday, then Monday-Sunday weeks (matches espn.com: "Matchup 18 (Feb 15 - 28)" for a 2-week unit).
    expect(regular[0]).toMatchObject({ start: "2026-10-20", end: "2026-10-25" });
    expect(regular[1]).toMatchObject({ start: "2026-10-26", end: "2026-11-01" });
    expect(o.schedule.find((w) => w.period === 18)).toMatchObject({ start: "2027-02-15", end: "2027-02-28" });
    expect(o.schedule.filter((w) => w.playoff).map((w) => w.label)).toEqual(["Playoffs Round 1", "Playoffs Round 2", "Playoffs Round 3"]);
    // Pre-season: no scores yet.
    expect(regular[0].games.every((g) => g.homeScore === undefined)).toBe(true);
  });

  it("describes the rules and points per stat", () => {
    const rows = Object.fromEntries(o.rules.flatMap((g) => g.rows.map((r) => [r.label, r.value])));
    expect(rows).toMatchObject({ Format: "Head-to-head points", "Votes to veto": "4", Type: "Snake", "Playoff teams": "6", "Waivers process": "Sunday" });
    expect(o.scoring).toContainEqual({ label: "TO", points: -2 });
    expect(o.scoring).toHaveLength(13);
  });
});
