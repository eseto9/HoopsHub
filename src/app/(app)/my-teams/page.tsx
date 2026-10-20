import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActivityHubView, LineupCheckView } from "@/components/hub-client";
import { ExposureView, MatchupCenterView, NewsView, RecapView, TonightView, WaiverRadarView } from "@/components/hub-views";
import { MyTeamsView } from "@/components/my-teams-view";
import { Segmented } from "@/components/segmented";
import { combinedActivity, exposure, nameKey, waiverRadar } from "@/lib/hub";
import { recapSummary } from "@/lib/recap";
import { getActivityFeeds, getMatchupCenter, getMyNews, getMyTeams, getRecap, getWaiverPools } from "@/lib/services/leagues";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My Teams" };

const VIEWS = [
  { key: "rosters", label: "Rosters" },
  { key: "lineup", label: "Lineup Check" },
  { key: "tonight", label: "Tonight" },
  { key: "matchups", label: "Matchups" },
  { key: "recap", label: "Recap" },
  { key: "news", label: "News" },
  { key: "waivers", label: "Waivers" },
  { key: "activity", label: "Activity" },
  { key: "exposure", label: "Exposure" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const SUBTITLE: Record<View, string> = {
  rosters: "Every player you roster, across all your leagues.",
  lineup: "Starters who are out, have no game today, or empty slots, with the best bench fix.",
  tonight: "Today's NBA games with your players in them.",
  matchups: "This week's matchups in every league.",
  recap: "How last week went in every league, and who you play next.",
  news: "Injuries and the latest news on players you own.",
  waivers: "The best available players in each of your leagues.",
  activity: "Every add, drop and trade across your leagues.",
  exposure: "Who you own, and in how many leagues.",
};

export default function MyTeamsPage({ searchParams }: PageProps<"/my-teams">) {
  return (
    <div className="flex flex-col gap-6">
      <header className="px-1">
        <h1 className="large-title">My Teams</h1>
      </header>
      <Suspense fallback={<div className="list-group h-96 animate-pulse" />}>
        <Hub searchParams={searchParams as Promise<{ view?: string }>} />
      </Suspense>
    </div>
  );
}

async function Hub({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = (VIEWS.some((v) => v.key === sp.view) ? sp.view : "rosters") as View;
  return (
    <>
      <Segmented active={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: `/my-teams?view=${v.key}` }))} />
      <p className="-mt-2 px-1 text-[15px] text-muted">{SUBTITLE[view]}</p>
      <Suspense key={view} fallback={<div className="list-group h-96 animate-pulse" />}>
        <ViewContent view={view} />
      </Suspense>
    </>
  );
}

async function ViewContent({ view }: { view: View }) {
  const user = await requireUser();

  if (view === "matchups") {
    const rows = await getMatchupCenter(user.id);
    if (!rows.length) return <NoTeams />;
    return (
      <>
        <MatchupCenterView rows={rows} />
        {rows.some((r) => r.section.matchup?.status === "live") && <AutoRefresh seconds={60} />}
      </>
    );
  }
  if (view === "recap") {
    const { rows, waiting } = await getRecap(user.id);
    return <RecapView rows={rows} waiting={waiting} summary={recapSummary(rows).text} />;
  }
  if (view === "news") {
    const { entries, injured } = await getMyNews(user.id);
    return <NewsView entries={entries} injured={injured} />;
  }
  if (view === "waivers") {
    const all = await getWaiverPools(user.id);
    if (!all.length) return <NoTeams />;
    // Before the draft every player looks "available", so those leagues are skipped.
    const pools = all.filter((p) => p.section.league.status !== "pre_draft" && p.section.league.status !== "drafting");
    if (!pools.length) return <p className="px-5 py-10 text-center text-[15px] text-muted">Waiver Radar starts once your leagues have drafted.</p>;
    const radar = waiverRadar(pools.map((p) => ({ league: p.section.league, pool: p.pool })));
    return <WaiverRadarView radar={radar} errors={Object.fromEntries(pools.map((p) => [p.section.league.id, p.error ?? ""]))} />;
  }
  if (view === "activity") {
    const feeds = await getActivityFeeds(user.id);
    if (!feeds.length) return <NoTeams />;
    const mine = new Set(feeds.flatMap((f) => f.section.slots.flatMap((s) => (s.player ? [nameKey(s.player.name)] : []))));
    const items = combinedActivity(
      feeds.map((f) => ({ league: f.section.league, teams: f.teams.map((t) => ({ id: t.id, name: t.name, isMine: t.isMine })), feed: f.feed })),
      mine,
    );
    return <ActivityHubView items={items.slice(0, 200)} />;
  }

  const { sections } = await getMyTeams(user.id);
  if (!sections.length) return <NoTeams />;
  const rosters = sections.map((s) => ({ league: s.league, slots: s.slots }));
  switch (view) {
    case "lineup":
      return <LineupCheckView sections={sections} />;
    case "tonight":
      return <TonightView rosters={rosters} />;
    case "exposure":
      return <ExposureView rows={exposure(rosters)} leagueCount={sections.length} />;
    default:
      return (
        <>
          <MyTeamsView sections={sections} />
          {sections.some((s) => s.matchup?.status === "live") && <AutoRefresh seconds={60} />}
        </>
      );
  }
}

function NoTeams() {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <p className="text-[22px] font-bold">No Teams Yet</p>
      <p className="mt-2 max-w-xs text-[15px] text-muted">Connect a league and pick your team to see it here.</p>
      <Link href="/connections" className="btn btn-primary mt-6">
        Connect a League
      </Link>
    </div>
  );
}
