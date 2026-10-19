import { unifiedId, type PlayerListing } from "@/lib/schema";
import { normalizePlayer, type ProTeamMap } from "./normalize";
import type { EspnPlayerPoolEntry } from "./raw-types";
import { gamesThisWeek, gameToday, type ProSchedule } from "./schedule";

/**
 * Players page rows from kona_player_info entries. Verified statuses:
 * FREEAGENT, WAIVERS (with waiverProcessDate), ONTEAM (with onTeamId).
 */
export function normalizePlayerPool(
  entries: EspnPlayerPoolEntry[],
  leagueId: string,
  proTeams: ProTeamMap,
  schedule: ProSchedule,
  now: number,
): PlayerListing[] {
  return entries.map((e) => {
    const rostered = e.status === "ONTEAM" || e.onTeamId > 0;
    const o = e.player.ownership;
    return {
      player: normalizePlayer(e.player, proTeams),
      status: rostered ? "rostered" : e.status === "WAIVERS" ? "waivers" : "free_agent",
      fantasyTeamId: rostered && e.onTeamId > 0 ? unifiedId("espn", `${leagueId}.${e.onTeamId}`) : null,
      waiverClearsAt: e.waiverProcessDate ? new Date(e.waiverProcessDate).toISOString() : undefined,
      percentRostered: o?.percentOwned,
      percentRosteredChange: o?.percentChange,
      percentStarted: o?.percentStarted,
      gamesThisWeek: gamesThisWeek(schedule, e.player.proTeamId, now),
      today: gameToday(schedule, e.player.proTeamId, now, proTeams),
    };
  });
}
