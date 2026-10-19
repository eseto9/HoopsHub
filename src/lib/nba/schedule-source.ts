import "server-only";
import { cached, ESPN_READS, espnFetch } from "@/lib/adapters/espn/client";
import { normalizeProTeams, type ProTeamMap } from "@/lib/adapters/espn/normalize";
import type { EspnGame, EspnProTeamsResponse } from "@/lib/adapters/espn/raw-types";
import { normalizeProSchedule, type ProSchedule } from "@/lib/adapters/espn/schedule";

/**
 * The NBA schedule from ESPN's public proTeamSchedules view, for any platform
 * (Sleeper has no schedule of its own). Shares the ESPN adapter's cache keys.
 */
export interface NbaSchedule {
  schedule: ProSchedule;
  /** ESPN pro team id -> abbreviation ("GS", "NY", "UTAH"...). */
  abbrev: ProTeamMap;
  idByAbbrev: Map<string, number>;
}

export async function nbaSchedule(): Promise<NbaSchedule> {
  const game = await cached("espn:game", 3600, () => espnFetch<EspnGame>(ESPN_READS, { cookies: null }));
  const raw = await cached(`espn:proTeamsRaw:${game.currentSeasonId}`, 86400, () =>
    espnFetch<EspnProTeamsResponse>(`${ESPN_READS}/seasons/${game.currentSeasonId}?view=proTeamSchedules_wl`, { cookies: null }),
  );
  const abbrev = normalizeProTeams(raw);
  return { schedule: normalizeProSchedule(raw), abbrev, idByAbbrev: new Map(Object.entries(abbrev).map(([id, a]) => [a, Number(id)])) };
}
