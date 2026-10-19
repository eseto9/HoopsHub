"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { cancelPendingAction } from "@/app/actions/moves";
import { safeAction } from "@/lib/safe-action";
import type { ActivityMove, LeagueActivity, Team } from "@/lib/schema";
import { Group, RowBlock } from "./list";
import { PlayerAvatar } from "./player-avatar";
import { Notice, Sheet, type NoticeState } from "./sheet";
import { TeamAvatar } from "./team-avatar";

type TeamInfo = Pick<Team, "id" | "name" | "avatarUrl" | "isMine">;
type Filter = "all" | "moves" | "trades";

const KIND_LABEL: Record<LeagueActivity["kind"], string> = { free_agent: "Free agent", waiver: "Waiver claim", trade: "Trade" };

/** Days and times in the viewer's own time zone (client-rendered). */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function MoveLine({ move, teamName }: { move: ActivityMove; teamName: (id: string | null) => string }) {
  const p = move.player;
  const badge =
    move.action === "added"
      ? { sign: "+", cls: "bg-success text-white" }
      : move.action === "dropped"
        ? { sign: "−", cls: "bg-danger text-white" }
        : { sign: "⇄", cls: "bg-accent text-white" };
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[13px] font-bold leading-none ${badge.cls}`}>
        {badge.sign}
      </span>
      <PlayerAvatar src={p?.headshotUrl} name={p?.name ?? "?"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{p?.name ?? `Player ${move.playerId.split(":")[1]}`}</span>
        <span className="block truncate text-[13px] text-muted">
          {p ? `${p.nbaTeam ?? "FA"} · ${p.positions.join(", ")}` : ""}
          {move.action === "traded" && ` · to ${teamName(move.toTeamId)}`}
          {move.action === "dropped" && " · to free agency"}
        </span>
      </span>
    </div>
  );
}

function ActivityItem({
  a,
  team,
  teamName,
  action,
}: {
  a: LeagueActivity;
  team: (id: string) => TeamInfo | undefined;
  teamName: (id: string | null) => string;
  action?: React.ReactNode;
}) {
  const t = team(a.teamId);
  const others = a.kind === "trade" ? a.teamIds.filter((id) => id !== a.teamId) : [];
  return (
    <RowBlock className="flex-col items-stretch gap-3 py-3.5">
      <div className="flex items-center gap-3">
        <TeamAvatar src={t?.avatarUrl} name={t?.name ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {t?.name ?? "Unknown team"}
            {others.length > 0 && <span className="font-normal text-muted"> ⇄ {others.map((id) => teamName(id)).join(", ")}</span>}
            {t?.isMine && <span className="ml-1.5 text-[12px] font-normal text-muted">(you)</span>}
          </p>
          <p className="text-[13px] text-muted">
            {KIND_LABEL[a.kind]}
            {a.status === "pending" ? " · Pending" : ""} · <time suppressHydrationWarning>{timeLabel(a.date)}</time>
          </p>
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-2.5 pl-1">
        {a.moves.map((m, i) => (
          <MoveLine key={i} move={m} teamName={teamName} />
        ))}
      </div>
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
  const [cancelling, setCancelling] = useState<LeagueActivity | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, start] = useTransition();

  function cancel() {
    if (!cancelling) return;
    const transactionId = cancelling.id.slice(cancelling.id.indexOf(".") + 1);
    start(async () => {
      const res = await safeAction(() => cancelPendingAction({ platform, leagueId, transactionId }));
      setCancelling(null);
      setNotice(res.ok ? { kind: "ok", text: res.message } : { kind: "error", text: res.error, reconnect: res.reconnect });
      if (res.ok) router.refresh();
    });
  }

  const pendingAction = (a: LeagueActivity) => {
    const mine = byId.get(a.teamId)?.isMine;
    if (mine && canAct) {
      return (
        <button type="button" onClick={() => (setNotice(null), setCancelling(a))} className="shrink-0 text-[15px] text-danger">
          Cancel
        </button>
      );
    }
    if (!mine && leagueUrl) {
      return (
        <a href={leagueUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[13px] font-semibold text-accent">
          Respond on {platformName} ↗
        </a>
      );
    }
    return undefined;
  };
  const team = (id: string) => byId.get(id);
  const teamName = (id: string | null) => (id ? (byId.get(id)?.name ?? "another team") : "free agency");

  const shown = feed.filter((a) => (filter === "all" ? true : filter === "trades" ? a.kind === "trade" : a.kind !== "trade"));
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

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "moves", label: "Adds & Drops" },
    { key: "trades", label: "Trades" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <Notice notice={notice} />
      {pending.length > 0 && (
        <Group header="Your pending moves" footer="Only you can see these. Claims process when waivers clear; offers wait for the other manager.">
          {pending.map((a) => (
            <ActivityItem key={a.id} a={a} team={team} teamName={teamName} action={pendingAction(a)} />
          ))}
        </Group>
      )}

      <div className="flex rounded-[10px] bg-fill p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`flex-1 rounded-[8px] px-3 py-1.5 text-[13px] font-medium ${
              filter === f.key ? "bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-text/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <p className="px-5 py-10 text-center text-[15px] text-muted">
          {filter === "trades" ? "No completed trades yet this season." : "No adds or drops yet this season."}
        </p>
      ) : (
        days.map((d) => (
          <Group key={d.label} header={<span suppressHydrationWarning>{d.label}</span>}>
            {d.items.map((a) => (
              <ActivityItem key={a.id} a={a} team={team} teamName={teamName} />
            ))}
          </Group>
        ))
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
            {cancelling.moves.map((m) => `${m.action === "added" ? "Add" : m.action === "dropped" ? "Drop" : "Trade"} ${m.player?.name ?? "player"}`).join(" · ")}
          </p>
        </Sheet>
      )}
    </div>
  );
}
