import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "@/components/icons";
import { Group } from "@/components/list";
import { platformLabel } from "@/components/platform-badge";
import { PlayerActions } from "@/components/player-actions";
import { PlayerAvatar } from "@/components/player-avatar";
import { LocalDate, LocalDateTime } from "@/components/local-time";
import { PLATFORMS, type GameLogEntry, type Platform, type StatLine } from "@/lib/schema";
import { getPlayerPage, resolveLeague } from "@/lib/services/leagues";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Player" };

const COLS: { key: string; label: string; rate?: boolean }[] = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "to", label: "TO" },
  { key: "fg_pct", label: "FG%", rate: true },
  { key: "ft_pct", label: "FT%", rate: true },
  { key: "3pm", label: "3PM" },
  { key: "min", label: "MIN" },
];
const INJURY: Record<string, string> = { OUT: "Out", IR: "Injured reserve", SUSP: "Suspended", DTD: "Day-to-day", GTD: "Game-time decision", QUES: "Questionable", OTHER: "Injured" };
const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(3).replace(/^0/, ""));
const fmt = (v: number | undefined, isRate?: boolean, whole?: boolean) => (v === undefined ? "–" : isRate ? rate(v) : whole ? f0.format(v) : f1.format(v));

export default function PlayerPage({ params }: PageProps<"/leagues/[platform]/[leagueId]/player/[playerId]">) {
  return (
    <Suspense fallback={<div className="list-group h-80 animate-pulse" />}>
      <PlayerView params={params} />
    </Suspense>
  );
}

