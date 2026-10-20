import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { LeagueOverviewView } from "@/components/league-overview";
import { MatchupView } from "@/components/matchup-view";
import { PlayersExplorer } from "@/components/players-explorer";
import { TradeBuilder } from "@/components/trade-builder";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChevronRight } from "@/components/icons";
import { Group, Row } from "@/components/list";
import { PlatformIcon, platformLabel } from "@/components/platform-badge";
import { RosterEditor } from "@/components/roster-editor";
import { getAdapter } from "@/lib/adapters/registry";
import { scoreText } from "@/lib/score";
import { CategoryBoard } from "@/components/category-board";
import { Segmented } from "@/components/segmented";
import { TeamAvatar } from "@/components/team-avatar";
import { PLATFORMS, type Platform, type Team } from "@/lib/schema";
import { getLeagueTab, resolveLeague, type LeagueTab, type ResolvedLeague } from "@/lib/services/leagues";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "League" };

const TABS: { key: LeagueTab; label: string }[] = [
  { key: "roster", label: "Roster" },
  { key: "matchup", label: "Matchup" },
  { key: "players", label: "Players" },
  { key: "activity", label: "Activity" },
  { key: "league", label: "League" },
  { key: "standings", label: "Standings" },
  { key: "teams", label: "Teams" },
];

const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Search = { tab?: string; team?: string; pos?: string; week?: string; m?: string };

export default function LeaguePage({ params, searchParams }: PageProps<"/leagues/[platform]/[leagueId]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="-mb-2 inline-flex items-center gap-1 self-start text-[17px] text-accent">
        <ChevronRight className="h-4 w-4 rotate-180" />
        Leagues
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <LeagueView params={params} searchParams={searchParams as Promise<Search>} />
      </Suspense>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-10 w-2/3 rounded-lg bg-surface-2" />
      <div className="h-8 rounded-[10px] bg-fill" />
      <div className="list-group h-80 animate-pulse" />
    </div>
  );
}

