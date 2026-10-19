"use client";

import Link from "next/link";
import type { InjuryStatus, Player, PlayerStats, StatLine } from "@/lib/schema";
import { PlayerAvatar } from "./player-avatar";

/**
 * ESPN-style stats table shared by Players, Roster and Matchup. The player
 * column is pinned; stat columns scroll sideways only when the screen is
 * too narrow to show them all.
 */

export type StatSource = keyof PlayerStats; // "current" | "previous" | "projected"
export type StatMode = "avg" | "tot";
export type SortState = { key: string; dir: 1 | -1 };

export const STAT_COLS: { key: string; label: string; rate?: boolean }[] = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "to", label: "TO" },
  { key: "fg_pct", label: "FG%", rate: true },
  { key: "ft_pct", label: "FT%", rate: true },
  { key: "min", label: "MIN" },
];

/** Shown after GMS so no stat disappears; still sortable. */
const EXTRA_COLS: { key: string; label: string }[] = [
  { key: "3pm", label: "3PM" },
  { key: "fgm", label: "FGM" },
  { key: "fga", label: "FGA" },
  { key: "ftm", label: "FTM" },
  { key: "fta", label: "FTA" },
];

const INJURY_LABEL: Partial<Record<InjuryStatus, string>> = { OUT: "O", IR: "IR", SUSP: "SSPD", DTD: "DTD", GTD: "GTD", QUES: "Q", OTHER: "INJ" };
const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(3).replace(/^0/, ""));

export function statLineOf(p: Player | null, source: StatSource): StatLine | undefined {
  return p?.stats?.[source];
}

/** Sort/display value for a column key. */
export function columnValue(p: Player | null, key: string, source: StatSource, mode: StatMode): number | string | undefined {
  if (!p) return undefined;
  const line = statLineOf(p, source);
  switch (key) {
    case "name":
      return p.name;
    case "gms":
      return p.schedule?.gamesThisWeek;
    case "ros":
      return p.ownership?.percentRostered;
    case "chg":
      return p.ownership?.percentRosteredChange;
    case "fptot":
      return line?.fantasyPointsTotal;
    case "fpavg":
      return line?.fantasyPointsPerGame;
    default:
      if (!line) return undefined;
      return mode === "avg" ? line.perGame[key] : line.totals?.[key];
  }
}

/** Stat sources present for at least one player, freshest first. */
export function availableSources(players: (Player | null)[]): StatSource[] {
  return (["current", "projected", "previous"] as StatSource[]).filter((s) => players.some((p) => p?.stats?.[s]));
}

export function sourceLabel(players: (Player | null)[], s: StatSource): string {
  return players.find((p) => p?.stats?.[s])?.stats?.[s]?.label ?? s;
}

export interface StatsTableRow {
  key: string;
  /** null = empty roster slot. */
  player: Player | null;
  /** Before the photo: slot tile, + button, Move… */
  lead?: React.ReactNode;
  /** Replaces the default "TEAM · POS" line. */
  meta?: React.ReactNode;
  /** After the name: watchlist star etc. */
  trailing?: React.ReactNode;
  dimmed?: boolean;
  highlighted?: boolean;
}