async function PlayerView({ params }: { params: Promise<{ platform: string; leagueId: string; playerId: string }> }) {
  const { platform, leagueId, playerId } = await params;
  if (!PLATFORMS.includes(platform as Platform) || !/^\d+$/.test(leagueId) || !/^\d+$/.test(playerId)) notFound();
  const user = await requireUser();
  const resolved = await resolveLeague(user.id, platform as Platform, leagueId);
  if (!resolved) notFound();
  const page = await getPlayerPage(resolved, playerId);
  if (!page) notFound();

  const { detail, owner } = page;
  const { listing } = detail;
  const p = listing.player;
  const base = `/leagues/${platform}/${leagueId}`;
  const points = resolved.league.format === "h2h-points" || resolved.league.format === "points";
  const status =
    listing.status === "free_agent" ? "Free agent" : listing.status === "waivers" ? "On waivers" : owner?.isMine ? "On your team" : owner ? `On ${owner.name}` : "Rostered";

  return (
    <div className="flex flex-col gap-6">
      <Link href={`${base}?tab=players`} className="-mb-2 inline-flex items-center gap-1 self-start text-[17px] text-accent">
        <ChevronRight className="h-4 w-4 rotate-180" />
        {resolved.league.name}
      </Link>

      <header className="flex items-center gap-4 px-1">
        <PlayerAvatar src={p.headshotUrl} name={p.name} size="lg" />
        <div className="min-w-0">
          <h1 className="large-title text-balance">{p.name}</h1>
          <p className="mt-1 text-[15px] text-muted">
            {p.nbaTeam ?? "Free agent"} · {p.positions.join(", ")}
            {p.injuryStatus && <span className="ml-1.5 font-semibold text-danger">{INJURY[p.injuryStatus] ?? p.injuryStatus}</span>}
          </p>
          <p className="text-[15px]">
            <span className={listing.status === "free_agent" ? "text-success" : listing.status === "waivers" ? "text-warning" : ""}>{status}</span>
            {listing.status === "waivers" && listing.waiverClearsAt && (
              <span className="text-muted">
                {" "}
                · clears <LocalDate iso={listing.waiverClearsAt} />
              </span>
            )}
            {listing.percentRostered !== undefined && <span className="text-muted"> · {f1.format(listing.percentRostered)}% rostered</span>}
          </p>
        </div>
      </header>

      <PlayerActions
        listing={listing}
        mySlots={page.mySlots}
        watched={page.watched}
        tradeHref={page.canTrade && owner ? `${base}?tab=trade&team=${owner.externalId}` : undefined}
        platform={platform}
        leagueId={leagueId}
        platformName={platformLabel(resolved.league.platform)}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-1.5">
            <h2 className="group-header">Stats</h2>
            <StatGrid
              first="Split"
              points={points}
              rows={detail.splits.map((s: StatLine) => ({
                key: s.label,
                label: s.label,
                sub: `${s.gamesPlayed} GP`,
                stats: s.perGame,
                fp: s.fantasyPointsPerGame,
              }))}
            />
            <p className="group-footer">Per-game averages. Last 7/15/30 days fill in once the season starts.</p>
          </section>

          <section className="flex flex-col gap-1.5">
            <h2 className="group-header">Game Log</h2>
            {detail.gameLog.length === 0 ? (
              <p className="px-5 py-6 text-center text-[15px] text-muted">No games yet.</p>
            ) : (
              <StatGrid first="Game" points={points} whole rows={detail.gameLog.map((g: GameLogEntry) => gameRow(g))} />
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          {detail.upcoming.length > 0 && (
            <Group header="Upcoming Games">
              {detail.upcoming.map((g) => (
                <div key={g.date} className="row-block">
                  <div className="row-body justify-between text-[15px]">
                    <span>
                      {g.home ? "vs" : "@"} {g.opponent}
                    </span>
                    <span className="text-muted">
                      <LocalDateTime iso={g.date} />
                    </span>
                  </div>
                </div>
              ))}
            </Group>
          )}

          {detail.news.length > 0 && (
            <Group header="News">
              {detail.news.map((n) => (
                <div key={n.id} className="row-block">
                  <div className="row-body flex-col items-stretch gap-1 py-3">
                    <p className="text-[15px] font-semibold leading-snug">{n.headline}</p>
                    {n.body && <p className="text-[14px] leading-snug text-muted">{n.body}</p>}
                    <p className="text-[12px] text-faint">
                      {n.source} · <LocalDate iso={n.published} />
                    </p>
                  </div>
                </div>
              ))}
            </Group>
          )}

          {detail.outlook && (
            <Group header="Season Outlook">
              <div className="row-block">
                <p className="row-body py-3 text-[15px] leading-relaxed">{detail.outlook}</p>
              </div>
            </Group>
          )}
        </div>
      </div>
    </div>
  );
}

function gameRow(g: GameLogEntry) {
  const [, m, d] = g.date.split("-");
  return { key: g.gameId, label: `${Number(m)}/${Number(d)}`, sub: `${g.home ? "vs" : "@"} ${g.opponent}`, stats: g.stats, fp: g.fantasyPoints };
}

function StatGrid({
  first,
  rows,
  points,
  whole,
}: {
  first: string;
  rows: { key: string; label: string; sub: string; stats: Record<string, number>; fp?: number }[];
  points: boolean;
  /** Single games: counts are whole numbers. */
  whole?: boolean;
}) {
  return (
    <div className="list-group max-h-[640px] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-[14px] tabular-nums">
        <thead className="sticky top-0 z-[3]">
          <tr className="text-[11px] font-semibold text-muted uppercase">
            <th className="sticky left-0 z-[2] border-b-[0.5px] border-separator bg-surface py-2 pr-2 pl-4 text-left shadow-[1px_0_0_var(--separator)]">{first}</th>
            {points && <th className="border-b-[0.5px] border-separator bg-surface px-2.5 py-2 text-right">FPTS</th>}
            {COLS.map((c) => (
              <th key={c.key} className="border-b-[0.5px] border-separator bg-surface px-2.5 py-2 text-right">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="[&>td]:border-t-[0.5px] [&>td]:border-separator first:[&>td]:border-t-0">
              <td className="sticky left-0 z-[1] bg-surface py-2 pr-2 pl-4 whitespace-nowrap shadow-[1px_0_0_var(--separator)]">
                <span className="font-medium">{r.label}</span> <span className="text-[12px] text-muted">{r.sub}</span>
              </td>
              {points && <td className="px-2.5 py-2 text-right font-semibold">{fmt(r.fp)}</td>}
              {COLS.map((c) => (
                <td key={c.key} className="px-2.5 py-2 text-right">
                  {fmt(r.stats[c.key], c.rate, whole && c.key !== "min")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
