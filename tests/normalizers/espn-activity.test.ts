import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activityPlayerIds, closedIds, normalizeActivity } from "@/lib/adapters/espn/activity";
import { normalizePlayer, normalizeProTeams } from "@/lib/adapters/espn/normalize";
import type { EspnFreeAgentsResponse, EspnProTeamsResponse, EspnTransaction, EspnTransactionsResponse } from "@/lib/adapters/espn/raw-types";
import type { Player } from "@/lib/schema";

const dir = path.join(__dirname, "..", "..", "fixtures", "espn");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

const LEAGUE = "1151450222";
const raw = load<EspnTransactionsResponse>(`league-${LEAGUE}/transactions.json`);
const proTeams = normalizeProTeams(load<EspnProTeamsResponse>("pro-teams-2027.json"));
const players = new Map<number, Player>(
  load<EspnFreeAgentsResponse>(`league-${LEAGUE}/transaction-players.json`).players.map((e) => [e.player.id, normalizePlayer(e.player, proTeams)]),
);

describe("ESPN league activity", () => {
  const { feed, pendingForTeam } = normalizeActivity(raw, LEAGUE, players, "12");

  it("lists completed free-agent pickups and processed waiver claims, newest first", () => {
    expect(feed.length).toBe(6); // 2 FREEAGENT + 4 WAIVER (PROCESS) executed in the fixture
    expect(feed.filter((a) => a.kind === "free_agent")).toHaveLength(2);
    expect(feed.filter((a) => a.kind === "waiver")).toHaveLength(4);
    expect(feed.every((a) => a.status === "completed")).toBe(true);
    const dates = feed.map((a) => a.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("turns a free-agent add/drop into added + dropped moves with real players", () => {
    const fa = feed.find((a) => a.kind === "free_agent" && a.teamId === `espn:${LEAGUE}.7`)!;
    expect(fa.moves.map((m) => m.action)).toEqual(["added", "dropped"]);
    expect(fa.moves[0]).toMatchObject({ fromTeamId: null, toTeamId: `espn:${LEAGUE}.7` });
    expect(fa.moves[1]).toMatchObject({ fromTeamId: `espn:${LEAGUE}.7`, toTeamId: null });
    expect(fa.moves.every((m) => m.player?.name)).toBe(true);
  });

  it("resolves every player mentioned in the feed", () => {
    const moves = feed.flatMap((a) => a.moves);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.filter((m) => !m.player)).toEqual([]);
    expect(activityPlayerIds(raw).every((id) => players.has(id))).toBe(true);
  });

  it("leaves out lineup moves, the draft and trade declines", () => {
    expect(feed.every((a) => ["free_agent", "waiver", "trade"].includes(a.kind))).toBe(true);
  });

  it("treats items closed by a later cancel/decline/process as not pending", () => {
    // Every PENDING item in this league was later cancelled, declined or processed.
    const pending = (raw.transactions ?? []).filter((t) => t.status === "PENDING");
    expect(pending.length).toBeGreaterThan(0);
    const closed = closedIds(raw.transactions ?? []);
    expect(pending.every((t) => closed.has(t.id))).toBe(true);
    expect(pendingForTeam).toEqual([]);
  });
});

describe("ESPN cancelled waiver claim (captured)", () => {
  const claim = load<{ response: { body: EspnTransaction } }>("writes/waiver-claim.json").response.body;
  const cancel = load<{ response: { body: EspnTransaction } }>("writes/waiver-cancel.json").response.body;

  it("shows a fresh claim as pending for its team", () => {
    const { pendingForTeam, feed } = normalizeActivity({ transactions: [claim] }, "1732958907", new Map(), "8");
    expect(feed).toEqual([]);
    expect(pendingForTeam).toHaveLength(1);
    expect(pendingForTeam[0]).toMatchObject({ kind: "waiver", status: "pending" });
    expect(pendingForTeam[0].moves.map((m) => m.action)).toEqual(["added", "dropped"]);
  });

  it("hides the claim once ESPN's cancel references it, even though it still says PENDING", () => {
    expect(claim.status).toBe("PENDING");
    const { pendingForTeam, feed } = normalizeActivity({ transactions: [claim, cancel] }, "1732958907", new Map(), "8");
    expect(pendingForTeam).toEqual([]);
    expect(feed).toEqual([]);
  });

  it("keeps other teams' pending claims private", () => {
    expect(normalizeActivity({ transactions: [claim] }, "1732958907", new Map(), "3").pendingForTeam).toEqual([]);
  });
});
