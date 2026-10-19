"use client";

import { useState, useTransition } from "react";
import { addDropAction } from "@/app/actions/moves";
import { safeAction } from "@/lib/safe-action";
import type { Player, RosterSlot } from "@/lib/schema";
import { PlayerAvatar } from "./player-avatar";
import { Sheet, type NoticeState } from "./sheet";

/**
 * "Add to team" confirmation. Picks who to drop; "nobody" is only offered when
 * there's an open non-IR slot. Players on waivers become a claim that processes
 * when waivers clear (the sheet says so).
 */
export function AddPlayerSheet({
  target,
  waivers,
  waiverClearsAt,
  mySlots,
  platform,
  leagueId,
  platformName,
  onClose,
}: {
  target: Player;
  waivers: boolean;
  waiverClearsAt?: string;
  mySlots: RosterSlot[];
  platform: string;
  leagueId: string;
  platformName: string;
  onClose: (result?: { notice: NoticeState; changed: boolean }) => void;
}) {
  const rostered = mySlots.filter((s) => s.player).map((s) => ({ slot: s.slot, player: s.player! }));
  const hasOpenSpot = mySlots.some((s) => !s.player && s.slot !== "IR");
  const [drop, setDrop] = useState<string | "none" | null>(hasOpenSpot ? "none" : null);
  const [pending, start] = useTransition();

  const clears = waiverClearsAt
    ? new Date(waiverClearsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
    : null;

  function submit() {
    if (drop === null) return;
    const dropPlayer = drop === "none" ? undefined : rostered.find((r) => r.player.externalId === drop)?.player;
    start(async () => {
      const res = await safeAction(() =>
        addDropAction({
          platform,
          leagueId,
          addPlayerId: target.externalId,
          addName: target.name,
          dropPlayerId: dropPlayer?.externalId,
          dropName: dropPlayer?.name,
        }),
      );
      onClose({
        changed: res.ok,
        notice: res.ok ? { kind: "ok", text: res.message } : { kind: "error", text: res.error, reconnect: res.reconnect },
      });
    });
  }

  return (
    <Sheet
      title={`Add ${target.name} to your team?`}
      confirmLabel="Add to Team"
      pendingLabel={`Sending to ${platformName}…`}
      pending={pending}
      disabled={drop === null}
      onConfirm={submit}
      onCancel={() => onClose()}
    >
      <p className="mb-3 text-center text-[13px] text-muted">
        {waivers
          ? `${target.name} is on waivers${clears ? ` until ${clears}` : ""}, so this places a waiver claim. It goes through then if you're highest in waiver order.`
          : `${target.name} is a free agent and joins your team on ${platformName} right away.`}
      </p>
      <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted uppercase">Drop</p>
      <div className="flex flex-col overflow-hidden rounded-[14px] bg-bg">
        {hasOpenSpot && <DropOption checked={drop === "none"} onSelect={() => setDrop("none")} label="Nobody (you have an open spot)" />}
        {rostered.map(({ slot, player }) => (
          <DropOption
            key={player.externalId}
            checked={drop === player.externalId}
            onSelect={() => setDrop(player.externalId)}
            label={player.name}
            sub={`${slot} · ${player.nbaTeam ?? "FA"}`}
            avatar={<PlayerAvatar src={player.headshotUrl} name={player.name} />}
          />
        ))}
      </div>
      {drop === null && <p className="mt-2 px-1 text-[13px] text-warning">Your roster is full. Pick someone to drop.</p>}
    </Sheet>
  );
}

function DropOption({ checked, onSelect, label, sub, avatar }: { checked: boolean; onSelect: () => void; label: string; sub?: string; avatar?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className="flex items-center gap-3 border-b-[0.5px] border-separator px-3 py-2 text-left last:border-b-0"
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{label}</span>
        {sub && <span className="block text-[13px] text-muted">{sub}</span>}
      </span>
      <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${checked ? "border-accent bg-accent shadow-[inset_0_0_0_3px_var(--bg)]" : "border-faint"}`} />
    </button>
  );
}
