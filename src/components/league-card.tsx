import type { LeagueFormat, LeagueStatus, MatchupStatus } from "@/lib/schema";
import type { DashboardLeague } from "@/lib/schema/views";
import { scoreLead, scoreText } from "@/lib/score";
import { Trophy, Versus } from "./icons";
import { Group, IconTile, Row } from "./list";
import { PlatformIcon, platformLabel } from "./platform-badge";
import { TeamAvatar } from "./team-avatar";

const FORMAT: Record<LeagueFormat, string> = {
  roto: "Roto",
  "h2h-categories": "H2H Categories",
  "h2h-points": "H2H Points",
  points: "Points",
};

const LEAGUE_STATUS: Record<LeagueStatus, string> = {
  pre_draft: "Draft not started",
  drafting: "Drafting now",
  in_season: "In season",
  complete: "Season over",
};

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function StatusPill({ status }: { status: MatchupStatus }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[12px] font-semibold text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        LIVE
      </span>
    );
  return <span className="text-[15px]">{status === "final" ? "Final" : "Upcoming"}</span>;
}

export function LeagueCard({ data }: { data: DashboardLeague }) {
  const { league, myTeam, standing, matchup, teamCount } = data;
  const preDraft = league.status === "pre_draft" || league.status === "drafting";
  const me = matchup?.me;
  const opp = matchup?.opponent;
  const showScore = matchup && matchup.status !== "upcoming" && (me?.score !== undefined || !!me?.categoryRecord);

  return (
    <Group header={`${platformLabel(league.platform)} · ${FORMAT[league.format]}`}>
      <Row
        icon={<PlatformIcon platform={league.platform} />}
        title={league.name}
        titleClassName="font-semibold"
        subtitle={`${teamCount} teams · ${LEAGUE_STATUS[league.status]}`}
        href={`/leagues/${league.platform}/${league.externalId}`}
      />

      {myTeam ? (
        <Row
          icon={<TeamAvatar src={myTeam.avatarUrl} name={myTeam.name} />}
          title={myTeam.name}
          subtitle="Your team"
          value={
            !preDraft && standing ? (
              <span className="text-[15px]">
                {standing.rotoPoints !== undefined ? (
                  `${fmt.format(standing.rotoPoints)} roto pts`
                ) : (
                  <>
                    {standing.wins}-{standing.losses}
                    {standing.ties ? `-${standing.ties}` : ""}
                  </>
                )}
              </span>
            ) : undefined
          }
        />
      ) : (
        <Row title="Your team" value={<span className="text-[15px]">Not found</span>} />
      )}

      {!preDraft && standing && (
        <Row
          icon={
            <IconTile color="var(--warning)">
              <Trophy />
            </IconTile>
          }
          title="Standings"
          value={
            <span className="text-[15px]">
              {ordinal(standing.rank)} of {teamCount}
            </span>
          }
        />
      )}

      {preDraft ? (
        <Row
          icon={
            <IconTile color="var(--gray)">
              <Versus />
            </IconTile>
          }
          title="This week"
          value={<span className="text-[15px]">After the draft</span>}
        />
      ) : matchup ? (
        <Row
          icon={
            <IconTile color="var(--accent)">
              <Versus />
            </IconTile>
          }
          title={matchup.opponent ? `vs ${matchup.opponent.team.name}` : "Bye week"}
          subtitle={
            showScore ? (
              <span className="tabular-nums">
                <span className={(scoreLead(me, opp) ?? 0) >= 0 ? "font-semibold text-text" : ""}>{scoreText(me)}</span>
                {/* A category tally already says both sides; points need the other score. */}
                {opp && !me?.categoryRecord && <> – {scoreText(opp)}</>}
                {me?.categoryRecord && " in categories"}
              </span>
            ) : (
              `Week ${matchup.period}`
            )
          }
          value={<StatusPill status={matchup.status} />}
        />
      ) : (
        <Row title="This week" value={<span className="text-[15px]">No matchup</span>} />
      )}
    </Group>
  );
}
