import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLeague, normalizeMatchups, normalizeStandings, rotoTable } from "@/lib/adapters/espn/normalize";
import type { EspnLeagueSettingsResponse, EspnMatchupsResponse } from "@/lib/adapters/espn/raw-types";

const dir = path.join(__dirname, "..", "..", "fixtures", "espn");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

// Public leagues, 2025-26 season (finished): H2H categories (8 cats) and H2H most categories (11 cats, TO reversed).
const CAT = "1382487116";
const MOST = "13937";
const ctx = (leagueId: string) => ({ leagueId, connectionId: "c" });
const cats = (s: EspnLeagueSettingsResponse) => new Set(s.settings.scoringSettings.scoringItems.map((i) => i.statId));

describe("ESPN H2H categories", () => {
  const settings = load<EspnLeagueSettingsResponse>(`league-${CAT}/settings.json`);
  const raw = load<EspnMatchupsResponse>(`league-${CAT}/matchups.json`);

  it("reads the format and the counted categories", () => {
    const l = normalizeLeague(settings, ctx(CAT));
    expect(l.format).toBe("h2h-categories");
    expect(l.scoring.categories?.map((c) => c.label)).toEqual(["PTS", "BLK", "STL", "AST", "REB", "3PM", "FG%", "FT%"]);
    expect(l.scoring.points).toBeUndefined();
  });

  it("gives finished matchups a category tally and per-category values instead of points", () => {
    const week1 = normalizeMatchups(raw, Number(CAT), 1, true, cats(settings));
    expect(week1.length).toBe(6);
    for (const m of week1) {
      expect(m.status).toBe("final");
      expect(m.home.score).toBeUndefined();
      const h = m.home.categoryRecord!;
      const a = m.away!.categoryRecord!;
      // Every category goes to one side or is tied.
      expect(h.wins + h.losses + h.ties).toBe(8);
      expect(h.wins).toBe(a.losses);
      expect(Object.keys(m.home.categoryValues!).sort()).toEqual(["3pm", "ast", "blk", "fg_pct", "ft_pct", "pts", "reb", "stl"]);
      // The winner field agrees with the tally.
      expect(m.winner).toBe(h.wins > h.losses ? "home" : h.wins < h.losses ? "away" : "tie");
    }
  });

  it("keeps points leagues on points", () => {
    expect(normalizeMatchups(raw, Number(CAT), 1, true)[0].home.categoryRecord).toBeUndefined();
  });

  it("ranks standings by the category record", () => {
    const s = normalizeStandings(settings);
    expect(s).toHaveLength(12);
    expect(s.every((r) => r.wins + r.losses + r.ties > 100)).toBe(true); // ~8 categories x ~20 weeks
  });
});

describe("ESPN H2H most categories", () => {
  const raw = load<EspnMatchupsResponse>(`league-${MOST}/matchups.json`);
  const settings = load<EspnLeagueSettingsResponse>(`league-${MOST}/settings.json`);

  it("treats turnovers as lower-is-better, as ESPN does", () => {
    expect(normalizeLeague(settings, ctx(MOST)).scoring.categories?.find((c) => c.stat === "to")?.higherIsBetter).toBe(false);
    const m = normalizeMatchups(raw, Number(MOST), 1, true, cats(settings)).find((x) => x.home.categoryValues?.to !== x.away?.categoryValues?.to)!;
    const homeWonTo = m.home.categoryValues!.to < m.away!.categoryValues!.to;
    // ESPN's own per-category result for TO matches "fewer is better".
    const rawItem = raw.schedule.find((x) => `espn:${MOST}.${x.id}` === m.id)!;
    expect(rawItem.home.cumulativeScore!.scoreByStat!["11"].result).toBe(homeWonTo ? "WIN" : "LOSS");
  });

  it("counts each week once in the season record", () => {
    const s = normalizeStandings(settings);
    expect(s.every((r) => r.wins + r.losses + r.ties <= 22)).toBe(true);
  });
});

describe("Roto points (computed from season totals)", () => {
  const settings = load<EspnLeagueSettingsResponse>(`league-${CAT}/settings.json`);
  const roto = { ...settings, settings: { ...settings.settings, scoringSettings: { ...settings.settings.scoringSettings, scoringType: "ROTO" } } };

  it("gives N points for first in each category down to 1, summing to the right total", () => {
    const table = rotoTable(roto);
    const n = settings.teams.length;
    const cats = settings.settings.scoringSettings.scoringItems.length;
    const total = [...table.values()].reduce((a, r) => a + r.total, 0);
    expect(total).toBeCloseTo((cats * n * (n + 1)) / 2, 6);
    // The team with the most points scored is ranked 1st in PTS.
    const best = [...settings.teams].sort((a, b) => (b.valuesByStat!["0"] ?? 0) - (a.valuesByStat!["0"] ?? 0))[0];
    expect(table.get(best.id)!.ranks.pts).toBe(1);
  });

  it("orders roto standings by roto points", () => {
    const s = normalizeStandings(roto);
    expect(s[0].rank).toBe(1);
    expect(s.map((r) => r.rotoPoints!)).toEqual([...s.map((r) => r.rotoPoints!)].sort((a, b) => b - a));
    expect(Object.keys(s[0].categoryRanks!)).toHaveLength(8);
  });
});
