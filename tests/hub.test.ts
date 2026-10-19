import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeProTeams, normalizeRoster } from "@/lib/adapters/espn/normalize";
import { normalizeProSchedule } from "@/lib/adapters/espn/schedule";
import type { EspnLeagueSettingsResponse, EspnProTeamsResponse, EspnRosterResponse } from "@/lib/adapters/espn/raw-types";
import { normalizeRoster as sleeperRoster } from "@/lib/adapters/sleeper/normalize";
import type { SleeperLeague, SleeperPlayer, SleeperRoster } from "@/lib/adapters/sleeper/raw-types";
import { exposure, isStarterSlot, lineupIssues, nameKey, slate, startersGamesLeft, type LeagueRoster } from "@/lib/hub";
import { planMove } from "@/lib/lineup";

const fx = (rel: string) => JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", rel), "utf8"));
const pro = fx("espn/pro-teams-2027.json") as EspnProTeamsResponse;
const proTeams = normalizeProTeams(pro);
const schedule = normalizeProSchedule(pro);
const OPENING_NIGHT = Date.parse("2026-10-20T16:00:00Z"); // 3 games: 3:00, 7:00, 9:30 PM ET
const settings = fx("espn/league-1151450222/settings.json") as EspnLeagueSettingsResponse;
const roster = fx("espn/league-1151450222/roster.json") as EspnRosterResponse;

const espnSlots = (team: string, now = OPENING_NIGHT) => normalizeRoster(settings, roster, team, proTeams, { schedule, now });
const espn = (team: string): LeagueRoster => ({ league: { id: `espn:1151450222`, name: "ESPN league", platform: "espn", externalId: "1151450222" }, slots: espnSlots(team) });

describe("nameKey", () => {
  it("matches the same player across platforms", () => {
    expect(nameKey("Jimmy Butler III")).toBe(nameKey("Jimmy Butler"));
    expect(nameKey("Luka Dončić")).toBe(nameKey("Luka Doncic"));
    expect(nameKey("Jaren Jackson Jr.")).toBe(nameKey("Jaren Jackson"));
  });
});

describe("Lineup Check on opening night", () => {
  it("flags starters with no game today and only suggests legal, playing bench swaps", () => {
    for (const team of settings.teams.map((t) => String(t.id))) {
      const slots = espnSlots(team);
      for (const issue of lineupIssues(slots)) {
        expect(isStarterSlot(issue.slot)).toBe(true);
        if (issue.kind === "no_game") {
          expect(slots[issue.slotIndex].player?.schedule?.today).toBeNull();
          expect(issue.fix).toBeDefined(); // only flagged when there's a swap
        }
        if (issue.fix) {
          expect(slots[issue.fix.from].slot).toBe("BN");
          expect(issue.fix.player.schedule?.today).not.toBeNull();
          expect(planMove(slots, issue.fix.from, issue.slotIndex).ok).toBe(true);
        }
      }
    }
  });

  it("stays quiet on a day with no NBA games and for undrafted rosters", () => {
    const offDay = espnSlots("12", Date.parse("2026-10-19T16:00:00Z"));
    expect(lineupIssues(offDay).filter((i) => i.kind === "no_game")).toEqual([]);
    expect(lineupIssues(offDay.map((s) => ({ ...s, player: null })))).toEqual([]);
  });

  it("never suggests the same bench player twice", () => {
    const fixes = lineupIssues(espnSlots("12")).flatMap((i) => (i.fix ? [i.fix.from] : []));
    expect(new Set(fixes).size).toBe(fixes.length);
  });
});

describe("Tonight's Slate", () => {
  it("groups everyone you own who plays today by NBA game, in tip-off order", () => {
    const games = slate([espn("12"), espn("3")]);
    expect(games.length).toBeGreaterThan(0);
    expect(games.length).toBeLessThanOrEqual(3);
    expect([...games.map((g) => g.date)].sort()).toEqual(games.map((g) => g.date));
    for (const g of games) for (const x of g.players) expect([g.home, g.away]).toContain(x.player.nbaTeam);
  });
});

describe("Exposure and games left", () => {
  const league = fx("sleeper/league-1382095100900802562/league.json") as SleeperLeague;
  const sRosters = fx("sleeper/league-1382095100900802562/rosters.json") as SleeperRoster[];
  const players = fx("sleeper/players-nba.json") as Record<string, SleeperPlayer>;
  const sleeper: LeagueRoster = { league: { id: "sleeper:1", name: "Sleeper league", platform: "sleeper", externalId: "1" }, slots: sleeperRoster(league, sRosters[0], players) };

  it("counts a player once per league and finds players shared across ESPN and Sleeper", () => {
    const all = exposure([espn("12"), espn("3"), sleeper]);
    expect(all.every((e) => e.leagues.length >= 1)).toBe(true);
    expect(all.reduce((n, e) => n + e.leagues.length, 0)).toBe([espn("12"), espn("3"), sleeper].reduce((n, r) => n + r.slots.filter((s) => s.player).length, 0));
    expect([...all.map((e) => e.leagues.length)]).toEqual([...all.map((e) => e.leagues.length)].sort((a, b) => b - a));
  });

  it("sums starters' games left only when a schedule is known", () => {
    expect(startersGamesLeft(espnSlots("12"))).toBeGreaterThan(0);
    expect(startersGamesLeft(sleeper.slots)).toBeUndefined();
  });
});
