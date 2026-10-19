import type { LineupChange } from "@/lib/adapters/types";
import type { RosterSlot } from "@/lib/schema";

/**
 * Platform-neutral lineup rules, shared by the UI (to show valid targets)
 * and the server (to re-check before writing).
 */

const IR_OK = new Set(["OUT", "IR"]);

function canOccupy(slot: RosterSlot["player"], label: string): boolean {
  if (!slot) return true;
  if (!slot.eligibleSlots?.includes(label)) return false;
  if (label === "IR" && !IR_OK.has(slot.injuryStatus ?? "")) return false;
  return true;
}

export type MovePlan = { ok: true; changes: LineupChange[] } | { ok: false; reason: string };

/** Move the player in slots[from] to slots[to], swapping with whoever is there. */
export function planMove(slots: RosterSlot[], from: number, to: number): MovePlan {
  const a = slots[from];
  const b = slots[to];
  if (!a?.player) return { ok: false, reason: "No player in that slot" };
  if (!b) return { ok: false, reason: "Unknown slot" };
  if (from === to || a.slot === b.slot) return { ok: false, reason: "Already in that slot" };
  if (a.locked) return { ok: false, reason: `${a.player.name} is locked` };
  if (b.player && b.locked) return { ok: false, reason: `${b.player.name} is locked` };
  if (!canOccupy(a.player, b.slot)) return { ok: false, reason: `${a.player.name} can't play ${b.slot}` };
  if (b.player && !canOccupy(b.player, a.slot)) return { ok: false, reason: `${b.player.name} can't move to ${a.slot}` };

  const changes: LineupChange[] = [{ playerId: a.player.externalId, fromSlot: a.slot, toSlot: b.slot }];
  if (b.player) changes.push({ playerId: b.player.externalId, fromSlot: b.slot, toSlot: a.slot });
  return { ok: true, changes };
}

/** Slot indexes the player in slots[from] could move to. */
export function validTargets(slots: RosterSlot[], from: number): number[] {
  return slots.flatMap((_, i) => (planMove(slots, from, i).ok ? [i] : []));
}
