import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChevronRight } from "@/components/icons";
import { Group, Row } from "@/components/list";
import { PlatformIcon, platformLabel } from "@/components/platform-badge";
import { PlayerRow } from "@/components/player-row";
import { RosterEditor } from "@/components/roster-editor";
import { getAdapter } from "@/lib/adapters/registry";
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
  { key: "standings", label: "Standings" },
  { key: "teams", label: "Teams" },
];
const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C"];

const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Search = { tab?: string; team?: string; pos?: string };

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
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "roster") as LeagueTab;
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

      <Suspense key={`${tab}-${sp.team ?? ""}-${sp.pos ?? ""}`} fallback={<div className="list-group h-80 animate-pulse" />}>
        <TabContent resolved={resolved} tab={tab} sp={sp} base={base} points={points} />
      </Suspense>

      <Group>
        <Row icon={<PlatformIcon platform={league.platform} />} title={`Open in ${platformLabel(league.platform)}`} href={league.url} external />
      </Group>
    </>
  );
}

async function TabContent({ resolved, tab, sp, base, points }: { resolved: ResolvedLeague; tab: LeagueTab; sp: Search; base: string; points: boolean }) {
  const data = await getLeagueTab(resolved, tab, { teamId: sp.team, position: sp.pos && sp.pos !== "All" ? sp.pos : undefined });
  const preDraft = resolved.league.status === "pre_draft" || resolved.league.status === "drafting";

  switch (data.tab) {
    case "roster": {
      if (!data.roster) return <Empty text="Pick your team in Connections to see your roster here." />;
      const { team, slots } = data.roster;
      const starters = slots.filter((s) => s.slot !== "BN" && s.slot !== "IR");
      const bench = slots.filter((s) => s.slot === "BN" || s.slot === "IR");
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
          />
        );
      }
      return (
        <div className="flex flex-col gap-8">
          <Group header={`${team.name}${team.isMine ? "" : ` · ${team.ownerName}`} · Starters`}>
            {starters.map((s, i) => (
              <PlayerRow key={i} player={s.player} slot={s.slot} showFantasyPoints={points} />
            ))}
          </Group>
          {bench.length > 0 && (
            <Group header="Bench & IR" footer={points ? "FP/G = fantasy points per game in this league's scoring." : undefined}>
              {bench.map((s, i) => (
                <PlayerRow key={i} player={s.player} slot={s.slot} showFantasyPoints={points} />
              ))}
            </Group>
          )}
        </div>
      );
    }

    case "matchup": {
      if (preDraft) return <Empty text="Matchups start after the draft." />;
      if (!data.matchup) return <Empty text="No matchup for your team this week." />;
      const m = data.matchup;
      const team = (id: string) => data.teams.find((t) => t.id === id);
      const sides = [m.home, m.away].filter((s): s is NonNullable<typeof s> => !!s);
      return (
        <div className="flex flex-col gap-8">
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
                    value={<span className="text-[22px] font-semibold text-text tabular-nums">{s.score === undefined ? "–" : fmt1.format(s.score)}</span>}
                  />
                );
              })}
            </Group>
            {m.status === "live" && <AutoRefresh seconds={60} />}
          </div>
          {data.rosters.map(({ team: t, slots }) => (
            <Group key={t.id} header={t.name}>
              {slots
                .filter((s) => s.slot !== "BN" && s.slot !== "IR")
                .map((s, i) => (
                  <PlayerRow key={i} player={s.player} slot={s.slot} showFantasyPoints={points} />
                ))}
            </Group>
          ))}
        </div>
      );
    }

    case "players":
      return (
        <div className="flex flex-col gap-4">
          <Segmented
            active={sp.pos ?? "All"}
            items={POSITIONS.map((p) => ({ key: p, label: p, href: `${base}?tab=players${p === "All" ? "" : `&pos=${p}`}` }))}
          />
          <Group header="Top available free agents" footer="Sorted by how widely rostered they are across ESPN.">
            {data.players.length === 0 ? (
              <Row title={<span className="text-muted">No free agents found</span>} />
            ) : (
              data.players.map((p) => <PlayerRow key={p.id} player={p} showFantasyPoints={points} />)
            )}
          </Group>
        </div>
      );

    case "activity":
      return (
        <ActivityFeed
          feed={data.activity.feed}
          pending={data.activity.pendingForTeam}
          teams={data.teams.map((t) => ({ id: t.id, name: t.name, avatarUrl: t.avatarUrl, isMine: t.isMine }))}
        />
      );

    case "standings": {
      const team = (id: string) => data.teams.find((t) => t.id === id);
      return (
        <Group footer={preDraft ? "Order reflects ESPN's pre-season seeding." : undefined}>
          {data.standings.map((r) => {
            const t = team(r.teamId);
            return (
              <Row
                key={r.teamId}
                icon={
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-fill text-[13px] font-bold text-muted">
                    {r.rank}
                  </span>
                }
                title={<span className={t?.isMine ? "font-semibold" : ""}>{t?.name}</span>}
                subtitle={points && r.pointsFor !== undefined ? `${fmt1.format(r.pointsFor)} PF · ${fmt1.format(r.pointsAgainst ?? 0)} PA` : t?.ownerName}
                value={
                  <span className="text-[15px] tabular-nums">
                    {r.wins}-{r.losses}
                    {r.ties ? `-${r.ties}` : ""}
                  </span>
                }
                href={t ? `${base}?tab=roster&team=${t.externalId}` : undefined}
              />
            );
          })}
        </Group>
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

