"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MyTeamSection } from "@/lib/services/leagues";
import { PlatformIcon, platformLabel } from "./platform-badge";
import { StatControls, StatsTable, availableSources, type StatMode, type StatSource } from "./stats-table";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const isBench = (slot: string) => slot === "BN" || slot === "IR" || slot === "TAXI";
const STATUS = { live: "Live", final: "Final", upcoming: "Upcoming" } as const;

/** Every league's roster on one page, one section per league, sharing one set of stat controls. */
export function MyTeamsView({ sections }: { sections: MyTeamSection[] }) {
  const players = useMemo(() => sections.flatMap((s) => s.slots.map((x) => x.player)), [sections]);
  const [source, setSource] = useState<StatSource>(availableSources(players)[0] ?? "projected");
  const [mode, setMode] = useState<StatMode>("avg");
  const [startersOnly, setStartersOnly] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);

  const all = sections.flatMap((s) => s.slots.filter((x) => x.player));
  const playingToday = all.filter((x) => x.player?.schedule?.today).length;
  const injured = all.filter((x) => x.player?.injuryStatus && !isBench(x.slot)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 px-1 text-[15px]">
        <Stat label="Leagues" value={sections.length} />
        <Stat label="Players" value={all.length} />
        <Stat label="Playing today" value={playingToday} />
        {injured > 0 && <Stat label="Injured starters" value={injured} warn />}
      </div>

      {sections.length > 1 && (
        <nav aria-label="Jump to league" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {sections.map((s) => (
            <a key={s.league.id} href={`#${s.league.id}`} className="flex shrink-0 items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[14px] font-medium">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--${s.league.platform})` }} />
              {s.league.name}
            </a>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <StatControls players={players} source={source} onSource={setSource} mode={mode} onMode={setMode} />
        </div>
        <Toggle on={startersOnly} onClick={() => setStartersOnly((x) => !x)}>
          Starters only
        </Toggle>
        <Toggle on={todayOnly} onClick={() => setTodayOnly((x) => !x)}>
          Plays today
        </Toggle>
      </div>

      {sections.map((s) => {
        const base = `/leagues/${s.league.platform}/${s.league.externalId}`;
        // Sleeper players carry no NBA schedule, so "Plays today" can't filter them.
        const rostered = s.slots.filter((x) => x.player);
        const noSchedule = rostered.length > 0 && !rostered.some((x) => x.player?.schedule);
        const shown = s.slots.filter((x) => (!startersOnly || !isBench(x.slot)) && (!todayOnly || noSchedule || x.player?.schedule?.today));
        const m = s.matchup;
        return (
          <section key={s.league.id} id={s.league.id} className="flex scroll-mt-20 flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
              <Link href={base} className="flex min-w-0 items-center gap-2">
                <PlatformIcon platform={s.league.platform} />
                <span className="min-w-0">
                  <span className="block truncate text-[20px] font-bold leading-tight">{s.league.name}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {platformLabel(s.league.platform)} · {s.myTeam.name}
                  </span>
                </span>
              </Link>
              {m && (
                <Link href={`${base}?tab=matchup`} className="flex items-baseline gap-2 text-[15px] tabular-nums">
                  <span className="text-[13px] text-muted">
                    Week {m.period} · {STATUS[m.status]}
                  </span>
                  <span className="font-semibold">{m.me.score === undefined ? "–" : fmt.format(m.me.score)}</span>
                  <span className="text-faint">–</span>
                  <span className="font-semibold">{m.opponent?.score === undefined ? "–" : fmt.format(m.opponent.score)}</span>
                  <span className="max-w-[160px] truncate text-muted">{m.opponent ? m.opponent.team.name : "Bye"}</span>
                </Link>
              )}
            </div>
            {todayOnly && noSchedule && (
              <p className="px-1 text-[13px] text-muted">{platformLabel(s.league.platform)} doesn&apos;t share game schedules, so this team isn&apos;t filtered.</p>
            )}
            {s.error ? (
              <p className="list-group px-4 py-4 text-[15px] text-danger">{s.error}</p>
            ) : shown.length === 0 ? (
              <p className="list-group px-4 py-4 text-[15px] text-muted">{todayOnly ? "Nobody on this team plays today." : "No players."}</p>
            ) : (
              <StatsTable
                rows={shown.map((x, i) => ({
                  key: `${s.league.id}-${i}`,
                  player: x.player,
                  dimmed: isBench(x.slot),
                  lead: (
                    <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-[6px] bg-fill text-[10px] font-bold text-muted">{x.slot}</span>
                  ),
                }))}
                source={source}
                mode={mode}
                points={s.points}
                firstColumn="Slot · Player"
                playerBase={s.hasPlayerPages ? `${base}/player` : undefined}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <span className="rounded-[10px] bg-surface px-3 py-2">
      <span className={`mr-1.5 font-semibold tabular-nums ${warn ? "text-danger" : ""}`}>{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[14px] font-medium ${on ? "bg-accent text-white" : "bg-fill text-text"}`}
    >
      {children}
    </button>
  );
}
