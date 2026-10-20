"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RosterSlot, Team } from "@/lib/schema";
import { StatControls, StatsTable, availableSources, type StatMode, type StatSource } from "./stats-table";

const WIDE = "(min-width: 1024px)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * Both lineups of a matchup with the same stats table as Roster/Players.
 * Side by side from 1024px, with rows lined up slot for slot and both
 * tables scrolling sideways together; stacked on smaller screens.
 */
export function MatchupView({
  sides,
  points,
  playerBase,
}: {
  sides: { team: Pick<Team, "id" | "name" | "isMine">; scoreText?: string; slots: RosterSlot[] }[];
  points: boolean;
  playerBase?: string;
}) {
  const players = useMemo(() => sides.flatMap((s) => s.slots.map((x) => x.player)), [sides]);
  const [source, setSource] = useState<StatSource>(availableSources(players)[0] ?? "projected");
  const [mode, setMode] = useState<StatMode>("avg");
  const [showBench, setShowBench] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const grid = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const shown = sides.map((s) => s.slots.filter((x) => showBench || (x.slot !== "BN" && x.slot !== "IR")));
  // Pad the shorter side so the same slot sits on the same row.
  const rowsPerSide = wide ? Math.max(0, ...shown.map((x) => x.length)) : 0;

  function syncScroll(e: React.UIEvent<HTMLDivElement>) {
    const src = e.target as HTMLElement;
    if (!wide || syncing.current || !src.classList.contains("list-group")) return;
    syncing.current = true;
    grid.current?.querySelectorAll<HTMLElement>(".list-group").forEach((el) => {
      if (el !== src) el.scrollLeft = src.scrollLeft;
    });
    requestAnimationFrame(() => (syncing.current = false));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <StatControls players={players} source={source} onSource={setSource} mode={mode} onMode={setMode} />
        </div>
        <button
          type="button"
          aria-pressed={showBench}
          onClick={() => setShowBench((x) => !x)}
          className={`ml-auto rounded-full px-3 py-1.5 text-[14px] font-medium ${showBench ? "bg-accent text-white" : "bg-fill text-text"}`}
        >
          Show bench
        </button>
      </div>
      <div ref={grid} onScrollCapture={syncScroll} className="grid gap-6 lg:grid-cols-2 lg:gap-4">
        {sides.map((s, si) => {
          const slots = shown[si];
          const pad = Math.max(0, rowsPerSide - slots.length);
          return (
            <section key={s.team.id} className="flex min-w-0 flex-col gap-1.5">
              <h2 className="group-header flex items-baseline justify-between gap-2">
                <span className="truncate">
                  {s.team.name}
                  {s.team.isMine ? " (you)" : ""}
                </span>
                {s.scoreText && <span className="text-[15px] font-semibold text-text normal-case tabular-nums">{s.scoreText}</span>}
              </h2>
              <StatsTable
                rows={[
                  ...slots.map((x, i) => ({ key: `${s.team.id}-${i}`, player: x.player, lead: <SlotTag>{x.slot}</SlotTag> })),
                  ...Array.from({ length: pad }, (_, i) => ({ key: `${s.team.id}-pad-${i}`, player: null, lead: <SlotTag>BN</SlotTag>, dimmed: true })),
                ]}
                source={source}
                mode={mode}
                points={points}
                firstColumn="Slot · Player"
                showOwnership={false}
                compact={wide}
                playerBase={playerBase}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SlotTag({ children }: { children: React.ReactNode }) {
  return <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-[6px] bg-fill text-[10px] font-bold text-muted">{children}</span>;
}
