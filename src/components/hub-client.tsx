"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveLineupAction } from "@/app/actions/lineup";
import { lineupIssues, type LineupIssue, type TaggedActivity } from "@/lib/hub";
import { safeAction } from "@/lib/safe-action";
import type { MyTeamSection } from "@/lib/services/leagues";
import { PlatformIcon, platformLabel } from "./platform-badge";
import { PlayerAvatar } from "./player-avatar";
import { Notice, type NoticeState } from "./sheet";

const KIND_TEXT: Record<LineupIssue["kind"], string> = { empty: "Empty slot", out: "Out", no_game: "No game today" };
const KIND_CLS: Record<LineupIssue["kind"], string> = { empty: "text-warning", out: "text-danger", no_game: "text-muted" };

// ---------------------------------------------------------------------------
// Lineup Check
// ---------------------------------------------------------------------------

export function LineupCheckView({ sections }: { sections: MyTeamSection[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const checks = sections.map((s) => ({ s, issues: s.error ? [] : lineupIssues(s.slots), undrafted: !s.error && !s.slots.some((x) => x.player) }));
  const total = checks.reduce((n, c) => n + c.issues.length, 0);
  const fixable = checks.reduce((n, c) => n + c.issues.filter((i) => i.fix).length, 0);

  function swap(s: MyTeamSection, issue: LineupIssue) {
    if (!issue.fix) return;
    const key = `${s.league.id}-${issue.slotIndex}`;
    setBusy(key);
    setNotice(null);
    start(async () => {
      const res = await safeAction(() =>
        moveLineupAction({
          platform: s.league.platform,
          leagueId: s.league.externalId,
          from: issue.fix!.from,
          to: issue.slotIndex,
          playerId: issue.fix!.player.externalId,
          targetPlayerId: issue.player?.externalId ?? null,
        }),
      );
      setBusy(null);
      setNotice(res.ok ? { kind: "ok", text: `${issue.fix!.player.name} moved into ${issue.slot} in ${s.league.name}.` } : { kind: "error", text: res.error });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Notice notice={notice} />
      <p className={`rounded-[12px] px-4 py-3 text-[15px] ${total ? "bg-warning/10" : "bg-success/10 text-success"}`}>
        {total
          ? `${total} lineup ${total === 1 ? "issue" : "issues"} across ${checks.filter((c) => c.issues.length).length} ${checks.filter((c) => c.issues.length).length === 1 ? "league" : "leagues"}${fixable ? `, ${fixable} with a bench fix` : ""}.`
          : "Every lineup is set: no injured starters, no empty slots, and nobody on your bench has a game while a starter sits."}
      </p>
      {checks.map(({ s, issues, undrafted }) => (
        <section key={s.league.id} className="flex flex-col gap-1.5">
          <h2 className="group-header flex items-center gap-2">
            <PlatformIcon platform={s.league.platform} />
            <span className="truncate normal-case text-[15px] font-semibold text-text">{s.league.name}</span>
            <span className="truncate normal-case">· {s.myTeam.name}</span>
          </h2>
          <div className="list-group">
            {s.error ? (
              <p className="px-4 py-3 text-[15px] text-danger">{s.error}</p>
            ) : undrafted ? (
              <p className="px-4 py-3 text-[15px] text-muted">This league hasn&apos;t drafted yet.</p>
            ) : issues.length === 0 ? (
              <p className="px-4 py-3 text-[15px] text-success">All set.</p>
            ) : (
              issues.map((issue) => {
                const key = `${s.league.id}-${issue.slotIndex}`;
                return (
                  <div key={key} className="row-block">
                    <div className="row-body flex-wrap gap-3">
                      <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded-[6px] bg-fill text-[10px] font-bold text-muted">{issue.slot}</span>
                      <span className="flex min-w-[160px] flex-1 items-center gap-2">
                        {issue.player && <PlayerAvatar src={issue.player.headshotUrl} name={issue.player.name} size="sm" />}
                        <span className="min-w-0">
                          <span className="block truncate text-[15px]">{issue.player?.name ?? "Nobody"}</span>
                          <span className={`block text-[13px] ${KIND_CLS[issue.kind]}`}>{KIND_TEXT[issue.kind]}</span>
                        </span>
                      </span>
                      {issue.fix ? (
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] text-muted">Start</span>
                          <PlayerAvatar src={issue.fix.player.headshotUrl} name={issue.fix.player.name} size="sm" />
                          <span className="max-w-[140px] truncate text-[15px] font-medium">{issue.fix.player.name}</span>
                          {s.canEditLineup ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => swap(s, issue)}
                              className="rounded-full bg-accent px-3 py-1.5 text-[14px] font-semibold text-white disabled:opacity-50"
                            >
                              {busy === key ? "Moving…" : "Swap"}
                            </button>
                          ) : (
                            <a href={s.league.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-accent">
                              Do it on {platformLabel(s.league.platform)} ↗
                            </a>
                          )}
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">No bench player can fill it</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combined Activity
// ---------------------------------------------------------------------------

const ACTION_SIGN: Record<string, { sign: string; cls: string }> = {
  added: { sign: "+", cls: "bg-success text-white" },
  dropped: { sign: "−", cls: "bg-danger text-white" },
  traded: { sign: "⇄", cls: "bg-accent text-white" },
};

export function ActivityHubView({ items }: { items: TaggedActivity[] }) {
  const [mineOnly, setMineOnly] = useState(false);
  const shown = items.filter((x) => !mineOnly || x.mine);
  const teamName = (x: TaggedActivity, id: string | null) => (id ? (x.teams.find((t) => t.id === id)?.name ?? "another team") : "free agency");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-[10px] bg-fill p-0.5 sm:max-w-sm">
        {[
          [false, "Everything"],
          [true, "Involves me"],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={mineOnly === v}
            onClick={() => setMineOnly(v as boolean)}
            className={`flex-1 rounded-[8px] px-3 py-1.5 text-[13px] font-medium ${mineOnly === v ? "bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-text/80"}`}
          >
            {label as string}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[15px] text-muted">{mineOnly ? "Nothing involving your teams or players yet." : "No league activity yet."}</p>
      ) : (
        <div className="list-group">
          {shown.map((x) => {
            const a = x.activity;
            const actor = a.teamId ? x.teams.find((t) => t.id === a.teamId) : undefined;
            return (
              <div key={a.id} className="row-block">
                <div className="row-body flex-col items-stretch gap-2 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted">
                    <Link
                      href={`/leagues/${x.league.platform}/${x.league.externalId}?tab=activity`}
                      className="flex items-center gap-1.5 font-semibold text-text"
                    >
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: `var(--${x.league.platform})` }} />
                      {x.league.name}
                    </Link>
                    <span>·</span>
                    <span className={actor?.isMine ? "font-semibold text-accent" : ""}>{actor?.name ?? (a.kind === "league" ? "League" : "")}</span>
                    <span>·</span>
                    <time dateTime={a.date} suppressHydrationWarning>
                      {new Date(a.date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </time>
                    {x.mine && <span className="rounded-full bg-accent-soft px-2 text-[11px] font-semibold text-accent">You</span>}
                  </div>
                  {a.moves.map((m, i) => {
                    const b = ACTION_SIGN[m.action] ?? { sign: "↕", cls: "bg-fill text-muted" };
                    return (
                      <div key={i} className="flex items-center gap-2.5">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${b.cls}`}>{b.sign}</span>
                        <PlayerAvatar src={m.player?.headshotUrl} name={m.player?.name ?? "?"} size="sm" />
                        <span className="min-w-0 truncate text-[15px]">
                          {m.player?.name ?? "Player"}
                          <span className="text-[13px] text-muted">
                            {m.action === "traded" ? ` · to ${teamName(x, m.toTeamId)}` : m.action === "dropped" ? " · dropped" : m.action === "added" ? " · added" : ""}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  {a.lines?.map((l, i) => (
                    <p key={i} className="text-[15px]">
                      {l}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
