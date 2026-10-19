"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { cancelPendingAction, respondToTradeAction } from "@/app/actions/moves";
import { safeAction } from "@/lib/safe-action";
import type { ActivityMove, LeagueActivity, Team } from "@/lib/schema";
import { Group, RowBlock } from "./list";
import { PlayerAvatar } from "./player-avatar";
import { Notice, Sheet, type NoticeState } from "./sheet";
import { TeamAvatar } from "./team-avatar";

type TeamInfo = Pick<Team, "id" | "name" | "avatarUrl" | "isMine">;
type Filter = "all" | "moves" | "trades" | "lineup" | "league";

const KIND_LABEL: Record<LeagueActivity["kind"], string> = {
  free_agent: "Free agent",
  waiver: "Waiver claim",
  trade: "Trade",
  lineup: "Lineup",
  league: "League",
};

// Lineup shuffles are frequent, so they get their own filter instead of crowding All.
const FILTERS: { key: Filter; label: string; empty: string; match: (a: LeagueActivity) => boolean }[] = [
  { key: "all", label: "All", empty: "No league activity yet this season.", match: (a) => a.kind !== "lineup" },
  { key: "moves", label: "Adds & Drops", empty: "No adds or drops yet this season.", match: (a) => a.kind === "free_agent" || a.kind === "waiver" },
  { key: "trades", label: "Trades", empty: "No completed trades yet this season.", match: (a) => a.kind === "trade" },
  { key: "league", label: "League", empty: "No league updates yet.", match: (a) => a.kind === "league" },
  { key: "lineup", label: "Lineups", empty: "No lineup moves yet.", match: (a) => a.kind === "lineup" },
];

