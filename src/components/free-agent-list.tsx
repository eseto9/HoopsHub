"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDropAction } from "@/app/actions/moves";
import type { Player, RosterSlot } from "@/lib/schema";
import { Group, Row } from "./list";
import { PlayerAvatar } from "./player-avatar";
import { PlayerRow } from "./player-row";
import { Notice, Sheet, type NoticeState } from "./sheet";

/**
 * Free agents with Add (instant pickup) or Claim (on waivers) buttons. The
 * sheet asks who to drop; "nobody" is only offered when there's an open slot.
 */
export function FreeAgentList({
  players,
  mySlots,
  platform,
  leagueId,
  platformName,
  showFantasyPoints,
}: {
  players: Player[];
  /** Your roster when the league is connected through your account; null = read-only. */
  mySlots: RosterSlot[] | null;
  platform: string;
  leagueId: string;
  platformName: string;
  showFantasyPoints: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Player | null>(null);
  const [drop, setDrop] = useState<string | "none" | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [pending, start] = useTransition();

  const rostered = (mySlots ?? []).filter((s) => s.player).map((s) => ({ slot: s.slot, player: s.player! }));
  const hasOpenSpot = (mySlots ?? []).some((s) => !s.player && s.slot !== "IR");

  function open(p: Player) {
    setNotice(null);
    setTarget(p);
    setDrop(hasOpenSpot ? "none" : null);
  }

  function submit() {
    if (!target || drop === null) return;
    const dropPlayer = drop === "none" ? undefined : rostered.find((r) => r.player.externalId === drop)?.player;
    start(async () => {
      const res = await addDropAction({
        platform,
        leagueId,
        addPlayerId: target.externalId,
        addName: target.name,
        dropPlayerId: dropPlayer?.externalId,
        dropName: dropPlayer?.name,
      });
      setTarget(null);
      setNotice(res.ok ? { kind: "ok", text: res.message } : { kind: "error", text: res.error, reconnect: res.reconnect });
      if (res.ok) router.refresh();
    });
  }

  const claim = target?.availability === "waivers";
  const clears = target?.waiverClearsAt
    ? new Date(target.waiverClearsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Notice notice={notice} />
      <Group
        header="Top available players"
        footer={mySlots ? "Claim = on waivers, processes when waivers clear. Add = free agent, instant." : "Sorted by how widely rostered they are."}
      >
        {players.length === 0 ? (
          <Row title={<span className="text-muted">No free agents found</span>} />
        ) : (
          players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              showFantasyPoints={showFantasyPoints}
              action={
                mySlots ? (
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                      p.availability === "waivers" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"
                    }`}
                  >
                    {p.availability === "waivers" ? "Claim" : "Add"}
                  </button>
                ) : undefined
              }
            />
          ))
        )}
      </Group>

      {target && (
        <Sheet
          title={claim ? `Claim ${target.name}?` : `Add ${target.name}?`}
          confirmLabel={claim ? "Place Claim" : "Add Player"}
          pendingLabel={`Sending to ${platformName}…`}
          pending={pending}
          disabled={drop === null}
          onConfirm={submit}
          onCancel={() => setTarget(null)}
        >
          <p className="mb-3 text-center text-[13px] text-muted">
            {claim
              ? `${target.name} is on waivers${clears ? ` until ${clears}` : ""}. Your claim processes then, by waiver order.`
              : `This adds ${target.name} to your team on ${platformName} right away.`}
          </p>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted uppercase">Drop</p>
          <div className="flex flex-col overflow-hidden rounded-[14px] bg-bg">
            {hasOpenSpot && (
              <DropOption checked={drop === "none"} onSelect={() => setDrop("none")} label="Nobody (you have an open spot)" />
            )}
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
          {!hasOpenSpot && drop === null && <p className="mt-2 px-1 text-[13px] text-warning">Your roster is full. Pick someone to drop.</p>}
        </Sheet>
      )}
    </div>
  );
}

function DropOption({
  checked,
  onSelect,
  label,
  sub,
  avatar,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  sub?: string;
  avatar?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={checked} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3 py-2 text-left last:border-b-0">
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{label}</span>
        {sub && <span className="block text-[13px] text-muted">{sub}</span>}
      </span>
      <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${checked ? "border-accent bg-accent shadow-[inset_0_0_0_3px_var(--bg)]" : "border-faint"}`} />
    </button>
  );
}
