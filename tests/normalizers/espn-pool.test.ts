import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeProTeams } from "@/lib/adapters/espn/normalize";
import { normalizePlayerPool } from "@/lib/adapters/espn/pool";
import type { EspnFreeAgentsResponse, EspnProTeamsResponse } from "@/lib/adapters/espn/raw-types";
import { etDay, gamesThisWeek, normalizeProSchedule, weekWindow } from "@/lib/adapters/espn/schedule";

const dir = path.join(__dirname, "..", "..", "fixtures", "espn");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

const rawPro = load<EspnProTeamsResponse>("pro-teams-2027.json");
const proTeams = normalizeProTeams(rawPro);
const schedule = normalizeProSchedule(rawPro);
const abbrevToId = Object.fromEntries(Object.entries(proTeams).map(([id, a]) => [a, Number(id)]));

// Tuesday Oct 20 2026, noon Eastern (opening night of the fixture season).
const NOW = Date.parse("2026-10-20T16:00:00Z");

describe("NBA schedule (ESPN proTeamSchedules)", () => {
  it("windows Tuesday through Sunday in Eastern time", () => {
    expect(weekWindow(NOW)).toEqual({ today: "2026-10-20", sunday: "2026-10-25" });
    // Late Sunday night Eastern is still Sunday (already Monday in UTC).
    expect(weekWindow(Date.parse("2026-10-26T03:30:00Z"))).toEqual({ today: "2026-10-25", sunday: "2026-10-25" });
  });

  it("counts each team's games from today through Sunday", () => {
    for (const [abbrev, id] of Object.entries(abbrevToId)) {
      const expected = (schedule.get(id) ?? []).filter((g) => {
        const d = etDay(g.date);
        return d >= "2026-10-20" && d <= "2026-10-25";
      }).length;
      expect(gamesThisWeek(schedule, id, NOW), abbrev).toBe(expected);
    }
    const counts = Object.values(abbrevToId).map((id) => gamesThisWeek(schedule, id, NOW));
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(3);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
  });

  it("every game appears under both teams", () => {
    const all = [...schedule.values()].flat();
    expect(all.length % 2).toBe(0);
  });
});

describe("ESPN player pool", () => {
  const raw = load<EspnFreeAgentsResponse>("league-1151450222/free-agents.json");
  const pool = normalizePlayerPool(raw.players, "1151450222", proTeams, schedule, NOW);

  it("keeps free-agent vs waiver status and ownership", () => {
    expect(pool).toHaveLength(50);
    expect(pool.filter((p) => p.status === "waivers")).toHaveLength(2);
    expect(pool.filter((p) => p.status === "free_agent")).toHaveLength(48);
    expect(pool.every((p) => p.fantasyTeamId === null)).toBe(true);
    expect(pool.every((p) => typeof p.percentRostered === "number")).toBe(true);
    expect(pool.find((p) => p.status === "waivers")?.waiverClearsAt).toBe("2026-10-20T07:00:00.000Z"); // 3:00 AM Eastern
  });

  it("attaches games this week and today's opponent from the NBA schedule", () => {
    for (const p of pool) {
      const teamId = abbrevToId[p.player.nbaTeam ?? ""];
      if (teamId) expect(p.gamesThisWeek).toBe(gamesThisWeek(schedule, teamId, NOW));
      if (p.today) expect(p.today.opponent).toMatch(/^[A-Z]{2,4}$/);
    }
    expect(pool.some((p) => p.gamesThisWeek > 0)).toBe(true);
  });

  it("includes totals and fantasy total in stat lines", () => {
    const line = pool[0].player.stats?.projected;
    expect(line?.totals?.pts).toBeGreaterThan(0);
    expect(line?.totals?.min).toBeGreaterThan(0);
    expect(line?.fantasyPointsTotal).toBeGreaterThan(0);
    expect(line?.totals?.fg_pct).toBe(line?.perGame.fg_pct); // rates repeat, never summed
  });
});
