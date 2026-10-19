import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEspnCookies } from "@/lib/adapters/espn/adapter";
import {
  leagueIdsFromFanProfile,
  normalizeLeague,
  normalizeMatchups,
  normalizePlayer,
  normalizeProTeams,
  normalizeRoster,
  normalizeStandings,
  normalizeTeams,
  type LeagueContext,
} from "@/lib/adapters/espn/normalize";
import type {
  EspnFanProfile,
  EspnFreeAgentsResponse,
  EspnLeagueSettingsResponse,
  EspnMatchupsResponse,
  EspnProTeamsResponse,
  EspnRosterResponse,
} from "@/lib/adapters/espn/raw-types";

const dir = path.join(__dirname, "..", "..", "fixtures", "espn");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

// Fixtures have the real SWID replaced with this placeholder.
const SWID = "{REDACTED-SWID}";

const PRE = "1062226262"; // Temple BBall: pre-draft, 10 teams, default points scoring
const LIVE = "1151450222"; // 570 Temple Squadron: drafted, 12 teams, custom points scoring

const proTeams = normalizeProTeams(load<EspnProTeamsResponse>("pro-teams-2027.json"));
const settings = (id: string) => load<EspnLeagueSettingsResponse>(`league-${id}/settings.json`);
const ctx = (id: string, extra: Partial<LeagueContext> = {}): LeagueContext => ({
  leagueId: id,
  connectionId: "conn_test",
  swid: SWID,
  ...extra,
});

describe("ESPN pro teams", () => {
  it("maps all 30 NBA teams and drops the free-agent placeholder", () => {
    expect(Object.keys(proTeams)).toHaveLength(30);
    expect(proTeams[2]).toBe("BOS");
    expect(proTeams[0]).toBeUndefined();
  });
});

describe("ESPN fan profile", () => {
  it("finds both basketball leagues for 2027", () => {
    const ids = leagueIdsFromFanProfile(load<EspnFanProfile>("fan.json"), 2027);
    expect(ids.sort()).toEqual([PRE, LIVE].sort());
  });

  it("ignores other seasons", () => {
    expect(leagueIdsFromFanProfile(load<EspnFanProfile>("fan.json"), 2026)).toEqual([]);
  });
});