/** Days and times in the viewer's own time zone (client-rendered). */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function MoveLine({ move, teamName, playerBase }: { move: ActivityMove; teamName: (id: string | null) => string; playerBase: string }) {
  const p = move.player;
  const badge =
    move.action === "added"
      ? { sign: "+", cls: "bg-success text-white" }
      : move.action === "dropped"
        ? { sign: "−", cls: "bg-danger text-white" }
        : move.action === "moved"
          ? { sign: "↕", cls: "bg-fill text-muted" }
          : { sign: "⇄", cls: "bg-accent text-white" };
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[13px] font-bold leading-none ${badge.cls}`}>
        {badge.sign}
      </span>
      <PlayerAvatar src={p?.headshotUrl} name={p?.name ?? "?"} size={move.action === "moved" ? "sm" : "md"} />
      <span className="min-w-0 flex-1">
        <Link href={`${playerBase}/${move.playerId.split(":")[1]}`} className="block truncate text-[15px] hover:text-accent">
          {p?.name ?? `Player ${move.playerId.split(":")[1]}`}
        </Link>
        <span className="block truncate text-[13px] text-muted">
          {p ? `${p.nbaTeam ?? "FA"} · ${p.positions.join(", ")}` : ""}
          {move.action === "traded" && ` · to ${teamName(move.toTeamId)}`}
          {move.action === "dropped" && " · to free agency"}
        </span>
      </span>
      {move.action === "moved" && (
        <span className="shrink-0 text-[13px] font-semibold text-muted tabular-nums">
          {move.fromSlot ?? "?"} → <span className="text-text">{move.toSlot ?? "?"}</span>
        </span>
      )}
    </div>
  );
}

function ActivityItem({
  a,
  team,
  teamName,
  action,
  playerBase,
}: {
  a: LeagueActivity;
  team: (id: string | null) => TeamInfo | undefined;
  teamName: (id: string | null) => string;
  action?: React.ReactNode;
  playerBase: string;
}) {
  const t = team(a.teamId);
  const others = a.kind === "trade" ? a.teamIds.filter((id) => id !== a.teamId) : [];
  return (
    <RowBlock className="flex-col items-stretch gap-3 py-3.5">
      <div className="flex items-center gap-3">
        {t || a.kind !== "league" ? (
          <TeamAvatar src={t?.avatarUrl} name={t?.name ?? "?"} />
        ) : (
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-[16px]">
            🏀
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {t?.name ?? (a.kind === "league" ? "League" : "Unknown team")}
            {t?.isMine && <span className="ml-1 text-[12px] font-normal text-muted">(you)</span>}
            {others.length > 0 && <span className="font-normal text-muted"> ⇄ {others.map((id) => teamName(id)).join(", ")}</span>}
          </p>
          <p className="text-[13px] text-muted">
            {KIND_LABEL[a.kind]}
            {a.status === "pending" ? " · Pending" : ""} · <time suppressHydrationWarning>{timeLabel(a.date)}</time>
          </p>
        </div>
        {action}
      </div>
      {a.moves.length > 0 && (
        <div className="flex flex-col gap-2.5 pl-1">
          {a.moves.map((m, i) => (
            <MoveLine key={i} move={m} teamName={teamName} playerBase={playerBase} />
          ))}
        </div>
      )}
      {a.lines && a.lines.length > 0 && (
        <ul className="flex flex-col gap-1 pl-1 text-[15px]">
          {a.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </RowBlock>
  );
}

export function ActivityFeed({
  feed,
  pending,
  teams,
  platform,
  leagueId,
  platformName,
  leagueUrl,
  canAct,
}: {
  feed: LeagueActivity[];
  pending: LeagueActivity[];
  teams: TeamInfo[];
  platform: string;
  leagueId: string;
  platformName: string;
  leagueUrl?: string;
  /** Connected through the user's account, so their own pending moves can be cancelled. */
  canAct: boolean;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map<string, TeamInfo>(teams.map((t) => [t.id, t])), [teams]);
  const [filter, setFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [cancelling, setCancelling] = useState<LeagueActivity | null>(null);
  const [answering, setAnswering] = useState<{ a: LeagueActivity; accept: boolean } | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, start] = useTransition();

  function cancel() {
    if (!cancelling) return;
    const transactionId = cancelling.id.slice(cancelling.id.indexOf(".") + 1);
    start(async () => {
      const res = await safeAction(() => cancelPendingAction({ platform, leagueId, transactionId }));
      setCancelling(null);
      setNotice(res.ok ? { kind: "ok", text: res.message } : { kind: "error", text: res.error, reconnect: res.reconnect });
      if (res.ok || ("stale" in res && res.stale)) router.refresh();
    });
  }

  function answer() {
    if (!answering) return;
    const { a, accept } = answering;
    const transactionId = a.id.slice(a.id.indexOf(".") + 1);
    start(async () => {
      const res = await safeAction(() => respondToTradeAction({ platform, leagueId, transactionId, accept }));
      setAnswering(null);
      setNotice(res.ok ? { kind: "ok", text: res.message } : { kind: "error", text: res.error, reconnect: res.reconnect });
      if (res.ok || ("stale" in res && res.stale)) router.refresh();
    });
  }

  const pendingAction = (a: LeagueActivity) => {
    const mine = a.teamId ? byId.get(a.teamId)?.isMine : false;
    if (mine && canAct) {
      return (
        <button type="button" onClick={() => (setNotice(null), setCancelling(a))} className="shrink-0 text-[15px] text-danger">
          Cancel
        </button>
      );
    }
    if (!mine && a.kind === "trade" && a.accepted) {
      return <span className="shrink-0 text-[13px] text-muted">Accepted · in review</span>;
    }
    if (!mine && a.kind === "trade" && canAct) {
      return (
        <span className="flex shrink-0 gap-2">
          <button type="button" onClick={() => (setNotice(null), setAnswering({ a, accept: false }))} className="rounded-full bg-fill px-3 py-1.5 text-[14px] font-medium text-danger">
            Decline
          </button>
          <button type="button" onClick={() => (setNotice(null), setAnswering({ a, accept: true }))} className="rounded-full bg-accent px-3 py-1.5 text-[14px] font-semibold text-white">
            Accept
          </button>
        </span>
      );
    }
    if (!mine && leagueUrl) {
      return (
        <a href={leagueUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[13px] font-semibold text-accent">
          Review on {platformName} ↗
        </a>
      );
    }
    return undefined;
  };
  const team = (id: string | null) => (id ? byId.get(id) : undefined);
  const playerBase = `/leagues/${platform}/${leagueId}/player`;
  // Offers someone else proposed that involve you are waiting on your answer.
  const isMine = (a: LeagueActivity) => !!(a.teamId && byId.get(a.teamId)?.isMine);
  const incoming = pending.filter((a) => a.kind === "trade" && !isMine(a));
  const outgoing = pending.filter((a) => !incoming.includes(a));
  const teamName = (id: string | null) => (id ? (byId.get(id)?.name ?? "another team") : "free agency");

  const active = FILTERS.find((f) => f.key === filter)!;
  const shown = useMemo(
    () => feed.filter((a) => active.match(a) && (!teamFilter || a.teamIds.includes(teamFilter as LeagueActivity["teamIds"][number]))),
    [feed, active, teamFilter],
  );
  const days = useMemo(() => {
    const groups: { label: string; items: LeagueActivity[] }[] = [];
    for (const a of shown) {
      const label = dayLabel(a.date);
      const last = groups.at(-1);
      if (last?.label === label) last.items.push(a);
      else groups.push({ label, items: [a] });
    }
    return groups;
  }, [shown]);

  return (
    <div className="flex flex-col gap-8">
      <Notice notice={notice} />
      {incoming.length > 0 && (
        <Group
          header="Trade offers to you"
          footer={canAct ? "Accepted trades may wait out a league review period before players move." : `Answer these on ${platformName}.`}
        >
          {incoming.map((a) => (
            <ActivityItem key={a.id} a={a} team={team} teamName={teamName} action={pendingAction(a)} playerBase={playerBase} />
          ))}
        </Group>
      )}

      {outgoing.length > 0 && (
        <Group header="Your pending moves" footer="Only you can see these. Claims process when waivers clear; offers wait for the other manager.">
          {outgoing.map((a) => (
            <ActivityItem key={a.id} a={a} team={team} teamName={teamName} action={pendingAction(a)} playerBase={playerBase} />
          ))}
        </Group>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 basis-full overflow-x-auto rounded-[10px] bg-fill p-0.5 [scrollbar-width:none] sm:basis-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`flex-1 rounded-[8px] px-3 py-1.5 text-[13px] font-medium whitespace-nowrap ${
                filter === f.key ? "bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-text/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Team"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="h-[34px] w-full rounded-[10px] sm:w-auto sm:max-w-[240px] bg-fill px-3 text-[13px] font-medium"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.isMine ? " (you)" : ""}
            </option>
          ))}
        </select>
      </div>

      {days.length === 0 ? (
        <p className="px-5 py-10 text-center text-[15px] text-muted">{active.empty}</p>
      ) : (
        days.map((d) => (
          <Group key={d.label} header={<span suppressHydrationWarning>{d.label}</span>}>
            {d.items.map((a) => (
              <ActivityItem key={a.id} a={a} team={team} teamName={teamName} playerBase={playerBase} />
            ))}
          </Group>
        ))
      )}

      {answering && (
        <Sheet
          title={answering.accept ? "Accept this trade?" : "Decline this trade?"}
          confirmLabel={answering.accept ? "Accept Trade" : "Decline Trade"}
          pendingLabel={`Sending to ${platformName}…`}
          pending={busy}
          destructive={!answering.accept}
          onConfirm={answer}
          onCancel={() => setAnswering(null)}
        >
          <div className="flex flex-col gap-1 text-center text-[15px]">
            {answering.a.moves.map((m, i) => {
              const toMe = !!(m.toTeamId && byId.get(m.toTeamId)?.isMine);
              return (
                <p key={i} className={toMe ? "text-success" : "text-danger"}>
                  {toMe ? "You get" : "You give"} {m.player?.name ?? "a player"}
                </p>
              );
            })}
            {answering.accept && <p className="mt-2 text-[13px] text-muted">If your league reviews trades, players move once the review period ends.</p>}
          </div>
        </Sheet>
      )}

      {cancelling && (
        <Sheet
          title={cancelling.kind === "trade" ? "Cancel trade offer?" : "Cancel waiver claim?"}
          confirmLabel={cancelling.kind === "trade" ? "Cancel Offer" : "Cancel Claim"}
          pendingLabel={`Cancelling on ${platformName}…`}
          pending={busy}
          destructive
          onConfirm={cancel}
          onCancel={() => setCancelling(null)}
        >
          <p className="text-center text-[15px] text-muted">
            {cancelling.moves
              .map((m) => `${m.action === "added" ? "Add" : m.action === "dropped" ? "Drop" : "Trade"} ${m.player?.name ?? "player"}`)
              .join(" · ")}
          </p>
        </Sheet>
      )}
    </div>
  );
}
