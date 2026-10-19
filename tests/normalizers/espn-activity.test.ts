import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activityPlayerIds, closedIds, communicationPlayerIds, normalizeActivity, normalizeCommunication } from "@/lib/adapters/espn/activity";
import { normalizePlayer, normalizeProTeams } from "@/lib/adapters/espn/normalize";
import type { EspnCommunicationResponse, EspnFreeAgentsResponse, EspnProTeamsResponse, EspnTransaction, EspnTransactionsResponse } from "@/lib/adapters/espn/raw-types";
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

  it("lists completed pickups, processed waiver claims and lineup moves, newest first", () => {
    expect(feed.length).toBe(65); // 2 FREEAGENT + 4 WAIVER (PROCESS) + 59 ROSTER/FUTURE_ROSTER executed in the fixture
    expect(feed.filter((a) => a.kind === "lineup")).toHaveLength(59);
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

  it("leaves out the draft and trade declines", () => {
    expect(feed.every((a) => ["free_agent", "waiver", "trade", "lineup"].includes(a.kind))).toBe(true);
  });

  it("turns lineup items into slot-to-slot moves", () => {
    const moves = feed.filter((a) => a.kind === "lineup").flatMap((a) => a.moves);
    expect(moves.every((m) => m.action === "moved" && m.fromSlot && m.toSlot)).toBe(true);
    expect(new Set(moves.flatMap((m) => [m.fromSlot, m.toSlot]))).toContain("BN");
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

describe("ESPN league messages", () => {
  const comm = load<EspnCommunicationResponse>(`league-${LEAGUE}/communication.json`);
  const msgs = normalizeCommunication(comm, LEAGUE, players, (id) => `Team ${id}`);

  it("keeps only settings and status topics", () => {
    const n = (comm.topics ?? []).filter((t) => t.type === "ACTIVITY_SETTINGS" || t.type === "ACTIVITY_STATUS").length;
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.length).toBeLessThanOrEqual(n);
    expect(msgs.every((a) => a.kind === "league" && a.status === "completed" && a.lines?.length)).toBe(true);
  });

  it("drops repeats ESPN posts within minutes of each other", () => {
    const keys = msgs.map((a) => `${a.teamId}|${a.lines?.join()}|${Math.floor(Date.parse(a.date) / 300_000)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("words renames, abbreviations and the draft", () => {
    const lines = msgs.flatMap((a) => a.lines ?? []);
    expect(lines.some((l) => /^Renamed team .+ to .+.$/.test(l))).toBe(true);
    expect(lines.some((l) => /^Changed team abbreviation from .+ to .+.$/.test(l))).toBe(true);
    expect(lines).toContain("Draft completed.");
    expect(lines.some((l) => l.startsWith("Moved the draft to"))).toBe(true);
  });

  it("ties team messages to the team", () => {
    const rename = msgs.find((a) => a.lines?.[0]?.startsWith("Renamed team"))!;
    expect(rename.teamId?.startsWith(`espn:${LEAGUE}.`)).toBe(true);
    expect(msgs.find((a) => a.lines?.includes("Draft completed."))!.teamId).toBeNull();
  });

  it("resolves trade-availability players from 252 messages only", () => {
    expect(communicationPlayerIds({ topics: [{ id: "t", type: "ACTIVITY_SETTINGS", date: 0, messages: [{ messageTypeId: 252, date: 0, targetId: 3, for: 4433134 }] }] })).toEqual([4433134]);
    expect(communicationPlayerIds(comm)).toEqual([]);
  });
});
