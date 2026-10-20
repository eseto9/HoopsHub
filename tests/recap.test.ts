import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeMatchups, normalizeStandings, normalizeTeams } from "@/lib/adapters/espn/normalize";
import type { EspnLeagueSettingsResponse, EspnMatchupsResponse } from "@/lib/adapters/espn/raw-types";
import { recapLeague, recapSummary } from "@/lib/recap";
import type { Matchup } from "@/lib/schema";

const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", "espn", rel), "utf8")) as T;

// A finished public H2H categories league (2025-26).
const ID = "1382487116";
const settings = load<EspnLeagueSettingsResponse>(`league-${ID}/settings.json`);
const raw = load<EspnMatchupsResponse>(`league-${ID}/matchups.json`);
const cats = new Set(settings.settings.scoringSettings.scoringItems.map((i) => i.statId));
const teams = normalizeTeams(settings, { leagueId: ID, connectionId: "c" });
const standings = normalizeStandings(settings);
const league = { id: `espn:${ID}`, name: "Cats League", platform: "espn", externalId: ID, format: "h2h-categories" } as const;

describe("weekly recap (category league)", () => {
  const week1 = normalizeMatchups(raw, Number(ID), 1, true, cats);
  const week2 = normalizeMatchups(raw, Number(ID), 2, true, cats);

  it("reports each team's week-1 result, matching ESPN's winner", () => {
    for (const t of teams) {
      const r = recapLeague({ league, myTeamId: t.id, teams, lastWeek: week1, standing: standings.find((s) => s.teamId === t.id), thisWeek: null, slots: [] })!;
      const m = week1.find((x) => x.home.teamId === t.id || x.away?.teamId === t.id)!;
      const home = m.home.teamId === t.id;
      const expected = m.winner === "tie" ? "tie" : (m.winner === "home") === home ? "win" : "loss";
      expect(r.outcome).toBe(expected);
      expect(r.week).toBe(1);
      expect(r.myScore).toMatch(/^\d+-\d+-\d+$/);
      expect(r.weekRank).toBeUndefined(); // only for points leagues
    }
  });

  it("names next week's opponent", () => {
    const me = teams[0];
    const r = recapLeague({ league, myTeamId: me.id, teams, lastWeek: week1, thisWeek: week2.find((x) => x.home.teamId === me.id || x.away?.teamId === me.id), slots: [] })!;
    expect(r.next?.oppName).toBeTruthy();
    expect(r.next?.oppName).not.toBe(me.name);
  });

  it("summarizes across leagues", () => {
    const rows = teams.slice(0, 3).map((t) => recapLeague({ league, myTeamId: t.id, teams, lastWeek: week1, slots: [] })!);
    const s = recapSummary(rows);
    expect(s.wins + s.losses + s.ties).toBe(3);
    expect(s.text).toMatch(/last week across 3 leagues$/);
  });
});

describe("weekly recap (points league)", () => {
  const side = (team: string, score: number, playerPoints?: Record<string, number>) => ({ teamId: `espn:1.${team}` as const, score, playerPoints });
  const final = (id: string, a: ReturnType<typeof side>, b: ReturnType<typeof side>): Matchup => ({ id: `espn:1.${id}`, leagueId: "espn:1", period: 3, home: a, away: b, status: "final" });
  const lastWeek = [final("a", side("1", 501.5, { "10": 60, "11": 72.5, "12": 12 }), side("2", 480)), final("b", side("3", 610), side("4", 350))];
  const teams4 = ["1", "2", "3", "4"].map((n) => ({ id: `espn:1.${n}` as const, name: `Team ${n}` }));
  const player = (id: string, name: string) => ({ id: `espn:${id}`, platform: "espn", externalId: id, name, nbaTeam: "BOS", positions: ["PG"] }) as never;
  const slots = [
    { teamId: "espn:1.1", slot: "PG", player: player("10", "A") },
    { teamId: "espn:1.1", slot: "SG", player: player("11", "B") },
    { teamId: "espn:1.1", slot: "BN", player: player("12", "C") },
  ] as never;

  it("ranks your weekly score in the league and lists your top performers", () => {
    const r = recapLeague({ league: { ...league, format: "h2h-points" }, myTeamId: "espn:1.1", teams: teams4, lastWeek, slots })!;
    expect(r).toMatchObject({ outcome: "win", margin: "by 21.5", weekRank: { rank: 2, of: 4 }, leagueHigh: { name: "Team 3", mine: false } });
    expect(r.topPerformers.map((p) => [p.player.name, p.points])).toEqual([["B", 72.5], ["A", 60], ["C", 12]]);
  });

  it("returns nothing before a week has finished", () => {
    expect(recapLeague({ league, myTeamId: "espn:1.1", teams: teams4, lastWeek: lastWeek.map((m) => ({ ...m, status: "live" as const })), slots })).toBeNull();
  });
});
