import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gamesById, normalizePlayerCard } from "@/lib/adapters/espn/playercard";
import { normalizeProTeams } from "@/lib/adapters/espn/normalize";
import { normalizeProSchedule } from "@/lib/adapters/espn/schedule";
import type { EspnNewsResponse, EspnPlayerCardResponse, EspnProTeamsResponse } from "@/lib/adapters/espn/raw-types";

const dir = path.join(__dirname, "..", "..", "fixtures", "espn");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

const card = load<EspnPlayerCardResponse>("league-1151450222/playercard.json");
const pro27 = load<EspnProTeamsResponse>("pro-teams-2027.json");
const pro26 = load<EspnProTeamsResponse>("pro-teams-2026.json");
const now = Date.parse("2026-10-19T16:00:00Z");
const d = normalizePlayerCard(
  card,
  load<EspnNewsResponse>("player-news.json"),
  "1151450222",
  normalizeProTeams(pro27),
  normalizeProSchedule(pro27),
  new Map([[2026, gamesById(pro26)], [2027, gamesById(pro27)]]),
  now,
)!;

describe("ESPN player card", () => {
  it("knows who has the player", () => {
    expect(d.listing.status).toBe("rostered");
    expect(d.listing.fantasyTeamId).toBe("espn:1151450222.12");
  });

  it("builds last season's game log with dates and opponents, newest first", () => {
    expect(d.gameLog.length).toBe(card.players[0].player.stats!.filter((s) => s.statSplitTypeId === 5).length);
    expect(d.gameLog.every((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date) && g.opponent !== "?" && g.opponent.length >= 2)).toBe(true);
    expect([...d.gameLog.map((g) => g.date)].sort().reverse()).toEqual(d.gameLog.map((g) => g.date));
    const g = d.gameLog.find((x) => x.gameId === "401811048")!;
    expect(g.stats).toMatchObject({ pts: 10, reb: 4 });
    expect(g.fantasyPoints).toBe(20.5);
  });

  it("has season lines but no recent splits before opening night", () => {
    expect(d.splits.map((s) => s.label)).not.toContain("Last 7 days");
    expect(d.splits.some((s) => s.label === "2025-26" && s.gamesPlayed === 70)).toBe(true);
  });

  it("lists upcoming games from opening night", () => {
    expect(d.upcoming.length).toBe(7);
    expect(d.upcoming[0].date >= "2026-10-20").toBe(true);
  });

  it("keeps readable news with a source", () => {
    expect(d.news.length).toBeGreaterThan(0);
    expect(d.news.every((n) => n.headline && n.body && n.published)).toBe(true);
    expect(d.news[0].source).toBe("RotoWire");
    expect(d.outlook).toMatch(/Flagg/);
  });
});