export function StatsTable({
  rows,
  source,
  mode,
  points,
  sort,
  onSort,
  firstColumn = "Player",
  showOwnership = true,
  compact = false,
  playerBase,
}: {
  rows: StatsTableRow[];
  source: StatSource;
  mode: StatMode;
  /** Points league: show fantasy point columns. */
  points: boolean;
  sort?: SortState;
  onSort?: (key: string) => void;
  firstColumn?: string;
  showOwnership?: boolean;
  /** Half-width layout (matchup side by side): tighter cells, no trailing extra columns. */
  compact?: boolean;
  /** Player page base URL; names link to `${playerBase}/<playerId>`. */
  playerBase?: string;
}) {
  const th = { sort, onSort };
  return (
    <div className="list-group overflow-x-auto">
      <table
        className={`w-full border-separate border-spacing-0 tabular-nums ${compact ? "text-[13px] [&_td]:px-1.5 [&_th]:px-1.5 [&_td:first-child]:pl-2.5 [&_th:first-child]:pl-2.5" : "text-[14px]"}`}
      >
        <thead>
          <tr className="text-[11px] font-semibold text-muted uppercase">
            <Th {...th} k="name" sticky align="left">{firstColumn}</Th>
            <Th {...th}>Opp</Th>
            {points && <Th {...th} k="fpavg">AVG</Th>}
            {STAT_COLS.map((c) => (
              <Th {...th} key={c.key} k={c.key}>{c.label}</Th>
            ))}
            {showOwnership && (
              <>
                <Th {...th} k="ros">%Ros</Th>
                <Th {...th} k="chg">+/−</Th>
              </>
            )}
            <Th {...th} k="gms">Gms</Th>
            {!compact &&
              EXTRA_COLS.map((c) => (
                <Th {...th} key={c.key} k={c.key}>{c.label}</Th>
              ))}
            {points && !compact && <Th {...th} k="fptot">FPTS</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.key} r={r} source={source} mode={mode} points={points} showOwnership={showOwnership} compact={compact} playerBase={playerBase} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  k,
  children,
  sticky,
  align = "right",
  sort,
  onSort,
}: {
  k?: string;
  children: React.ReactNode;
  sticky?: boolean;
  align?: "left" | "right";
  sort?: SortState;
  onSort?: (key: string) => void;
}) {
  const active = sort && k && sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
      className={`border-b-[0.5px] border-separator px-2.5 py-2 whitespace-nowrap ${align === "left" ? "text-left" : "text-right"} ${
        sticky ? "sticky left-0 z-[2] bg-surface pl-3 shadow-[1px_0_0_var(--separator)]" : ""
      }`}
    >
      {onSort && k ? (
        <button type="button" onClick={() => onSort(k)} className={`uppercase ${active ? "text-accent" : ""}`}>
          {children}
          {active ? (sort!.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Row({
  r,
  source,
  mode,
  points,
  showOwnership,
  compact,
  playerBase,
}: {
  r: StatsTableRow;
  source: StatSource;
  mode: StatMode;
  points: boolean;
  showOwnership: boolean;
  compact: boolean;
  playerBase?: string;
}) {
  const p = r.player;
  const line = statLineOf(p, source);
  const inj = p?.injuryStatus ? INJURY_LABEL[p.injuryStatus] : undefined;
  const chg = p?.ownership?.percentRosteredChange;
  const cells = STAT_COLS.length + (compact ? 0 : EXTRA_COLS.length) + 2 + (showOwnership ? 2 : 0) + (points ? (compact ? 1 : 2) : 0);
  const bg = r.highlighted ? "bg-accent-soft" : "bg-surface";
  return (
    <tr className={`[&>td]:border-t-[0.5px] [&>td]:border-separator first:[&>td]:border-t-0 ${r.dimmed ? "opacity-40" : ""}`}>
      <td className={`sticky left-0 z-[1] py-2 pr-2 pl-3 shadow-[1px_0_0_var(--separator)] ${bg}`}>
        <div className={`flex items-center gap-1.5 ${compact ? "w-[150px] xl:w-[176px]" : "w-[168px] sm:w-[250px] sm:gap-2"}`}>
          {r.lead}
          {p ? (
            <>
              <PlayerAvatar src={p.headshotUrl} name={p.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className={`text-[14px] leading-tight font-medium ${compact ? "truncate" : "line-clamp-2"}`} title={compact ? p.name : undefined}>
                  {playerBase ? (
                    <Link href={`${playerBase}/${p.externalId}`} className="hover:text-accent hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    p.name
                  )}
                  {inj && <span className="ml-1 text-[10px] font-bold text-danger">{inj}</span>}
                </div>
                <div className="truncate text-[11px] text-muted">{r.meta ?? `${p.nbaTeam ?? "FA"} · ${p.positions.join(", ")}`}</div>
              </div>
            </>
          ) : (
            <span className="flex-1 text-[14px] text-faint">Empty</span>
          )}
          {r.trailing}
        </div>
      </td>
      {p ? (
        <>
          <Td muted>{p.schedule?.today ? `${p.schedule.today.home ? "" : "@"}${p.schedule.today.opponent}` : "–"}</Td>
          {points && <Td strong>{line?.fantasyPointsPerGame !== undefined ? f1.format(line.fantasyPointsPerGame) : "–"}</Td>}
          {STAT_COLS.map((c) => (
            <StatTd key={c.key} p={p} k={c.key} rateCol={c.rate} source={source} mode={mode} />
          ))}
          {showOwnership && (
            <>
              <Td>{p.ownership ? f1.format(p.ownership.percentRostered) : "–"}</Td>
              <Td className={(chg ?? 0) > 0 ? "text-success" : (chg ?? 0) < 0 ? "text-danger" : "text-muted"}>
                {chg !== undefined ? `${chg > 0 ? "+" : ""}${f1.format(chg)}` : "–"}
              </Td>
            </>
          )}
          <Td>{p.schedule?.gamesThisWeek ?? "–"}</Td>
          {!compact &&
            EXTRA_COLS.map((c) => (
              <StatTd key={c.key} p={p} k={c.key} source={source} mode={mode} />
            ))}
          {points && !compact && <Td>{line?.fantasyPointsTotal !== undefined ? f0.format(line.fantasyPointsTotal) : "–"}</Td>}
        </>
      ) : (
        <td colSpan={cells} className="bg-surface" />
      )}
    </tr>
  );
}

function StatTd({ p, k, rateCol, source, mode }: { p: Player; k: string; rateCol?: boolean; source: StatSource; mode: StatMode }) {
  const v = columnValue(p, k, source, mode) as number | undefined;
  return <Td>{v === undefined ? "–" : rateCol ? rate(v) : mode === "avg" ? f1.format(v) : f0.format(v)}</Td>;
}

function Td({ children, muted, strong, className = "" }: { children: React.ReactNode; muted?: boolean; strong?: boolean; className?: string }) {
  return (
    <td className={`px-2.5 py-2 text-right whitespace-nowrap ${muted ? "text-muted" : ""} ${strong ? "font-semibold" : ""} ${className}`}>
      {children}
    </td>
  );
}

/** Stat source (this season / projections / last season) and averages vs totals. */
export function StatControls({
  players,
  source,
  onSource,
  mode,
  onMode,
}: {
  players: (Player | null)[];
  source: StatSource;
  onSource: (s: StatSource) => void;
  mode: StatMode;
  onMode: (m: StatMode) => void;
}) {
  const sources = availableSources(players);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 rounded-[10px] bg-fill p-0.5">
        {sources.map((s) => (
          <Seg key={s} on={source === s} onClick={() => onSource(s)}>
            {sourceLabel(players, s)}
          </Seg>
        ))}
      </div>
      <div className="flex rounded-[10px] bg-fill p-0.5">
        <Seg on={mode === "avg"} onClick={() => onMode("avg")}>Avg</Seg>
        <Seg on={mode === "tot"} onClick={() => onMode("tot")}>Totals</Seg>
      </div>
    </div>
  );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex-1 rounded-[8px] px-3 py-1.5 text-[13px] font-medium whitespace-nowrap ${on ? "bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-text/80"}`}
    >
      {children}
    </button>
  );
}
