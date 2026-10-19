"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { setWatchedAction } from "@/app/actions/watchlist";
import { safeAction } from "@/lib/safe-action";
import type { InjuryStatus, PlayerListing, PlayerStats, RosterSlot, StatLine, Team } from "@/lib/schema";
import { AddPlayerSheet } from "./add-player-sheet";
import { PlayerAvatar } from "./player-avatar";
import { Notice, type NoticeState } from "./sheet";

type TeamInfo = Pick<Team, "id" | "externalId" | "name" | "isMine">;
type Source = keyof PlayerStats; // "current" | "previous" | "projected"
type Mode = "avg" | "tot";
type Availability = "available" | "free_agent" | "waivers" | "rostered" | "all";

const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C", "G", "F"];
const ROSTERED_MIN = [0, 5, 10, 25, 50];
const GAMES_MIN = [0, 2, 3, 4];
const PAGE = 50;

const INJURY_LABEL: Partial<Record<InjuryStatus, string>> = { OUT: "O", IR: "IR", SUSP: "SSPD", DTD: "DTD", GTD: "GTD", QUES: "Q", OTHER: "INJ" };

/** Stat columns, ESPN order. `key` is a normalized stat key; `rate` formats as .xxx. */
const STAT_COLS: { key: string; label: string; rate?: boolean }[] = [
  { key: "min", label: "MIN" },
  { key: "fgm", label: "FGM" },
  { key: "fga", label: "FGA" },
  { key: "fg_pct", label: "FG%", rate: true },
  { key: "ftm", label: "FTM" },
  { key: "fta", label: "FTA" },
  { key: "ft_pct", label: "FT%", rate: true },
  { key: "3pm", label: "3PM" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "to", label: "TO" },
  { key: "pts", label: "PTS" },
];

const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(3).replace(/^0/, ""));

