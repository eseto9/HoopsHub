import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fantasyPoints,
  matchupStatus,
  myRoster,
  normalizeLeague,
  normalizeMatchups,
  normalizeOverview,
  normalizePlayer,
  normalizeRoster,
  normalizeStandings,
  normalizeTeams,
  normalizeTransactions,
  statLine,
  type StatsContext,
} from "@/lib/adapters/sleeper/normalize";
import type {
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperPlayer,
  SleeperRoster,
  SleeperStatMap,
  SleeperState,
  SleeperTransaction,
} from "@/lib/adapters/sleeper/raw-types";

const dir = path.join(__dirname, "..", "..", "fixtures", "sleeper");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;
const ID = "1382095100900802562";
const L = `league-${ID}`;

const league = load<SleeperLeague>(`${L}/league.json`);
const users = load<SleeperLeagueUser[]>(`${L}/users.json`);
const rosters = load<SleeperRoster[]>(`${L}/rosters.json`);
const players = load<Record<string, SleeperPlayer>>("players-nba.json");
const state = load<SleeperState>("state.json");
const stats: StatsContext = {
  season: 2026,
  previous: load<{ data: SleeperStatMap }>("stats-2025.json").data,
  projections: load<{ data: SleeperStatMap }>("projections-2026.json").data,
  scoring: league.scoring_settings,
};
const owner = users.find((u) => u.is_owner)!;

describe("Sleeper league and teams", () => {
  const mine = myRoster(rosters, owner.user_id);
  const l = normalizeLeague(league, "conn", mine);

  it("names the season by its end year and treats it as H2H points", () => {
    expect(l).toMatchObject({ season: "2027", format: "h2h-points", size: 14, status: "in_season", url: `https://sleeper.com/leagues/${ID}` });
    expect(l.scoring.points).toMatchObject({ pts: 1, ast: 1.5, "3pm": 0.5, to: -1 });
    expect(l.myTeamId).toBe(`sleeper:${ID}.${mine!.roster_id}`);
  });

  it("uses team names when set, else the manager's display name", () => {
    const teams = normalizeTeams(ID, users, rosters, owner.user_id);
    expect(teams).toHaveLength(14);
    expect(teams.filter((t) => t.isMine)).toHaveLength(1);
    const named = users.find((u) => u.metadata?.team_name)!;
    const t = teams.find((x) => rosters.find((r) => r.owner_id === named.user_id)?.roster_id === Number(x.externalId))!;
    expect(t.name).toBe(named.metadata!.team_name);
    expect(t.ownerName).toBe(named.display_name);
  });
});

describe("Sleeper rosters", () => {
  const r = rosters[0];
  const slots = normalizeRoster(league, r, players, stats);

  it("fills the starting slots in league order, then bench, then IR", () => {
    const starting = league.roster_positions.filter((p) => p !== "BN");
    expect(slots.slice(0, starting.length).map((s) => s.slot)).toEqual(starting);
    expect(slots.filter((s) => s.slot === "IR").map((s) => s.player?.externalId)).toEqual(r.reserve ?? []);
    expect(slots.filter((s) => s.player)).toHaveLength(r.players!.length);
    expect(new Set(slots.map((s) => s.player?.externalId)).size).toBe(slots.length);
  });

  it("gives players headshots and real stats", () => {
    const withStats = slots.filter((s) => s.player?.stats?.previous);
    expect(withStats.length).toBeGreaterThan(10);
    expect(slots[0].player?.headshotUrl).toMatch(/^https:\/\/sleepercdn\.com\/content\/nba\/players\/\d+\.jpg$/);
  });
});

describe("Sleeper stats", () => {
  it("matches ESPN's per-game numbers for Wembanyama's 2025-26 season", () => {
    const line = statLine(stats.previous!["2577"], "2025-26", league.scoring_settings, false)!;
    expect(line.gamesPlayed).toBe(64);
    expect(line.perGame.min).toBeCloseTo(29.2, 1);
    expect(line.perGame.pts).toBeCloseTo(25.0, 1);
    expect(line.perGame.fg_pct).toBeCloseTo(553 / 1080, 5);
    expect(line.fantasyPointsTotal).toBe(fantasyPoints(stats.previous!["2577"], league.scoring_settings));
  });

  it("reads projections as per game", () => {
    const p = normalizePlayer(players["2577"], stats);
    expect(p.stats?.projected?.label).toBe("2026-27 proj.");
    expect(p.stats?.projected?.totals).toBeUndefined();
    expect(p.stats?.projected?.perGame.pts).toBe(stats.projections!["2577"].pts);
  });
});

describe("Sleeper matchups and standings", () => {
  const raw = load<SleeperMatchup[]>(`${L}/matchups-week-1.json`);

  it("pairs rosters by matchup_id: 14 teams make 7 games", () => {
    const m = normalizeMatchups(ID, raw, 1, state, Date.parse("2026-10-19T16:00:00Z"));
    expect(m).toHaveLength(7);
    expect(m.every((x) => x.away && x.status === "upcoming" && x.home.score === undefined)).toBe(true);
  });

  it("goes live on opening day and final once the week passes", () => {
    expect(matchupStatus(1, state, Date.parse("2026-10-21T02:00:00Z"))).toBe("live");
    expect(matchupStatus(1, { ...state, week: 2 }, 0)).toBe("final");
  });

  it("ranks all teams with the playoff line", () => {
    const s = normalizeStandings(league, rosters);
    expect(s.map((x) => x.rank)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(s.filter((x) => x.inPlayoffs)).toHaveLength(league.settings.playoff_teams);
  });
});

describe("Sleeper activity and league tab", () => {
  const txns = load<SleeperTransaction[]>(`${L}/transactions-week-1.json`);
  const feed = normalizeTransactions(ID, txns, players);

  it("turns adds/drops into moves and keeps draft-pick trades readable", () => {
    expect(feed.length).toBe(txns.filter((t) => t.status === "complete").length);
    const drop = feed.find((a) => a.kind === "free_agent" && a.moves.some((m) => m.action === "dropped"))!;
    expect(drop.moves.find((m) => m.action === "dropped")!.toTeamId).toBeNull();
    const pickTrade = feed.find((a) => a.kind === "trade" && a.lines?.length)!;
    expect(pickTrade.lines![0]).toMatch(/^Team \d+ gets Team \d+'s 2026 round \d+ pick\.$/);
    expect([...feed.map((a) => a.date)].sort().reverse()).toEqual(feed.map((a) => a.date));
  });

  it("builds waiver order and the 378-pick snake draft", () => {
    const picks = load<SleeperDraftPick[]>(`${L}/draft-picks.json`);
    const o = normalizeOverview(league, rosters, picks, players, 1);
    expect(o.waiverOrder.map((w) => w.rank)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(o.draft).toHaveLength(378);
    expect(o.draft[14]).toMatchObject({ overall: 15, round: 2, pick: 1 });
    expect(o.draft[0].player?.name).toBe("Victor Wembanyama");
  });
});
