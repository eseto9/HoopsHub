import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeProTeams, normalizeRoster } from "@/lib/adapters/espn/normalize";
import type { EspnLeagueSettingsResponse, EspnProTeamsResponse, EspnRosterResponse } from "@/lib/adapters/espn/raw-types";
import { buildLineupTransaction, transactionsUrl } from "@/lib/adapters/espn/writes";
import { planMove, validTargets } from "@/lib/lineup";

const dir = path.join(__dirname, "..", "fixtures", "espn");
const load = <T>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

const LEAGUE = "1151450222";
const capture = load<{
  request: { url: string; body: Record<string, unknown> & { items: unknown[] } };
  revert: { request: { body: { items: unknown[] } } };
}>("writes/lineup-swap.json");

const slots = normalizeRoster(
  load<EspnLeagueSettingsResponse>(`league-${LEAGUE}/settings.json`),
  load<EspnRosterResponse>(`league-${LEAGUE}/roster.json`),
  "12",
  normalizeProTeams(load<EspnProTeamsResponse>("pro-teams-2027.json")),
);
const at = (name: string) => slots.findIndex((s) => s.player?.name === name);

describe("ESPN lineup write request", () => {
  it("targets the captured transactions endpoint", () => {
    expect(capture.request.url.startsWith(transactionsUrl(2027, LEAGUE))).toBe(true);
  });

  it("builds exactly the body espn.com sent for the swap", () => {
    const plan = planMove(slots, at("Khaman Maluach"), at("Walker Kessler"));
    expect(plan.ok).toBe(true);
    const body = buildLineupTransaction({
      teamId: 12,
      memberId: "{REDACTED-SWID}",
      scoringPeriodId: 1,
      changes: plan.ok ? plan.changes : [],
    });
    expect(body).toEqual(capture.request.body);
  });

  it("builds the captured body for the swap back", () => {
    // After the swap, Kessler is on the bench and Maluach in UTIL; moving Kessler back reverses it.
    const swapped = slots.map((s) =>
      s.player?.name === "Khaman Maluach" ? { ...s, player: slots[at("Walker Kessler")].player } :
      s.player?.name === "Walker Kessler" ? { ...s, player: slots[at("Khaman Maluach")].player } : s,
    );
    const from = swapped.findIndex((s) => s.player?.name === "Walker Kessler");
    const to = swapped.findIndex((s) => s.player?.name === "Khaman Maluach");
    const plan = planMove(swapped, from, to);
    expect(plan.ok && buildLineupTransaction({ teamId: 12, memberId: "x", scoringPeriodId: 1, changes: plan.changes }).items).toEqual(
      capture.revert.request.body.items,
    );
  });
});

describe("lineup rules", () => {
  it("offers the same targets espn.com showed for Khaman Maluach (C + three UTIL)", () => {
    const targets = validTargets(slots, at("Khaman Maluach")).map((i) => `${slots[i].slot}:${slots[i].player?.name}`);
    expect(targets.sort()).toEqual(
      ["C:Domantas Sabonis", "UTIL:Walker Kessler", "UTIL:Dylan Harper", "UTIL:Ryan Rollins"].sort(),
    );
  });

  it("keeps healthy players off IR", () => {
    const ir = slots.findIndex((s) => s.slot === "IR");
    expect(planMove(slots, at("Kyrie Irving"), ir)).toMatchObject({ ok: false });
  });

  it("refuses locked players", () => {
    const locked = slots.map((s, i) => (i === at("Walker Kessler") ? { ...s, locked: true } : s));
    expect(planMove(locked, at("Khaman Maluach"), at("Walker Kessler"))).toEqual({ ok: false, reason: "Walker Kessler is locked" });
  });
});
