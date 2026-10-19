"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { moveLineupAction } from "@/app/actions/lineup";
import { safeAction } from "@/lib/safe-action";
import { planMove, validTargets } from "@/lib/lineup";
import type { RosterSlot } from "@/lib/schema";
import { StatControls, StatsTable, availableSources, type StatMode, type StatSource } from "./stats-table";

type Pending = { from: number; to: number } | null;
type Notice = { kind: "ok" | "error"; text: string; reconnect?: boolean } | null;

/**
 * Your roster with ESPN-style lineup editing: tap Move on a player, tap Here on
 * a highlighted slot, confirm. Valid targets come from the shared lineup rules,
 * and the server re-checks every move before sending it.
 */
export function RosterEditor({
  slots,
  platform,
  leagueId,
  platformName,
  showFantasyPoints,
  title,
  editable = true,
}: {
  slots: RosterSlot[];
  platform: string;
  leagueId: string;
  platformName: string;
  showFantasyPoints: boolean;
  title: string;
  /** False for other teams and public leagues: same table, no Move buttons. */
  editable?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();
  const players = useMemo(() => slots.map((x) => x.player), [slots]);
  const [source, setSource] = useState<StatSource>(availableSources(players)[0] ?? "projected");
  const [mode, setMode] = useState<StatMode>("avg");

  const targets = useMemo(() => new Set(selected === null ? [] : validTargets(slots, selected)), [slots, selected]);
  const indexed = slots.map((s, i) => ({ s, i }));
  const starters = indexed.filter(({ s }) => s.slot !== "BN" && s.slot !== "IR");
  const bench = indexed.filter(({ s }) => s.slot === "BN" || s.slot === "IR");

  function actionFor(i: number) {
    const s = slots[i];
    if (!editable) return undefined;
    if (selected === null) {
      if (!s.player) return undefined;
      if (s.locked) return <span className="text-[13px] text-faint">Locked</span>;
      return <MoveButton label="Move" onClick={() => (setNotice(null), setSelected(i))} />;
    }
    if (i === selected) return <MoveButton label="Cancel" tone="plain" onClick={() => setSelected(null)} />;
    if (targets.has(i)) return <MoveButton label="Here" tone="filled" onClick={() => setConfirm({ from: selected, to: i })} />;
    return undefined;
  }

  function tableRows(rows: typeof indexed) {
    return rows.map(({ s, i }) => ({
      key: String(i),
      player: s.player,
      lead: <SlotTile slot={s.slot} />,
      trailing: actionFor(i),
      dimmed: selected !== null && i !== selected && !targets.has(i),
      highlighted: selected === i,
    }));
  }

  function submit() {
    if (!confirm) return;
    const a = slots[confirm.from].player!;
    const b = slots[confirm.to].player;
    startTransition(async () => {
      const res = await safeAction(() => moveLineupAction({
        platform,
        leagueId,
        from: confirm.from,
        to: confirm.to,
        playerId: a.externalId,
        targetPlayerId: b?.externalId ?? null,
      }));
      setConfirm(null);
      setSelected(null);
      setNotice(res.ok ? { kind: "ok", text: res.message } : { kind: "error", text: res.error, reconnect: res.reconnect });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {notice && (
        <div
          role="status"
          className={`rounded-[14px] px-4 py-3 text-[15px] ${notice.kind === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
        >
          {notice.text}
          {notice.reconnect && (
            <Link href="/connections#espn-account" className="ml-2 font-semibold underline">
              Reconnect
            </Link>
          )}
        </div>
      )}
      {selected !== null && (
        <p className="-mb-5 px-5 text-[13px] text-muted">
          Tap <b className="text-accent">Here</b> to move {slots[selected].player?.name}. Changes apply on {platformName} for today.
        </p>
      )}
      <StatControls players={players} source={source} onSource={setSource} mode={mode} onMode={setMode} />
      <section className="flex flex-col gap-1.5">
        <h2 className="group-header">{title} · Starters</h2>
        <StatsTable rows={tableRows(starters)} source={source} mode={mode} points={showFantasyPoints} firstColumn="Slot · Player" />
      </section>
      {bench.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="group-header">Bench & IR</h2>
          <StatsTable rows={tableRows(bench)} source={source} mode={mode} points={showFantasyPoints} firstColumn="Slot · Player" />
        </section>
      )}

      {confirm && (
        <ConfirmSheet
          slots={slots}
          move={confirm}
          platformName={platformName}
          pending={isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={submit}
        />
      )}
    </div>
  );
}

function SlotTile({ slot }: { slot: string }) {
  const tone = slot === "IR" ? "bg-danger-soft text-danger" : slot === "BN" ? "bg-fill text-muted" : "bg-accent-soft text-accent";
  return <span className={`flex h-6 w-9 shrink-0 items-center justify-center rounded-[6px] text-[10px] font-bold ${tone}`}>{slot}</span>;
}

function MoveButton({ label, onClick, tone = "tinted" }: { label: string; onClick: () => void; tone?: "tinted" | "filled" | "plain" }) {
  const cls =
    tone === "filled"
      ? "bg-accent text-white"
      : tone === "plain"
        ? "text-accent"
        : "bg-accent-soft text-accent";
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${cls}`}>
      {label}
    </button>
  );
}

/** iOS-style bottom sheet asking the user to confirm a lineup change. */
function ConfirmSheet({
  slots,
  move,
  platformName,
  pending,
  onCancel,
  onConfirm,
}: {
  slots: RosterSlot[];
  move: { from: number; to: number };
  platformName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const plan = planMove(slots, move.from, move.to);
  const a = slots[move.from];
  const b = slots[move.to];
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={pending ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm overflow-hidden rounded-[22px] bg-surface"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 text-center">
          <h2 id="confirm-title" className="text-[17px] font-semibold">
            {b.player ? "Swap players?" : `Move to ${b.slot}?`}
          </h2>
          <p className="mt-2 text-[15px] text-muted">
            <b className="text-text">{a.player?.name}</b> → {b.slot}
            {b.player && (
              <>
                <br />
                <b className="text-text">{b.player.name}</b> → {a.slot}
              </>
            )}
          </p>
          <p className="mt-3 text-[13px] text-muted">This changes your real lineup on {platformName} for today.</p>
          {!plan.ok && <p className="mt-2 text-[13px] text-danger">{plan.reason}</p>}
        </div>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <button type="button" className="btn btn-primary w-full" disabled={pending || !plan.ok} onClick={onConfirm}>
            {pending ? `Saving to ${platformName}…` : b.player ? "Swap" : "Move"}
          </button>
          <button type="button" className="btn btn-secondary w-full" disabled={pending} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
