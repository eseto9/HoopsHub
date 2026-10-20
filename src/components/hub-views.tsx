import Link from "next/link";
import { isStarterSlot, playerValue, slate, startersGamesLeft, type Exposure, type LeagueRoster, type WaiverPick } from "@/lib/hub";
import type { InjuryStatus, League, RosterSlot } from "@/lib/schema";
import type { RecapLeague } from "@/lib/recap";
import type { MyNewsEntry, MyTeamSection } from "@/lib/services/leagues";
import { leadText, scoreLead, scoreText } from "@/lib/score";
import { LocalDate, LocalDateTime } from "./local-time";
import { PlatformIcon } from "./platform-badge";
import { PlayerAvatar } from "./player-avatar";

const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INJURY: Record<InjuryStatus, string> = { OUT: "Out", IR: "IR", SUSP: "Suspended", DTD: "Day-to-day", GTD: "Game-time", QUES: "Questionable", OTHER: "Injured" };

type LeagueRef = Pick<League, "id" | "name" | "platform" | "externalId">;

function LeagueTag({ league, slot }: { league: LeagueRef; slot?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[12px]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--${league.platform})` }} />
      <span className="truncate">{league.name}</span>
      {slot && <span className={`font-semibold ${slot && !isStarterSlot(slot) ? "text-muted" : ""}`}>· {slot}</span>}
    </span>
  );
}

const playerHref = (league: LeagueRef, id: string, hasPages: boolean) => (hasPages ? `/leagues/${league.platform}/${league.externalId}/player/${id}` : undefined);

// ---------------------------------------------------------------------------
// Tonight's Slate
// ---------------------------------------------------------------------------

export function TonightView({ rosters }: { rosters: LeagueRoster[] }) {
  const games = slate(rosters);
  const starters = games.reduce((n, g) => n + g.players.filter((p) => p.starter).length, 0);
  const benched = games.reduce((n, g) => n + g.players.filter((p) => !p.starter).length, 0);
  if (!games.length) return <p className="px-5 py-10 text-center text-[15px] text-muted">None of your players have a game today.</p>;
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-[15px]">
        <span className="font-semibold">{games.length}</span> {games.length === 1 ? "game" : "games"} with your players ·{" "}
        <span className="font-semibold">{starters}</span> starting
        {benched > 0 && (
          <>
            {" "}
            · <span className="font-semibold text-warning">{benched}</span> on your bench
          </>
        )}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {games.map((g) => (
          <section key={g.key} className="flex flex-col gap-1.5">
            <h2 className="group-header flex items-baseline justify-between gap-2 normal-case">
              <span className="text-[17px] font-semibold text-text">
                {g.away} @ {g.home}
              </span>
              <span className="text-[13px]">
                <LocalDateTime iso={g.date} />
              </span>
            </h2>
            <div className="list-group">
              {g.players.map((x, i) => (
                <div key={i} className={`row-block ${x.starter ? "" : "opacity-60"}`}>
                  <div className="row-body gap-3">
                    <PlayerAvatar src={x.player.headshotUrl} name={x.player.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {x.player.name}
                        {x.player.injuryStatus && <span className="ml-1 text-[11px] font-bold text-danger">{INJURY[x.player.injuryStatus]}</span>}
                      </span>
                      <LeagueTag league={x.league} slot={x.slot} />
                    </span>
                    <span className="text-right text-[13px] text-muted tabular-nums">
                      <span className="block text-[15px] font-semibold text-text">{f1.format(playerValue(x.player))}</span>
                      avg
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {benched > 0 && (
        <p className="px-1 text-[13px] text-muted">
          Dimmed players are on your bench. <Link href="/my-teams?view=lineup" className="text-accent">Lineup Check</Link> shows who to swap in.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matchup Center
// ---------------------------------------------------------------------------

const STATUS = { live: "Live", final: "Final", upcoming: "Upcoming" } as const;

export function MatchupCenterView({ rows }: { rows: { section: MyTeamSection; opponentSlots: RosterSlot[] | null }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map(({ section: s, opponentSlots }) => {
        const m = s.matchup;
        const base = `/leagues/${s.league.platform}/${s.league.externalId}`;
        const mineLeft = startersGamesLeft(s.slots);
        const theirsLeft = opponentSlots ? startersGamesLeft(opponentSlots) : undefined;
        const me = m?.me;
        const them = m?.opponent;
        const lead = scoreLead(me, them);
        return (
          <Link key={s.league.id} href={`${base}?tab=matchup`} className="list-group flex flex-col gap-3 p-4 transition-colors hover:bg-surface-2">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={s.league.platform} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{s.league.name}</span>
                <span className="block text-[13px] text-muted">{m ? `Week ${m.period} · ${STATUS[m.status]}` : "No matchup this week"}</span>
              </span>
              {m?.status === "live" && <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">LIVE</span>}
            </div>
            {m && (
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[15px] tabular-nums">
                <span className="truncate font-semibold">{s.myTeam.name}</span>
                <span className="text-right text-[22px] font-semibold">{scoreText(me)}</span>
                <span className="truncate text-muted">{m.opponent?.team.name ?? "Bye"}</span>
                <span className="text-right text-[22px] text-muted">{scoreText(them)}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t-[0.5px] border-separator pt-2 text-[13px] text-muted">
              {lead !== undefined && m?.status !== "upcoming" && (
                <span className={lead > 0 ? "text-success" : lead < 0 ? "text-danger" : ""}>{leadText(me, them)}</span>
              )}
              {mineLeft !== undefined && (
                <span>
                  Games left: <span className="font-semibold text-text">{mineLeft}</span>
                  {theirsLeft !== undefined && (
                    <>
                      {" "}
                      vs <span className="font-semibold text-text">{theirsLeft}</span>
                    </>
                  )}
                </span>
              )}
              {s.error && <span className="text-danger">{s.error}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Injury & News
// ---------------------------------------------------------------------------

export function NewsView({ entries, injured }: { entries: MyNewsEntry[]; injured: MyNewsEntry[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-1.5">
        <h2 className="group-header">Latest News</h2>
        {entries.length === 0 ? (
          <p className="list-group px-4 py-4 text-[15px] text-muted">No recent news on your players.</p>
        ) : (
          <div className="list-group">
            {entries.map((e) => (
              <div key={e.player.id} className="row-block">
                <div className="row-body items-start gap-3 py-3">
                  <PlayerAvatar src={e.player.headshotUrl} name={e.player.name} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold">{e.player.name}</span>
                      {e.player.injuryStatus && <span className="text-[12px] font-bold text-danger">{INJURY[e.player.injuryStatus]}</span>}
                      {e.leagues.map((l, i) => (
                        <span key={i} className="text-[12px] text-muted">
                          {l.name} · {l.slot}
                        </span>
                      ))}
                    </div>
                    <p className="text-[15px] font-medium leading-snug">{e.news[0].headline}</p>
                    {e.news[0].body && <p className="text-[14px] leading-snug text-muted">{e.news[0].body}</p>}
                    <p className="text-[12px] text-faint">
                      {e.news[0].source} · <LocalDate iso={e.news[0].published} />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="group-footer">News is checked for injured players first, then players with the freshest updates.</p>
      </section>

      <section className="flex min-w-0 flex-col gap-1.5">
        <h2 className="group-header">Injury Report</h2>
        {injured.length === 0 ? (
          <p className="list-group px-4 py-4 text-[15px] text-success">Everyone you own is healthy.</p>
        ) : (
          <div className="list-group">
            {injured.map((e) => {
              const starting = e.leagues.filter((l) => isStarterSlot(l.slot));
              return (
                <div key={e.player.id} className="row-block">
                  <div className="row-body gap-3">
                    <PlayerAvatar src={e.player.headshotUrl} name={e.player.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{e.player.name}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {e.player.injuryNote ? `${e.player.injuryNote} · ` : ""}
                        {e.leagues.length} {e.leagues.length === 1 ? "league" : "leagues"}
                        {starting.length ? ` · starting in ${starting.length}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[13px] font-semibold ${e.player.injuryStatus === "OUT" || e.player.injuryStatus === "IR" ? "text-danger" : "text-warning"}`}>
                      {INJURY[e.player.injuryStatus!]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waiver Radar
// ---------------------------------------------------------------------------

export function WaiverRadarView({ radar, errors }: { radar: { league: LeagueRef; picks: WaiverPick[] }[]; errors: Record<string, string> }) {
  const multi = radar.length > 1;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {radar.map(({ league, picks }) => (
        <section key={league.id} className="flex min-w-0 flex-col gap-1.5">
          <h2 className="group-header flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--${league.platform})` }} />
              <span className="truncate normal-case text-[15px] font-semibold text-text">{league.name}</span>
            </span>
            <Link href={`/leagues/${league.platform}/${league.externalId}?tab=players`} className="shrink-0 normal-case text-accent">
              All players
            </Link>
          </h2>
          <div className="list-group">
            {errors[league.id] ? (
              <p className="px-4 py-3 text-[15px] text-danger">{errors[league.id]}</p>
            ) : picks.length === 0 ? (
              <p className="px-4 py-3 text-[15px] text-muted">No free agents found.</p>
            ) : (
              picks.map(({ listing, openIn }) => {
                const p = listing.player;
                return (
                  <div key={p.id} className="row-block">
                    <div className="row-body gap-3">
                      <PlayerAvatar src={p.headshotUrl} name={p.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">
                          {p.name}
                          {p.injuryStatus && <span className="ml-1 text-[11px] font-bold text-danger">{INJURY[p.injuryStatus]}</span>}
                        </span>
                        <span className="block truncate text-[12px] text-muted">
                          {p.nbaTeam ?? "FA"} · {p.positions.join(", ")} · {listing.status === "waivers" ? "Waivers" : "Free agent"}
                          {listing.gamesThisWeek ? ` · ${listing.gamesThisWeek} games this week` : ""}
                        </span>
                      </span>
                      {multi && openIn > 1 && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent" title="Available in this many of your leagues">
                          Open in {openIn}
                        </span>
                      )}
                      <span className="w-12 shrink-0 text-right text-[15px] font-semibold tabular-nums">{f1.format(playerValue(p))}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      ))}
      <p className="px-1 text-[13px] text-muted lg:col-span-2">
        Ranked by fantasy points per game (this season, else projections, else last season). &ldquo;Open in&rdquo; counts your leagues where he&apos;s available.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

export function ExposureView({ rows, leagueCount }: { rows: Exposure[]; leagueCount: number }) {
  const multi = rows.filter((r) => r.leagues.length > 1);
  const hurt = rows.filter((r) => r.player.injuryStatus && r.leagues.length > 1);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 px-1 text-[15px]">
        <span className="rounded-[10px] bg-surface px-3 py-2">
          <span className="mr-1.5 font-semibold">{rows.length}</span>
          <span className="text-muted">players owned</span>
        </span>
        <span className="rounded-[10px] bg-surface px-3 py-2">
          <span className="mr-1.5 font-semibold">{multi.length}</span>
          <span className="text-muted">in 2+ leagues</span>
        </span>
        {hurt.length > 0 && (
          <span className="rounded-[10px] bg-surface px-3 py-2">
            <span className="mr-1.5 font-semibold text-danger">{hurt.length}</span>
            <span className="text-muted">injured, owned in 2+ leagues</span>
          </span>
        )}
      </div>
      <div className="list-group overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[14px] tabular-nums">
          <thead>
            <tr className="text-[11px] font-semibold text-muted uppercase [&>th]:border-b-[0.5px] [&>th]:border-separator [&>th]:px-2.5 [&>th]:py-2">
              <th className="sticky left-0 z-[2] bg-surface !pl-4 text-left shadow-[1px_0_0_var(--separator)]">Player</th>
              <th className="text-right">Leagues</th>
              <th className="text-right" title="Fantasy points per game, added up across your leagues">Value</th>
              <th className="!pr-4 text-left">Where</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="[&>td]:border-t-[0.5px] [&>td]:border-separator first:[&>td]:border-t-0">
                <td className="sticky left-0 z-[1] bg-surface py-2 pr-2 pl-4 shadow-[1px_0_0_var(--separator)]">
                  <span className="flex w-[180px] items-center gap-2 sm:w-[240px]">
                    <PlayerAvatar src={r.player.headshotUrl} name={r.player.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {r.player.name}
                        {r.player.injuryStatus && <span className="ml-1 text-[10px] font-bold text-danger">{INJURY[r.player.injuryStatus]}</span>}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {r.player.nbaTeam ?? "FA"} · {r.player.positions.join(", ")}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-2.5 py-2 text-right">
                  <span className={r.leagues.length > 1 ? "font-semibold" : "text-muted"}>
                    {r.leagues.length}
                    <span className="text-faint">/{leagueCount}</span>
                  </span>
                </td>
                <td className="px-2.5 py-2 text-right font-semibold">{f1.format(r.totalValue)}</td>
                <td className="py-2 pr-4 pl-2.5">
                  <span className="flex flex-wrap gap-1">
                    {r.leagues.map((l, i) => {
                      const href = playerHref(l.league, r.player.externalId, l.league.platform === "espn" && r.player.platform === "espn");
                      const tag = <LeagueTag league={l.league} slot={l.slot} />;
                      return href ? (
                        <Link key={i} href={href}>
                          {tag}
                        </Link>
                      ) : (
                        <span key={i}>{tag}</span>
                      );
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[13px] text-muted">
        Value is fantasy points per game added up across every league you roster him in, so it shows how much of your fantasy season rides on each player.
        Players are matched across ESPN and Sleeper by name.
      </p>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Weekly Recap
// ---------------------------------------------------------------------------

const OUTCOME = {
  win: { label: "Won", cls: "bg-success text-white" },
  loss: { label: "Lost", cls: "bg-danger text-white" },
  tie: { label: "Tied", cls: "bg-fill text-text" },
  bye: { label: "Bye", cls: "bg-fill text-muted" },
} as const;

export function RecapView({ rows, waiting, summary }: { rows: RecapLeague[]; waiting: string[]; summary: string }) {
  if (!rows.length) {
    return (
      <p className="px-5 py-10 text-center text-[15px] text-muted">
        Your first recap appears once a week finishes{waiting.length ? ` (${waiting.join(", ")})` : ""}. Week 1 ends Sunday night.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-[22px] font-bold">{summary}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const base = `/leagues/${r.league.platform}/${r.league.externalId}`;
          const o = OUTCOME[r.outcome];
          return (
            <section key={r.league.id} className="list-group flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={r.league.platform} />
                <span className="min-w-0 flex-1">
                  <Link href={base} className="block truncate text-[15px] font-semibold">
                    {r.league.name}
                  </Link>
                  <span className="block text-[13px] text-muted">Week {r.week}</span>
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${o.cls}`}>{o.label}</span>
              </div>

              {r.outcome !== "bye" && (
                <Link href={`${base}?tab=matchup&week=${r.week}`} className="flex items-baseline justify-between gap-3 tabular-nums">
                  <span className="text-[26px] font-semibold">{r.myScore}</span>
                  {!r.myScore.includes("-") && <span className="text-[17px] text-muted">{r.oppScore}</span>}
                  <span className="min-w-0 flex-1 truncate text-right text-[14px] text-muted">vs {r.oppName}</span>
                </Link>
              )}

              <ul className="flex flex-col gap-1 text-[14px]">
                {r.margin && r.outcome !== "bye" && !r.margin.includes("-") && (
                  <li className="text-muted">
                    {r.outcome === "win" ? "Won" : r.outcome === "loss" ? "Lost" : "Tied"} {r.outcome === "tie" ? "" : r.margin}
                  </li>
                )}
                {r.weekRank && (
                  <li className="text-muted">
                    {r.weekRank.rank === 1 ? "Highest score in the league" : `${ordinal(r.weekRank.rank)}-highest score of ${r.weekRank.of}`}
                    {r.leagueHigh && !r.leagueHigh.mine && ` · top was ${r.leagueHigh.name} (${r.leagueHigh.score})`}
                  </li>
                )}
                {r.record && (
                  <li className="text-muted">
                    Record {r.record}
                    {r.standing && ` · ${ordinal(r.standing.rank)} of ${r.standing.of}`}
                  </li>
                )}
              </ul>

              {r.topPerformers.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t-[0.5px] border-separator pt-3">
                  <span className="text-[11px] font-semibold text-muted uppercase">Top performers</span>
                  {r.topPerformers.map((p) => (
                    <span key={p.player.id} className="flex items-center gap-2 text-[14px]">
                      <PlayerAvatar src={p.player.headshotUrl} name={p.player.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{p.player.name}</span>
                      <span className="font-semibold tabular-nums">{f1.format(p.points)}</span>
                    </span>
                  ))}
                </div>
              )}

              {r.next && (
                <div className="border-t-[0.5px] border-separator pt-3 text-[14px]">
                  <span className="text-[11px] font-semibold text-muted uppercase">This week</span>
                  <p>
                    vs <span className="font-semibold">{r.next.oppName ?? "Bye"}</span>
                    {r.next.gamesLeft !== undefined && <span className="text-muted"> · {r.next.gamesLeft} games for your starters</span>}
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {waiting.length > 0 && <p className="px-1 text-[13px] text-muted">No finished week yet in: {waiting.join(", ")}.</p>}
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