export function PlayersExplorer({
  pool,
  mySlots,
  watched: initialWatched,
  teams,
  platform,
  leagueId,
  platformName,
  points,
  base,
}: {
  pool: PlayerListing[];
  mySlots: RosterSlot[] | null;
  watched: string[];
  teams: TeamInfo[];
  platform: string;
  leagueId: string;
  platformName: string;
  /** Points league: show fantasy point columns. */
  points: boolean;
  base: string;
}) {
  const router = useRouter();
  const teamById = useMemo(() => new Map<string, TeamInfo>(teams.map((t) => [t.id, t])), [teams]);
  const sources = useMemo(
    () => (["current", "projected", "previous"] as Source[]).filter((s) => pool.some((p) => p.player.stats?.[s])),
    [pool],
  );

  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<Availability>("available");
  const [position, setPosition] = useState("All");
  const [nbaTeam, setNbaTeam] = useState("All");
  const [healthyOnly, setHealthyOnly] = useState(false);
  const [minRostered, setMinRostered] = useState(0);
  const [minGames, setMinGames] = useState(0);
  const [playingToday, setPlayingToday] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);
  const [source, setSource] = useState<Source>(sources[0] ?? "projected");
  const [mode, setMode] = useState<Mode>("avg");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: points ? "fpavg" : "ros", dir: -1 });
  const [shown, setShown] = useState(PAGE);
  const [watched, setWatched] = useState(() => new Set(initialWatched));
  const [adding, setAdding] = useState<PlayerListing | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const nbaTeams = useMemo(() => [...new Set(pool.map((p) => p.player.nbaTeam).filter(Boolean) as string[])].sort(), [pool]);

  const lineOf = (p: PlayerListing): StatLine | undefined => p.player.stats?.[source];
  const statVal = (p: PlayerListing, key: string): number | undefined => {
    const line = lineOf(p);
    if (!line) return undefined;
    return mode === "avg" ? line.perGame[key] : line.totals?.[key];
  };
  const sortVal = (p: PlayerListing, key: string): number | string | undefined => {
    switch (key) {
      case "name":
        return p.player.name;
      case "gms":
        return p.gamesThisWeek;
      case "ros":
        return p.percentRostered;
      case "chg":
        return p.percentRosteredChange;
      case "fptot":
        return lineOf(p)?.fantasyPointsTotal;
      case "fpavg":
        return lineOf(p)?.fantasyPointsPerGame;
      default:
        return statVal(p, key);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = pool.filter((p) => {
      if (availability === "available" && p.status === "rostered") return false;
      if (availability !== "available" && availability !== "all" && p.status !== availability) return false;
      if (position !== "All" && !(p.player.eligibleSlots ?? p.player.positions).includes(position)) return false;
      if (nbaTeam !== "All" && p.player.nbaTeam !== nbaTeam) return false;
      if (healthyOnly && p.player.injuryStatus && p.player.injuryStatus !== "DTD" && p.player.injuryStatus !== "GTD") return false;
      if (minRostered && (p.percentRostered ?? 0) < minRostered) return false;
      if (minGames && p.gamesThisWeek < minGames) return false;
      if (playingToday && !p.today) return false;
      if (watchOnly && !watched.has(p.player.externalId)) return false;
      if (q && !p.player.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return rows.sort((a, b) => {
      const va = sortVal(a, sort.key);
      const vb = sortVal(b, sort.key);
      if (va === undefined && vb === undefined) return 0;
      if (va === undefined) return 1; // missing values last either way
      if (vb === undefined) return -1;
      return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    });
    // sortVal depends on source/mode, which are listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, search, availability, position, nbaTeam, healthyOnly, minRostered, minGames, playingToday, watchOnly, watched, sort, source, mode]);

  const activeFilters =
    (availability !== "available" ? 1 : 0) +
    (position !== "All" ? 1 : 0) +
    (nbaTeam !== "All" ? 1 : 0) +
    (healthyOnly ? 1 : 0) +
    (minRostered ? 1 : 0) +
    (minGames ? 1 : 0) +
    (playingToday ? 1 : 0) +
    (watchOnly ? 1 : 0);

  function reset() {
    setAvailability("available");
    setPosition("All");
    setNbaTeam("All");
    setHealthyOnly(false);
    setMinRostered(0);
    setMinGames(0);
    setPlayingToday(false);
    setWatchOnly(false);
    setSearch("");
  }

  function toggleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === -1 ? 1 : -1 } : { key, dir: key === "name" ? 1 : -1 }));
    setShown(PAGE);
  }

  async function toggleWatch(p: PlayerListing) {
    const id = p.player.externalId;
    const next = !watched.has(id);
    setWatched((w) => {
      const s = new Set(w);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
    const res = await safeAction(() => setWatchedAction({ platform, playerId: id, watched: next }));
    if (!res.ok) {
      setWatched((w) => {
        const s = new Set(w);
        if (next) s.delete(id);
        else s.add(id);
        return s;
      });
    }
  }

  const sourceLabel = (s: Source) => pool.find((p) => p.player.stats?.[s])?.player.stats?.[s]?.label ?? s;

  return (
    <div className="flex flex-col gap-4">
      <Notice notice={notice} />

      {/* Search + filters */}
      <div className="flex flex-col gap-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => (setSearch(e.target.value), setShown(PAGE))}
          placeholder="Search players"
          className="w-full rounded-[10px] bg-fill px-3 py-2 text-[17px] outline-none placeholder:text-faint"
          aria-label="Search players"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip label="Status" value={availability} onChange={(v) => setAvailability(v as Availability)} active={availability !== "available"}
            options={[["available", "Available"], ["free_agent", "Free agents"], ["waivers", "On waivers"], ["rostered", "On rosters"], ["all", "All players"]]} />
          <Chip label="Position" value={position} onChange={setPosition} active={position !== "All"} options={POSITIONS.map((p) => [p, p === "All" ? "All positions" : p])} />
          <Chip label="NBA team" value={nbaTeam} onChange={setNbaTeam} active={nbaTeam !== "All"} options={[["All", "All teams"], ...nbaTeams.map((t) => [t, t])]} />
          <Chip label="Games" value={String(minGames)} onChange={(v) => setMinGames(Number(v))} active={minGames > 0}
            options={GAMES_MIN.map((g) => [String(g), g ? `${g}+ games this week` : "Any games"])} />
          <Chip label="Rostered" value={String(minRostered)} onChange={(v) => setMinRostered(Number(v))} active={minRostered > 0}
            options={ROSTERED_MIN.map((r) => [String(r), r ? `${r}%+ rostered` : "Any % rostered"])} />
          <Toggle label="Plays today" on={playingToday} onToggle={() => setPlayingToday((x) => !x)} />
          <Toggle label="Healthy" on={healthyOnly} onToggle={() => setHealthyOnly((x) => !x)} />
          <Toggle label="★ Watchlist" on={watchOnly} onToggle={() => setWatchOnly((x) => !x)} />
          {activeFilters > 0 && (
            <button type="button" onClick={reset} className="shrink-0 px-2 text-[15px] text-accent">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Stats source / averages vs totals */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 rounded-[10px] bg-fill p-0.5">
          {sources.map((s) => (
            <SegButton key={s} on={source === s} onClick={() => setSource(s)}>
              {sourceLabel(s)}
            </SegButton>
          ))}
        </div>
        <div className="flex rounded-[10px] bg-fill p-0.5">
          <SegButton on={mode === "avg"} onClick={() => setMode("avg")}>Avg</SegButton>
          <SegButton on={mode === "tot"} onClick={() => setMode("tot")}>Totals</SegButton>
        </div>
      </div>

      <p className="px-1 text-[13px] text-muted">
        {filtered.length} player{filtered.length === 1 ? "" : "s"} · tap a column to sort · scroll sideways for more stats
      </p>

      {/* Table: player column pinned, stats scroll horizontally */}
      <div className="list-group overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[14px] tabular-nums">
          <thead>
            <tr className="text-[11px] font-semibold text-muted uppercase">
              <Th sticky onClick={() => toggleSort("name")} sort={sort} k="name" align="left">Player</Th>
              <Th>Opp</Th>
              <Th onClick={() => toggleSort("gms")} sort={sort} k="gms">Gms</Th>
              <Th onClick={() => toggleSort("ros")} sort={sort} k="ros">%Ros</Th>
              <Th onClick={() => toggleSort("chg")} sort={sort} k="chg">+/−</Th>
              {STAT_COLS.map((c) => (
                <Th key={c.key} onClick={() => toggleSort(c.key)} sort={sort} k={c.key}>{c.label}</Th>
              ))}
              {points && (
                <>
                  <Th onClick={() => toggleSort("fptot")} sort={sort} k="fptot">FPTS</Th>
                  <Th onClick={() => toggleSort("fpavg")} sort={sort} k="fpavg">AVG</Th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((p) => {
              const line = lineOf(p);
              const owner = p.fantasyTeamId ? teamById.get(p.fantasyTeamId) : undefined;
              const inj = p.player.injuryStatus ? INJURY_LABEL[p.player.injuryStatus] : undefined;
              const isWatched = watched.has(p.player.externalId);
              return (
                <tr key={p.player.id} className="[&>td]:border-t-[0.5px] [&>td]:border-separator first:[&>td]:border-t-0">
                  <td className="sticky left-0 z-[1] bg-surface py-2 pr-2 pl-3 shadow-[1px_0_0_var(--separator)]">
                    <div className="flex w-[168px] items-center gap-1.5 sm:w-[250px] sm:gap-2">
                      <ActionButton
                        p={p}
                        owner={owner}
                        canAdd={!!mySlots}
                        base={base}
                        onAdd={() => (setNotice(null), setAdding(p))}
                      />
                      <PlayerAvatar src={p.player.headshotUrl} name={p.player.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[14px] leading-tight font-medium">
                          {p.player.name}
                          {inj && <span className="ml-1 text-[10px] font-bold text-danger">{inj}</span>}
                        </div>
                        <div className="truncate text-[11px] text-muted">
                          {p.player.nbaTeam ?? "FA"} · {p.player.positions.join(", ")} · <StatusText p={p} owner={owner} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleWatch(p)}
                        aria-label={isWatched ? `Remove ${p.player.name} from watchlist` : `Add ${p.player.name} to watchlist`}
                        aria-pressed={isWatched}
                        className={`-mr-1 shrink-0 p-1 text-[15px] leading-none ${isWatched ? "text-warning" : "text-faint"}`}
                      >
                        {isWatched ? "★" : "☆"}
                      </button>
                    </div>
                  </td>
                  <Td muted>{p.today ? `${p.today.home ? "" : "@"}${p.today.opponent}` : "–"}</Td>
                  <Td>{p.gamesThisWeek}</Td>
                  <Td>{p.percentRostered !== undefined ? f1.format(p.percentRostered) : "–"}</Td>
                  <Td className={(p.percentRosteredChange ?? 0) > 0 ? "text-success" : (p.percentRosteredChange ?? 0) < 0 ? "text-danger" : "text-muted"}>
                    {p.percentRosteredChange !== undefined ? `${p.percentRosteredChange > 0 ? "+" : ""}${f1.format(p.percentRosteredChange)}` : "–"}
                  </Td>
                  {STAT_COLS.map((c) => {
                    const v = statVal(p, c.key);
                    return <Td key={c.key}>{v === undefined ? "–" : c.rate ? rate(v) : mode === "avg" ? f1.format(v) : f0.format(v)}</Td>;
                  })}
                  {points && (
                    <>
                      <Td>{line?.fantasyPointsTotal !== undefined ? f0.format(line.fantasyPointsTotal) : "–"}</Td>
                      <Td strong>{line?.fantasyPointsPerGame !== undefined ? f1.format(line.fantasyPointsPerGame) : "–"}</Td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-5 py-10 text-center text-[15px] text-muted">No players match these filters.</p>}
      </div>

      {filtered.length > shown && (
        <button type="button" className="btn btn-secondary" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}
      <p className="px-1 text-[13px] text-muted">
        Stats: {sourceLabel(source)}{mode === "avg" ? " per game" : " totals"}. Gms = NBA games left this week (through Sunday). %Ros and +/− are across all ESPN leagues. ★ watchlist is saved in Hoops Hub.
      </p>

      {adding && mySlots && (
        <AddPlayerSheet
          target={adding.player}
          waivers={adding.status === "waivers"}
          waiverClearsAt={adding.waiverClearsAt}
          mySlots={mySlots}
          platform={platform}
          leagueId={leagueId}
          platformName={platformName}
          onClose={(result) => {
            setAdding(null);
            if (result) {
              setNotice(result.notice);
              if (result.changed) router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function StatusText({ p, owner }: { p: PlayerListing; owner?: TeamInfo }) {
  if (p.status === "waivers") {
    const day = p.waiverClearsAt ? new Date(p.waiverClearsAt).toLocaleDateString([], { weekday: "short" }) : "";
    return <span className="text-warning">WA{day ? ` (${day})` : ""}</span>;
  }
  if (p.status === "free_agent") return <span className="text-success">FA</span>;
  return <span>{owner?.isMine ? "Your team" : (owner?.name ?? "Rostered")}</span>;
}

function ActionButton({ p, owner, canAdd, base, onAdd }: { p: PlayerListing; owner?: TeamInfo; canAdd: boolean; base: string; onAdd: () => void }) {
  if (p.status !== "rostered") {
    return canAdd ? (
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add ${p.player.name} to team`}
        title="Add to team"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[17px] leading-none font-semibold text-white ${
          p.status === "waivers" ? "bg-warning" : "bg-success"
        }`}
      >
        +
      </button>
    ) : (
      <span className="w-6 shrink-0" />
    );
  }
  if (owner && !owner.isMine && canAdd) {
    return (
      <Link
        href={`${base}?tab=trade&team=${owner.externalId}`}
        aria-label={`Propose a trade for ${p.player.name}`}
        title="Trade for"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent"
      >
        ⇄
      </Link>
    );
  }
  return <span className="w-6 shrink-0" />;
}

function Th({
  children,
  onClick,
  sort,
  k,
  sticky,
  align = "right",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  sort?: { key: string; dir: 1 | -1 };
  k?: string;
  sticky?: boolean;
  align?: "left" | "right";
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
      {onClick ? (
        <button type="button" onClick={onClick} className={`uppercase ${active ? "text-accent" : ""}`}>
          {children}
          {active ? (sort!.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Td({ children, muted, strong, className = "" }: { children: React.ReactNode; muted?: boolean; strong?: boolean; className?: string }) {
  return (
    <td className={`px-2.5 py-2 text-right whitespace-nowrap ${muted ? "text-muted" : ""} ${strong ? "font-semibold" : ""} ${className}`}>
      {children}
    </td>
  );
}

function Chip({
  label,
  value,
  onChange,
  options,
  active,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (readonly [string, string] | string[])[];
  active: boolean;
}) {
  return (
    <label className={`relative shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium ${active ? "bg-accent text-white" : "bg-fill text-text"}`}>
      <span className="pointer-events-none">
        {options.find((o) => o[0] === value)?.[1] ?? label} ▾
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium ${on ? "bg-accent text-white" : "bg-fill text-text"}`}
    >
      {label}
    </button>
  );
}

function SegButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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
