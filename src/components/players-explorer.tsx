"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { setWatchedAction } from "@/app/actions/watchlist";
import { safeAction } from "@/lib/safe-action";
import type { PlayerListing, RosterSlot, Team } from "@/lib/schema";
import { AddPlayerSheet } from "./add-player-sheet";
import { Notice, type NoticeState } from "./sheet";
import { availableSources, columnValue, sourceLabel, StatControls, StatsTable, type SortState, type StatMode, type StatSource } from "./stats-table";

type TeamInfo = Pick<Team, "id" | "externalId" | "name" | "isMine">;
type Availability = "available" | "free_agent" | "waivers" | "rostered" | "all";

const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C", "G", "F"];
const ROSTERED_MIN = [0, 5, 10, 25, 50];
const GAMES_MIN = [0, 2, 3, 4];
const PAGE = 50;

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
  points: boolean;
  base: string;
}) {
  const router = useRouter();
  const teamById = useMemo(() => new Map<string, TeamInfo>(teams.map((t) => [t.id, t])), [teams]);
  const players = useMemo(() => pool.map((p) => p.player), [pool]);

  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<Availability>("available");
  const [position, setPosition] = useState("All");
  const [nbaTeam, setNbaTeam] = useState("All");
  const [healthyOnly, setHealthyOnly] = useState(false);
  const [minRostered, setMinRostered] = useState(0);
  const [minGames, setMinGames] = useState(0);
  const [playingToday, setPlayingToday] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);
  const [source, setSource] = useState<StatSource>(availableSources(players)[0] ?? "projected");
  const [mode, setMode] = useState<StatMode>("avg");
  const [sort, setSort] = useState<SortState>({ key: points ? "fpavg" : "ros", dir: -1 });
  const [shown, setShown] = useState(PAGE);
  const [watched, setWatched] = useState(() => new Set(initialWatched));
  const [adding, setAdding] = useState<PlayerListing | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const nbaTeams = useMemo(() => [...new Set(pool.map((p) => p.player.nbaTeam).filter(Boolean) as string[])].sort(), [pool]);

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
      const va = columnValue(a.player, sort.key, source, mode);
      const vb = columnValue(b.player, sort.key, source, mode);
      if (va === undefined && vb === undefined) return 0;
      if (va === undefined) return 1; // missing values last either way
      if (vb === undefined) return -1;
      return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    });
  }, [pool, search, availability, position, nbaTeam, healthyOnly, minRostered, minGames, playingToday, watchOnly, watched, sort, source, mode]);

  const activeFilters = [availability !== "available", position !== "All", nbaTeam !== "All", healthyOnly, minRostered > 0, minGames > 0, playingToday, watchOnly].filter(Boolean).length;

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
    const flip = (on: boolean) =>
      setWatched((w) => {
        const s = new Set(w);
        if (on) s.add(id);
        else s.delete(id);
        return s;
      });
    flip(next);
    const res = await safeAction(() => setWatchedAction({ platform, playerId: id, watched: next }));
    if (!res.ok) flip(!next);
  }

  const rows = filtered.slice(0, shown).map((p) => {
    const owner = p.fantasyTeamId ? teamById.get(p.fantasyTeamId) : undefined;
    const isWatched = watched.has(p.player.externalId);
    return {
      key: p.player.id,
      player: p.player,
      lead: <ActionButton p={p} owner={owner} canAdd={!!mySlots} base={base} onAdd={() => (setNotice(null), setAdding(p))} />,
      meta: (
        <>
          {p.player.nbaTeam ?? "FA"} · {p.player.positions.join(", ")} · <StatusText p={p} owner={owner} />
        </>
      ),
      trailing: (
        <button
          type="button"
          onClick={() => toggleWatch(p)}
          aria-label={isWatched ? `Remove ${p.player.name} from watchlist` : `Add ${p.player.name} to watchlist`}
          aria-pressed={isWatched}
          className={`-mr-1 shrink-0 p-1 text-[15px] leading-none ${isWatched ? "text-warning" : "text-faint"}`}
        >
          {isWatched ? "★" : "☆"}
        </button>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <Notice notice={notice} />

      <div className="flex flex-col gap-2.5">
        <input
          type="search"
          id="player-search"
          value={search}
          onChange={(e) => (setSearch(e.target.value), setShown(PAGE))}
          placeholder="Search players"
          className="w-full rounded-[10px] bg-fill px-3 py-2 text-[17px] outline-none placeholder:text-faint"
          aria-label="Search players"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
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

      <StatControls players={players} source={source} onSource={setSource} mode={mode} onMode={setMode} />

      <p className="px-1 text-[13px] text-muted">
        {filtered.length} player{filtered.length === 1 ? "" : "s"} · tap a column to sort
      </p>

      <StatsTable rows={rows} source={source} mode={mode} points={points} sort={sort} onSort={toggleSort} playerBase={`${base}/player`} />
      {filtered.length === 0 && <p className="px-5 py-6 text-center text-[15px] text-muted">No players match these filters.</p>}

      {filtered.length > shown && (
        <button type="button" className="btn btn-secondary" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}
      <p className="px-1 text-[13px] text-muted">
        Stats: {sourceLabel(players, source)}{mode === "avg" ? " per game" : " totals"}. Gms = NBA games left this week (through Sunday). %Ros and +/− are across all {platformName} leagues. ★ watchlist is saved in Hoops Hub.
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

function Chip({ label, value, onChange, options, active }: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string] | string[])[]; active: boolean }) {
  return (
    <label className={`relative shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium ${active ? "bg-accent text-white" : "bg-fill text-text"}`}>
      <span className="pointer-events-none">{options.find((o) => o[0] === value)?.[1] ?? label} ▾</span>
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
    <button type="button" onClick={onToggle} aria-pressed={on} className={`shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium ${on ? "bg-accent text-white" : "bg-fill text-text"}`}>
      {label}
    </button>
  );
}