async function LeagueView({ params, searchParams }: { params: Promise<{ platform: string; leagueId: string }>; searchParams: Promise<Search> }) {
  const [{ platform, leagueId }, sp] = await Promise.all([params, searchParams]);
  if (!PLATFORMS.includes(platform as Platform) || !/^\d+$/.test(leagueId)) notFound();
  const user = await requireUser();
  const resolved = await resolveLeague(user.id, platform as Platform, leagueId);
  if (!resolved) notFound();

  const { league } = resolved;
  const tab = (TABS.some((t) => t.key === sp.tab) || sp.tab === "trade" ? sp.tab : "roster") as LeagueTab;
  const base = `/leagues/${platform}/${leagueId}`;
  const points = league.format === "h2h-points" || league.format === "points";

  return (
    <>
      <header className="px-1">
        <h1 className="large-title text-balance">{league.name}</h1>
        <p className="mt-1 text-[15px] text-muted">
          {platformLabel(league.platform)} · {league.size} teams · {league.season.length === 4 ? `${Number(league.season) - 1}-${league.season.slice(2)}` : league.season}
          {!resolved.viaAccount && " · Public (read-only)"}
        </p>
      </header>

      <Segmented active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?tab=${t.key}` }))} />

      <Suspense key={`${tab}-${sp.team ?? ""}-${sp.pos ?? ""}-${sp.week ?? ""}-${sp.m ?? ""}`} fallback={<div className="list-group h-80 animate-pulse" />}>
        <TabContent resolved={resolved} tab={tab} sp={sp} base={base} points={points} />
      </Suspense>

      <Group>
        <Row icon={<PlatformIcon platform={league.platform} />} title={`Open in ${platformLabel(league.platform)}`} href={league.url} external />
      </Group>
    </>
  );
}

async function TabContent({ resolved, tab, sp, base, points }: { resolved: ResolvedLeague; tab: LeagueTab; sp: Search; base: string; points: boolean }) {
  const week = sp.week && /^\d{1,2}$/.test(sp.week) ? Number(sp.week) : undefined;
  const matchupId = sp.m && /^(espn|sleeper|yahoo):[\w.-]{1,80}$/.test(sp.m) ? sp.m : undefined;
  const data = await getLeagueTab(resolved, tab, { teamId: sp.team, position: sp.pos && sp.pos !== "All" ? sp.pos : undefined, period: week, matchupId });
  const preDraft = resolved.league.status === "pre_draft" || resolved.league.status === "drafting";
  // Player pages exist only where the platform has player details.
  const playerBase = getAdapter(resolved.league.platform).getPlayerDetail ? `${base}/player` : undefined;

  switch (data.tab) {
    case "roster": {
      if (!data.roster) return <Empty text="Pick your team in Connections to see your roster here." />;
      const { team, slots } = data.roster;
      if (preDraft && slots.every((s) => !s.player)) return <Empty text="Rosters fill in after the draft." />;
      if (team.isMine && resolved.viaAccount && getAdapter(resolved.league.platform).capabilities.setLineup) {
        return (
          <RosterEditor
            slots={slots}
            platform={resolved.league.platform}
            leagueId={resolved.league.externalId}
            platformName={platformLabel(resolved.league.platform)}
            showFantasyPoints={points}
            title={team.name}
            playerBase={playerBase}
          />
        );
      }
      const canTrade = !team.isMine && resolved.viaAccount && getAdapter(resolved.league.platform).capabilities.trades;
      return (
        <div className="flex flex-col gap-6">
          {canTrade && (
            <Link href={`${base}?tab=trade&team=${team.externalId}`} className="btn btn-primary w-full sm:w-auto sm:self-start">
              Propose a Trade to {team.name}
            </Link>
          )}
          <RosterEditor
            slots={slots}
            platform={resolved.league.platform}
            leagueId={resolved.league.externalId}
            platformName={platformLabel(resolved.league.platform)}
            showFantasyPoints={points}
            title={team.isMine ? team.name : `${team.name} · ${team.ownerName}`}
            editable={false}
            playerBase={playerBase}
          />
        </div>
      );
    }

    case "matchup": {
      if (preDraft) return <Empty text="Matchups start after the draft." />;
      const team = (id: string) => data.teams.find((t) => t.id === id);
      const period = data.matchup?.period ?? data.all[0]?.period ?? week ?? 1;
      const weekNav = (
        <div className="flex items-center justify-between gap-2">
          {period > 1 ? (
            <Link href={`${base}?tab=matchup&week=${period - 1}`} scroll={false} className="text-[15px] text-accent">
              ‹ Week {period - 1}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[15px] font-semibold">Week {period}</span>
          <Link href={`${base}?tab=matchup&week=${period + 1}`} scroll={false} className="text-[15px] text-accent">
            Week {period + 1} ›
          </Link>
        </div>
      );
      const weekQ = `tab=matchup&week=${period}`;
      const scoreboard = data.all.length > 1 && (
        <Group header="Scoreboard" footer="Tap a game to see both lineups.">
          {data.all.map((g) => {
            const h = team(g.home.teamId);
            const a = g.away ? team(g.away.teamId) : undefined;
            const isMine = h?.isMine || a?.isMine;
            const open = data.matchup?.id === g.id;
            return (
              <Link
                key={g.id}
                href={`${base}?${weekQ}${isMine ? "" : `&m=${encodeURIComponent(g.id)}`}`}
                aria-current={open ? "true" : undefined}
                className={`row-block block transition-colors hover:bg-surface-2 ${open ? "bg-accent-soft" : ""}`}
              >
                <div className="row-body gap-3 text-[15px] tabular-nums">
                  <span className={`min-w-0 flex-1 truncate ${h?.isMine ? "font-semibold" : ""}`}>{h?.name}</span>
                  {g.home.categoryRecord ? (
                    <span className="w-28 text-center">{scoreText(g.home)}</span>
                  ) : (
                    <>
                      <span className="w-14 text-right">{scoreText(g.home)}</span>
                      <span className="text-faint">–</span>
                      <span className="w-14">{scoreText(g.away)}</span>
                    </>
                  )}
                  <span className={`min-w-0 flex-1 truncate text-right ${a?.isMine ? "font-semibold" : ""}`}>{a?.name ?? "Bye"}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
                </div>
              </Link>
            );
          })}
        </Group>
      );
      if (!data.matchup)
        return (
          <div className="flex flex-col gap-6">
            {weekNav}
            <Empty text="No matchup for your team this week." />
            {scoreboard}
          </div>
        );
      const m = data.matchup;
      const sides = [m.home, m.away].filter((s): s is NonNullable<typeof s> => !!s);
      return (
        <div className="flex flex-col gap-8">
          {weekNav}
          {!data.isMine && (
            <div className="-mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-surface px-4 py-2.5 text-[15px]">
              <span className="text-muted">Viewing another game in your league.</span>
              {data.mineId && (
                <Link href={`${base}?${weekQ}`} scroll={false} className="font-semibold text-accent">
                  Back to my matchup
                </Link>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Group header={`Week ${m.period} · ${m.status === "live" ? "Live" : m.status === "final" ? "Final" : "Upcoming"}`}>
              {sides.map((s) => {
                const t = team(s.teamId);
                return (
                  <Row
                    key={s.teamId}
                    icon={<TeamAvatar src={t?.avatarUrl} name={t?.name ?? "?"} />}
                    title={<span className={t?.isMine ? "font-semibold" : ""}>{t?.name}</span>}
                    subtitle={t?.isMine ? "You" : t?.ownerName}
                    value={<span className="text-[22px] font-semibold text-text tabular-nums">{scoreText(s)}</span>}
                  />
                );
              })}
            </Group>
            {m.status === "live" && <AutoRefresh seconds={60} />}
          </div>
          {m.away && resolved.league.scoring.categories && (
            <CategoryBoard
              categories={resolved.league.scoring.categories}
              home={m.home}
              away={m.away}
              homeName={team(m.home.teamId)?.name ?? "Home"}
              awayName={team(m.away.teamId)?.name ?? "Away"}
            />
          )}
          <MatchupView
            points={points}
            playerBase={playerBase}
            sides={data.rosters.map(({ team: t, slots }) => ({
              team: { id: t.id, name: t.name, isMine: t.isMine },
              scoreText: sides.find((x) => x.teamId === t.id) ? scoreText(sides.find((x) => x.teamId === t.id)) : undefined,
              slots,
            }))}
          />
          {scoreboard}
        </div>
      );
    }

    case "league":
      if (!data.overview) return <Empty text="League details aren't available for this platform yet." />;
      return (
        <LeagueOverviewView
          overview={data.overview}
          teams={data.teams.map((t) => ({ id: t.id, externalId: t.externalId, name: t.name, avatarUrl: t.avatarUrl, isMine: t.isMine }))}
          base={base}
          points={points}
          playerBase={playerBase}
        />
      );

    case "players":
      return (
        <PlayersExplorer
          pool={data.pool}
          mySlots={data.mySlots}
          watched={data.watched}
          teams={data.teams.map((t) => ({ id: t.id, externalId: t.externalId, name: t.name, isMine: t.isMine }))}
          platform={resolved.league.platform}
          leagueId={resolved.league.externalId}
          platformName={platformLabel(resolved.league.platform)}
          points={points}
          base={base}
          playerBase={playerBase}
        />
      );

    case "activity":
      return (
        <ActivityFeed
          feed={data.activity.feed}
          pending={data.activity.pendingForTeam}
          teams={data.teams.map((t) => ({ id: t.id, name: t.name, avatarUrl: t.avatarUrl, isMine: t.isMine }))}
          platform={resolved.league.platform}
          leagueId={resolved.league.externalId}
          platformName={platformLabel(resolved.league.platform)}
          leagueUrl={resolved.league.url}
          canAct={resolved.viaAccount}
          playerBase={playerBase}
        />
      );

    case "trade":
      if (!data.trade) return <Empty text="Trades need your connected account. Pick a team from Teams to start an offer." />;
      return (
        <TradeBuilder
          platform={resolved.league.platform}
          leagueId={resolved.league.externalId}
          platformName={platformLabel(resolved.league.platform)}
          myTeam={{ name: data.trade.myTeam.name }}
          theirTeam={{ name: data.trade.other.name, externalId: data.trade.other.externalId, ownerName: data.trade.other.ownerName }}
          mySlots={data.trade.mySlots}
          theirSlots={data.trade.theirSlots}
        />
      );

    case "standings": {
      const team = (id: string) => data.teams.find((t) => t.id === id);
      const cats = resolved.league.scoring.categories ?? [];
      if (data.standings.some((r) => r.rotoPoints !== undefined)) {
        return (
          <section className="flex flex-col gap-1.5">
            <div className="list-group overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[14px] tabular-nums">
                <thead>
                  <tr className="text-[11px] font-semibold text-muted uppercase [&>th]:border-b-[0.5px] [&>th]:border-separator [&>th]:px-2.5 [&>th]:py-2 [&>th]:text-right">
                    <th className="sticky left-0 z-[2] bg-surface !pl-4 !text-left shadow-[1px_0_0_var(--separator)]">Team</th>
                    <th>Roto Pts</th>
                    {cats.map((c) => (
                      <th key={c.stat} title={c.higherIsBetter ? undefined : "Lower is better"}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((r) => {
                    const t = team(r.teamId);
                    return (
                      <tr key={r.teamId} className={`[&>td]:border-t-[0.5px] [&>td]:border-separator first:[&>td]:border-t-0 ${t?.isMine ? "[&>td]:bg-accent-soft" : ""}`}>
                        <td className="sticky left-0 z-[1] bg-surface py-2 pr-2 pl-4 shadow-[1px_0_0_var(--separator)]">
                          <Link href={t ? `${base}?tab=roster&team=${t.externalId}` : base} className="flex w-[190px] items-center gap-2.5 sm:w-[260px]">
                            <span className="w-5 shrink-0 text-right text-[13px] font-semibold text-muted">{r.rank}</span>
                            <TeamAvatar src={t?.avatarUrl} name={t?.name ?? "?"} />
                            <span className={`min-w-0 truncate ${t?.isMine ? "font-semibold" : ""}`}>{t?.name}</span>
                          </Link>
                        </td>
                        <td className="px-2.5 py-2 text-right font-semibold">{fmt1.format(r.rotoPoints ?? 0)}</td>
                        {cats.map((c) => (
                          <td key={c.stat} className="px-2.5 py-2 text-right text-muted">
                            {r.categoryRanks?.[c.stat] ?? "–"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="group-footer">
              Roto points: in each category the best team gets {data.standings.length}, the next one less, down to 1 (ties share). Category columns show each team&apos;s
              rank. Calculated by Hoops Hub from season totals.
            </p>
          </section>
        );
      }
      const cutoff = data.standings.findIndex((r) => r.inPlayoffs === false);
      return (
        <section className="flex flex-col gap-1.5">
          <div className="list-group overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[14px] tabular-nums">
              <thead>
                <tr className="text-[11px] font-semibold text-muted uppercase [&>th]:border-b-[0.5px] [&>th]:border-separator [&>th]:px-2.5 [&>th]:py-2 [&>th]:text-right">
                  <th className="sticky left-0 z-[2] bg-surface !pl-4 !text-left shadow-[1px_0_0_var(--separator)]">Team</th>
                  <th>W-L-T</th>
                  <th>PCT</th>
                  <th>GB</th>
                  {points && (
                    <>
                      <th>PF</th>
                      <th>PA</th>
                    </>
                  )}
                  <th className="!pr-4">Strk</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((r, i) => {
                  const t = team(r.teamId);
                  const line = i === cutoff && cutoff > 0 ? "[&>td]:border-t-2 [&>td]:border-t-accent/50" : "[&>td]:border-t-[0.5px] [&>td]:border-separator";
                  return (
                    <tr key={r.teamId} className={`${line} first:[&>td]:border-t-0 ${t?.isMine ? "[&>td]:bg-accent-soft" : ""}`}>
                      <td className="sticky left-0 z-[1] bg-surface py-2 pr-2 pl-4 shadow-[1px_0_0_var(--separator)]">
                        <Link href={t ? `${base}?tab=roster&team=${t.externalId}` : base} className="flex w-[190px] items-center gap-2.5 sm:w-[260px]">
                          <span className="w-5 shrink-0 text-right text-[13px] font-semibold text-muted">{r.rank}</span>
                          <TeamAvatar src={t?.avatarUrl} name={t?.name ?? "?"} />
                          <span className="min-w-0">
                            <span className={`block truncate ${t?.isMine ? "font-semibold" : ""}`}>{t?.name}</span>
                            <span className="block truncate text-[12px] text-muted">{t?.isMine ? "You" : t?.ownerName}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        {r.wins}-{r.losses}-{r.ties}
                      </td>
                      <td className="px-2.5 py-2 text-right">{r.winPct !== undefined ? r.winPct.toFixed(3).replace(/^0/, "") : "–"}</td>
                      <td className="px-2.5 py-2 text-right">{r.gamesBack ? fmt1.format(r.gamesBack) : "–"}</td>
                      {points && (
                        <>
                          <td className="px-2.5 py-2 text-right">{r.pointsFor !== undefined ? fmt1.format(r.pointsFor) : "–"}</td>
                          <td className="px-2.5 py-2 text-right">{r.pointsAgainst !== undefined ? fmt1.format(r.pointsAgainst) : "–"}</td>
                        </>
                      )}
                      <td className={`py-2 pr-4 pl-2.5 text-right ${r.streak?.startsWith("W") ? "text-success" : r.streak?.startsWith("L") ? "text-danger" : ""}`}>
                        {r.streak ?? "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="group-footer">
            {cutoff > 0 ? "Teams above the blue line hold playoff spots. " : ""}
            {preDraft || data.standings.every((r) => r.wins + r.losses + r.ties === 0) ? "Order reflects ESPN's pre-season seeding." : ""}
          </p>
        </section>
      );
    }

    case "teams":
      return (
        <Group>
          {sortMineFirst(data.teams).map((t) => (
            <Row
              key={t.id}
              icon={<TeamAvatar src={t.avatarUrl} name={t.name} />}
              title={<span className={t.isMine ? "font-semibold" : ""}>{t.name}</span>}
              subtitle={t.isMine ? "Your team" : t.ownerName}
              href={`${base}?tab=roster&team=${t.externalId}`}
            />
          ))}
        </Group>
      );
  }
}

function sortMineFirst(teams: Team[]) {
  return [...teams].sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.name.localeCompare(b.name));
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-[15px] text-muted">{text}</p>;
}

