"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { proposeTradeAction } from "@/app/actions/moves";
import { safeAction } from "@/lib/safe-action";
import type { Player, RosterSlot, Team } from "@/lib/schema";
import { Group } from "./list";
import { PlayerAvatar } from "./player-avatar";
import { Notice, Sheet, type NoticeState } from "./sheet";

function PickRow({ player, slot, checked, onToggle }: { player: Player; slot: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`row ${checked ? "bg-accent-soft" : ""}`}
    >
      <span className="flex shrink-0 items-center gap-2.5">
        <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 ${checked ? "border-accent bg-accent text-white" : "border-faint"}`}>
          {checked && (
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
              <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <PlayerAvatar src={player.headshotUrl} name={player.name} />
      </span>
      <span className="row-body">
        <span className="min-w-0 flex-1">
          <span className="block truncate">{player.name}</span>
          <span className="block truncate text-[15px] text-muted">
            {slot} · {player.nbaTeam ?? "FA"} · {player.positions.join(", ")}
          </span>
        </span>
      </span>
    </button>
  );
}

export function TradeBuilder({
  platform,
  leagueId,
  platformName,
  myTeam,
  theirTeam,
  mySlots,
  theirSlots,
}: {
  platform: string;
  leagueId: string;
  platformName: string;
  myTeam: Pick<Team, "name">;
  theirTeam: Pick<Team, "name" | "externalId" | "ownerName">;
  mySlots: RosterSlot[];
  theirSlots: RosterSlot[];
}) {
  const router = useRouter();
  const [send, setSend] = useState<Set<string>>(new Set());
  const [receive, setReceive] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [pending, start] = useTransition();

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };
  const mine = mySlots.filter((s) => s.player).map((s) => ({ slot: s.slot, player: s.player! }));
  const theirs = theirSlots.filter((s) => s.player).map((s) => ({ slot: s.slot, player: s.player! }));
  const names = (list: typeof mine, ids: Set<string>) => list.filter((r) => ids.has(r.player.externalId)).map((r) => r.player.name);

  function submit() {
    start(async () => {
      const res = await safeAction(() => proposeTradeAction({
        platform,
        leagueId,
        toTeamId: theirTeam.externalId,
        sendPlayerIds: [...send],
        receivePlayerIds: [...receive],
        message: message.trim() || undefined,
      }));
      setReview(false);
      if (res.ok) {
        router.push(`/leagues/${platform}/${leagueId}?tab=activity`);
        router.refresh();
      } else {
        setNotice({ kind: "error", text: res.error, reconnect: res.reconnect });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Notice notice={notice} />
      <Group header={`You receive from ${theirTeam.name}`}>
        {theirs.map(({ slot, player }) => (
          <PickRow key={player.externalId} player={player} slot={slot} checked={receive.has(player.externalId)} onToggle={() => toggle(receive, setReceive, player.externalId)} />
        ))}
      </Group>
      <Group header={`You send from ${myTeam.name}`}>
        {mine.map(({ slot, player }) => (
          <PickRow key={player.externalId} player={player} slot={slot} checked={send.has(player.externalId)} onToggle={() => toggle(send, setSend, player.externalId)} />
        ))}
      </Group>
      <Group header="Message (optional)" footer="The offer expires in 2 days if they don't respond. You can cancel it from Activity.">
        <label className="row-block">
          <span className="row-body">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              className="input resize-none"
              placeholder="Add a note to your offer"
            />
          </span>
        </label>
      </Group>

      <div className="sticky bottom-24 z-10 sm:bottom-4">
        <button type="button" className="btn btn-primary w-full shadow-lg" disabled={!send.size || !receive.size} onClick={() => setReview(true)}>
          {!send.size || !receive.size ? "Pick players on both sides" : `Review Offer (${receive.size} for ${send.size})`}
        </button>
      </div>

      {review && (
        <Sheet
          title={`Offer to ${theirTeam.name}?`}
          confirmLabel="Send Offer"
          pendingLabel={`Sending to ${platformName}…`}
          pending={pending}
          onConfirm={submit}
          onCancel={() => setReview(false)}
        >
          <div className="flex flex-col gap-3 text-[15px]">
            <div className="rounded-[14px] bg-bg px-4 py-3">
              <p className="text-[13px] font-semibold text-muted uppercase">You get</p>
              <p className="mt-1">{names(theirs, receive).join(", ")}</p>
            </div>
            <div className="rounded-[14px] bg-bg px-4 py-3">
              <p className="text-[13px] font-semibold text-muted uppercase">You give</p>
              <p className="mt-1">{names(mine, send).join(", ")}</p>
            </div>
            {message.trim() && <p className="px-1 text-[13px] text-muted">“{message.trim()}”</p>}
            <p className="px-1 text-center text-[13px] text-muted">
              This sends a real trade offer on {platformName}. {theirTeam.ownerName} will be notified.
            </p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
