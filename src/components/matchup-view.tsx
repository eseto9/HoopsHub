"use client";

import { useMemo, useState } from "react";
import type { RosterSlot, Team } from "@/lib/schema";
import { StatControls, StatsTable, availableSources, type StatMode, type StatSource } from "./stats-table";

/**
 * Both lineups of a matchup with the same stats table as Roster/Players.
 * Side by side on very wide screens, stacked otherwise.
 */
export function MatchupView({
  sides,
  points,
}: {
  sides: { team: Pick<Team, "id" | "name" | "isMine">; score?: number; slots: RosterSlot[] }[];
  points: boolean;
}) {
  const players = useMemo(() => sides.flatMap((s) => s.slots.map((x) => x.player)), [sides]);
  const [source, setSource] = useState<StatSource>(availableSources(players)[0] ?? "projected");
  const [mode, setMode] = useState<StatMode>("avg");
  const [showBench, setShowBench] = useState(false);
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

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
      <div className="grid gap-6 2xl:grid-cols-2">
        {sides.map((s) => {
          const shown = s.slots.filter((x) => showBench || (x.slot !== "BN" && x.slot !== "IR"));
          return (
            <section key={s.team.id} className="flex min-w-0 flex-col gap-1.5">
              <h2 className="group-header flex items-baseline justify-between gap-2">
                <span className="truncate">
                  {s.team.name}
                  {s.team.isMine ? " (you)" : ""}
                </span>
                {s.score !== undefined && <span className="text-[15px] font-semibold text-text normal-case tabular-nums">{fmt.format(s.score)}</span>}
              </h2>
              <StatsTable
                rows={shown.map((x, i) => ({
                  key: `${s.team.id}-${i}`,
                  player: x.player,
                  lead: <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-[6px] bg-fill text-[10px] font-bold text-muted">{x.slot}</span>,
                }))}
                source={source}
                mode={mode}
                points={points}
                firstColumn="Slot · Player"
                showOwnership={false}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
