import Link from "next/link";
import type { DraftPick, LeagueOverview, ScheduleWeek, Team } from "@/lib/schema";
import { Group } from "./list";
import { PlayerAvatar } from "./player-avatar";
import { TeamAvatar } from "./team-avatar";

type TeamInfo = Pick<Team, "id" | "externalId" | "name" | "avatarUrl" | "isMine">;

const f1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const range = (w: ScheduleWeek) =>
  w.start && w.end ? `${shortDate.format(new Date(`${w.start}T12:00:00Z`))} – ${shortDate.format(new Date(`${w.end}T12:00:00Z`))}` : "";

/** League tab: waiver order, schedule, draft board and rules, laid out to use wide screens. */
export function LeagueOverviewView({
  overview,
  teams,
  base,
  points,
  playerBase,
}: {
  overview: LeagueOverview;
  teams: TeamInfo[];
  base: string;
  points: boolean;
  playerBase?: string;
}) {
  const byId = new Map<string, TeamInfo>(teams.map((t) => [t.id, t]));
  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? "Unknown") : "Bye");
  // Sleeper only reports total moves; ESPN breaks them down.
  const detailed = overview.waiverOrder.some((w) => w.drops !== undefined);
  const waiverRule = overview.rules.find((g) => g.title.startsWith("Waivers"))?.rows.find((r) => r.label === "Waivers process")?.value;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="flex min-w-0 flex-col gap-1.5">
          <h2 className="group-header">Waiver Order</h2>
          <div className="list-group overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[14px] tabular-nums">
              <thead>
                <tr className="text-[11px] font-semibold text-muted uppercase">
                  <th className="border-b-[0.5px] border-separator py-2 pl-4 text-left">#</th>
                  <th className="border-b-[0.5px] border-separator px-2 py-2 text-left">Team</th>
                  {detailed ? (
                    <>
                      <th className="border-b-[0.5px] border-separator px-2 py-2 text-right" title="Acquisitions">
                        Adds
                      </th>
                      <th className="border-b-[0.5px] border-separator px-2 py-2 text-right">Drops</th>
                      <th className="border-b-[0.5px] border-separator px-2 py-2 text-right">Trades</th>
                      <th className="border-b-[0.5px] border-separator py-2 pr-4 pl-2 text-right" title="Moves to IR">
                        IR
                      </th>
                    </>
                  ) : (
                    <th className="border-b-[0.5px] border-separator py-2 pr-4 pl-2 text-right">Moves</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {overview.waiverOrder.map((w) => {
                  const t = byId.get(w.teamId);
                  return (
                    <tr
                      key={w.teamId}
                      className={`[&>td]:border-t-[0.5px] [&>td]:border-separator first:[&>td]:border-t-0 ${t?.isMine ? "bg-accent-soft" : ""}`}
                    >
                      <td className="py-2 pl-4 font-semibold text-muted">{w.rank}</td>
                      <td className="px-2 py-2">
                        <Link href={t ? `${base}?tab=roster&team=${t.externalId}` : base} className="flex min-w-0 items-center gap-2">
                          <TeamAvatar src={t?.avatarUrl} name={t?.name ?? "?"} />
                          <span className={`truncate ${t?.isMine ? "font-semibold" : ""}`}>{t?.name ?? "Unknown"}</span>
                        </Link>
                      </td>
                      {detailed ? (
                        <>
                          <td className="px-2 py-2 text-right">{w.acquisitions}</td>
                          <td className="px-2 py-2 text-right">{w.drops}</td>
                          <td className="px-2 py-2 text-right">{w.trades}</td>
                          <td className="py-2 pr-4 pl-2 text-right">{w.moveToIR}</td>
                        </>
                      ) : (
                        <td className="py-2 pr-4 pl-2 text-right">{w.acquisitions}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="group-footer">
            #1 gets the first claim{waiverRule ? `; claims process ${waiverRule}` : ""}. A successful claim moves that team to the back.
          </p>
        </section>

        {overview.schedule.length > 0 && (
          <section className="flex min-w-0 flex-col gap-1.5">
            <h2 className="group-header">Schedule</h2>
            <div className="list-group divide-y-[0.5px] divide-separator">
              {overview.schedule.map((w) => {
                const mine = w.games.find((g) => byId.get(g.home)?.isMine || (g.away && byId.get(g.away)?.isMine));
                const current = w.period === overview.currentPeriod;
                return (
                  <details key={w.period} open={current} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                      <span className={`w-28 shrink-0 text-[15px] ${current ? "font-semibold text-accent" : "font-medium"}`}>{w.label}</span>
                      <span className="w-28 shrink-0 text-[13px] text-muted tabular-nums">{range(w)}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-[13px] text-muted">
                        {mine ? `vs ${name(byId.get(mine.home)?.isMine ? mine.away : mine.home)}` : w.playoff ? "To be determined" : ""}
                      </span>
                      <span aria-hidden className="text-faint transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </summary>
                    {w.games.length > 0 && (
                      <ul className="grid gap-x-6 gap-y-1 px-4 pb-3 text-[14px] sm:grid-cols-2">
                        {w.games.map((g, i) => (
                          <li key={i} className="flex items-center gap-2 tabular-nums">
                            <GameSide name={name(g.home)} score={g.homeScore} won={g.winner === "home"} mine={!!byId.get(g.home)?.isMine} />
                            <span className="text-faint">vs</span>
                            <GameSide
                              name={name(g.away)}
                              score={g.awayScore}
                              won={g.winner === "away"}
                              mine={!!(g.away && byId.get(g.away)?.isMine)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {overview.tradeBlock.length > 0 && (
        <Group header="Trade Block" footer="Players their managers are shopping. Tap a team to see its roster or start an offer.">
          {overview.tradeBlock.map((b) => {
            const t = byId.get(b.teamId);
            const id = b.playerId.split(":")[1];
            return (
              <div key={b.playerId} className="row-block">
                <div className="row-body gap-3">
                  <PlayerAvatar src={b.player?.headshotUrl} name={b.player?.name ?? "?"} />
                  <Link href={playerBase ? `${playerBase}/${id}` : "#"} className={`min-w-0 flex-1 ${playerBase ? "" : "pointer-events-none"}`}>
                    <span className="block truncate text-[15px] font-medium">{b.player?.name ?? `Player ${id}`}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {b.player ? `${b.player.nbaTeam ?? "FA"} · ${b.player.positions.join(", ")}` : ""}
                    </span>
                  </Link>
                  <Link
                    href={t ? `${base}?tab=roster&team=${t.externalId}` : base}
                    className={`shrink-0 text-[14px] ${t?.isMine ? "font-semibold" : "text-accent"}`}
                  >
                    {t?.isMine ? "Your team" : (t?.name ?? "Unknown")}
                  </Link>
                </div>
              </div>
            );
          })}
        </Group>
      )}

      {overview.draft.length > 0 && <DraftBoard picks={overview.draft} teams={teams} playerBase={playerBase} />}

      <section className="flex flex-col gap-1.5">
        <h2 className="group-header">League Settings</h2>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {overview.rules.map((g) => (
            <Group key={g.title} header={g.title}>
              {g.rows.map((r) => (
                <div key={r.label} className="row-block">
                  <div className="row-body justify-between gap-4 text-[15px]">
                    <span className="text-muted">{r.label}</span>
                    <span className="text-right">{r.value}</span>
                  </div>
                </div>
              ))}
            </Group>
          ))}
          <Group header={points ? "Points per Stat" : "Categories"}>
            <div className="row-block">
              <div className="row-body flex-wrap gap-x-5 gap-y-1.5 py-3 text-[15px] tabular-nums">
                {overview.scoring.map((s) => (
                  <span key={s.label}>
                    <span className="text-muted">{s.label}</span>{" "}
                    {s.points !== undefined && (
                      <span className={s.points < 0 ? "text-danger" : "font-medium"}>
                        {s.points > 0 ? "+" : ""}
                        {f1.format(s.points)}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </Group>
        </div>
      </section>
    </div>
  );
}

function GameSide({ name, score, won, mine }: { name: string; score?: number; won: boolean; mine: boolean }) {
  return (
    <span className={`flex min-w-0 flex-1 items-baseline justify-between gap-1 ${mine ? "font-semibold" : ""}`}>
      <span className="truncate">{name}</span>
      {score !== undefined && <span className={won ? "font-semibold text-text" : "text-muted"}>{f1.format(score)}</span>}
    </span>
  );
}

/** Rounds down, teams across in first-round order — like a draft board. */
function DraftBoard({ picks, teams, playerBase }: { picks: DraftPick[]; teams: TeamInfo[]; playerBase?: string }) {
  const byId = new Map<string, TeamInfo>(teams.map((t) => [t.id, t]));
  const order = picks.filter((p) => p.round === 1).map((p) => p.teamId);
  const rounds = Math.max(...picks.map((p) => p.round));
  const cell = new Map(picks.map((p) => [`${p.round}:${p.teamId}`, p]));
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h2 className="group-header">Draft Results</h2>
      <div className="list-group overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-[2] border-b-[0.5px] border-separator bg-surface px-2 py-2 text-[11px] text-muted shadow-[1px_0_0_var(--separator)]">
                Rd
              </th>
              {order.map((id) => {
                const t = byId.get(id);
                return (
                  <th
                    key={id}
                    className={`min-w-[112px] border-b-[0.5px] border-separator px-2 py-2 text-left text-[12px] font-semibold ${t?.isMine ? "text-accent" : ""}`}
                  >
                    <span className="line-clamp-2">{t?.name ?? "?"}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
              <tr key={r} className="[&>td]:border-t-[0.5px] [&>td]:border-separator">
                <td className="sticky left-0 z-[1] bg-surface px-2 py-1.5 text-center font-semibold text-muted shadow-[1px_0_0_var(--separator)]">
                  {r}
                </td>
                {order.map((id) => {
                  const p = cell.get(`${r}:${id}`);
                  const mine = byId.get(id)?.isMine;
                  return (
                    <td key={id} className={`px-2 py-1.5 align-top ${mine ? "bg-accent-soft" : ""}`}>
                      {p && (
                        <div className="flex items-center gap-1.5">
                          <PlayerAvatar src={p.player?.headshotUrl} name={p.player?.name ?? "?"} size="sm" />
                          <div className="min-w-0">
                            <Link
                              href={playerBase ? `${playerBase}/${p.playerId.split(":")[1]}` : "#"}
                              aria-disabled={!playerBase}
                              className={`line-clamp-2 leading-tight font-medium ${playerBase ? "hover:text-accent" : "pointer-events-none"}`}
                            >
                              {p.player?.name ?? `#${p.playerId.split(":")[1]}`}
                            </Link>
                            <div className="text-[10px] text-muted tabular-nums">
                              {p.overall} · {p.player ? `${p.player.nbaTeam ?? "FA"} ${p.player.positions[0] ?? ""}` : ""}
                              {p.keeper ? " · K" : ""}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