describe("ESPN league", () => {
  it("normalizes a pre-draft league with default points scoring", () => {
    const l = normalizeLeague(settings(PRE), ctx(PRE));
    expect(l).toMatchObject({
      id: `espn:${PRE}`,
      platform: "espn",
      name: "Temple BBall",
      season: "2027",
      format: "h2h-points",
      size: 10,
      status: "pre_draft",
      myTeamId: `espn:${PRE}.2`,
    });
    expect(l.scoring.points).toEqual({ to: -2, fga: -1, fta: -1, pts: 1, reb: 1, ftm: 1, "3pm": 1, ast: 2, fgm: 2, blk: 4, stl: 4 });
    expect(l.rosterPositions).toEqual(["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "UTIL", "BN", "BN", "BN", "IR"]);
    expect(l.url).toContain(`leagueId=${PRE}`);
  });

  it("normalizes a drafted league with custom scoring", () => {
    const l = normalizeLeague(settings(LIVE), ctx(LIVE));
    expect(l.status).toBe("in_season");
    expect(l.size).toBe(12);
    expect(l.myTeamId).toBe(`espn:${LIVE}.12`);
    expect(l.scoring.points).toMatchObject({ dd: 2, td: 3, qd: 5, oreb: 0.5 });
    expect(l.rosterPositions.filter((p) => p === "IR")).toHaveLength(2);
  });

  it("uses the user-picked team for public leagues (no SWID)", () => {
    const l = normalizeLeague(settings(LIVE), ctx(LIVE, { swid: undefined, myTeamExternalId: "3" }));
    expect(l.myTeamId).toBe(`espn:${LIVE}.3`);
  });

  it("has no myTeamId without a SWID or a pick", () => {
    expect(normalizeLeague(settings(LIVE), ctx(LIVE, { swid: undefined })).myTeamId).toBeUndefined();
  });
});

describe("ESPN teams", () => {
  it("marks exactly one team as mine and resolves owner names", () => {
    const teams = normalizeTeams(settings(LIVE), ctx(LIVE));
    expect(teams).toHaveLength(12);
    expect(teams.filter((t) => t.isMine).map((t) => t.name)).toEqual(["The Great White"]);
    expect(new Set(teams.map((t) => t.id)).size).toBe(12);
    for (const t of teams) expect(t.ownerName.length).toBeGreaterThan(0);
  });
});

describe("ESPN roster", () => {
  const s = settings(LIVE);
  const roster = load<EspnRosterResponse>(`league-${LIVE}/roster.json`);

  it("lays out every league slot and fills it from the roster", () => {
    const slots = normalizeRoster(s, roster, "1", proTeams);
    const raw = roster.teams!.find((t) => t.id === 1)!.roster.entries;
    expect(slots.filter((x) => x.player)).toHaveLength(raw.length);
    expect(slots.length).toBeGreaterThanOrEqual(15);
    expect(slots.every((x) => x.teamId === `espn:${LIVE}.1`)).toBe(true);
  });

  it("normalizes players (positions, NBA team, injury)", () => {
    const slots = normalizeRoster(s, roster, "1", proTeams);
    const jalen = slots.find((x) => x.player?.name === "Jalen Johnson");
    expect(jalen?.slot).toBe("PF");
    expect(jalen?.player).toMatchObject({ id: "espn:4701230", nbaTeam: "ATL", positions: ["PF"] });

    const all = roster.teams!.flatMap((t) => normalizeRoster(s, roster, String(t.id), proTeams));
    const players = all.flatMap((x) => (x.player ? [x.player] : []));
    expect(players.every((p) => p.positions.length > 0)).toBe(true);
    expect(players.some((p) => p.injuryStatus === "OUT")).toBe(true);
    expect(players.some((p) => p.injuryStatus === "DTD")).toBe(true);
  });

  it("returns all-empty slots for a pre-draft league", () => {
    const slots = normalizeRoster(settings(PRE), load<EspnRosterResponse>(`league-${PRE}/roster.json`), "2", proTeams);
    expect(slots).toHaveLength(14);
    expect(slots.every((x) => x.player === null)).toBe(true);
  });
});

describe("ESPN matchups", () => {
  const raw = load<EspnMatchupsResponse>(`league-${LIVE}/matchups.json`);

  it("returns the current period with every team once", () => {
    const m = normalizeMatchups(raw, Number(LIVE));
    expect(m).toHaveLength(6);
    expect(m.every((x) => x.period === 1 && x.status === "live")).toBe(true);
    const teams = m.flatMap((x) => [x.home.teamId, x.away?.teamId]);
    expect(new Set(teams).size).toBe(12);
  });

  it("marks future periods upcoming", () => {
    const m = normalizeMatchups(raw, Number(LIVE), 5);
    expect(m).toHaveLength(6);
    expect(m.every((x) => x.status === "upcoming")).toBe(true);
  });

  it("is never live before the draft", () => {
    const pre = normalizeMatchups(load<EspnMatchupsResponse>(`league-${PRE}/matchups.json`), Number(PRE));
    expect(pre.every((x) => x.status === "upcoming")).toBe(true);
  });
});

describe("ESPN standings", () => {
  it("ranks by ESPN playoff seed when all teams are seeded", () => {
    const rows = normalizeStandings(settings(LIVE));
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.rank)).toEqual([...Array(12)].map((_, i) => i + 1));
    expect(rows[0].teamId).toBe(`espn:${LIVE}.12`); // seed 1 in the fixture
  });

  it("falls back to record ordering when unseeded", () => {
    const rows = normalizeStandings(settings(PRE));
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.wins === 0 && r.losses === 0)).toBe(true);
  });
});

describe("ESPN free agents", () => {
  it("normalizes the free-agent pool", () => {
    const raw = load<EspnFreeAgentsResponse>(`league-${LIVE}/free-agents.json`);
    const players = raw.players.map((e) => normalizePlayer(e.player, proTeams));
    expect(players).toHaveLength(50);
    expect(players.every((p) => p.platform === "espn" && p.positions.length > 0)).toBe(true);
    expect(players.filter((p) => p.nbaTeam).length).toBeGreaterThan(40);
  });
});

describe("parseEspnCookies", () => {
  it("normalizes SWID braces and case", () => {
    const c = parseEspnCookies({ espn_s2: "A".repeat(40), swid: "12345678-abcd-4ef0-9abc-0123456789ab" });
    expect(c?.swid).toBe("{12345678-ABCD-4EF0-9ABC-0123456789AB}");
  });

  it("rejects malformed input", () => {
    expect(parseEspnCookies({ espn_s2: "short", swid: "{12345678-ABCD-4EF0-9ABC-0123456789AB}" })).toBeNull();
    expect(parseEspnCookies({ espn_s2: "A".repeat(40), swid: "not-a-swid" })).toBeNull();
  });
});
