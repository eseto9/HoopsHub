import type { InjuryStatus, LeagueFormat } from "@/lib/schema";

/**
 * ESPN encodes slots, positions and stats as numbers and the API returns no
 * lookup table. These maps come from the community `espn-api` library and are
 * cross-checked against our fixtures: both leagues' lineupSlotCounts match the
 * default PG/SG/SF/PF/C/G/F/UTILx3/BNx3/IR roster, and the default points
 * scoring (TO -2, FGA -1, FTA -1, PTS/REB/FTM/3PM +1, AST/FGM +2, STL/BLK +4)
 * lines up exactly with the stat ids below.
 */

export const LINEUP_SLOTS: Record<number, string> = {
  0: "PG",
  1: "SG",
  2: "SF",
  3: "PF",
  4: "C",
  5: "G",
  6: "F",
  7: "SG/SF",
  8: "G/F",
  9: "PF/C",
  10: "F/C",
  11: "UTIL",
  12: "BN",
  13: "IR",
};

export const BENCH_SLOT = 12;
export const IR_SLOT = 13;

/** Base positions; a player's eligibleSlots within 0-4 are their positions. */
export const BASE_POSITION_SLOTS = [0, 1, 2, 3, 4];

/** defaultPositionId is 1-based: 1 = PG ... 5 = C. */
export function defaultPosition(defaultPositionId: number): string | undefined {
  return BASE_POSITION_SLOTS.includes(defaultPositionId - 1) ? LINEUP_SLOTS[defaultPositionId - 1] : undefined;
}

export const STATS: Record<number, { key: string; label: string }> = {
  0: { key: "pts", label: "PTS" },
  1: { key: "blk", label: "BLK" },
  2: { key: "stl", label: "STL" },
  3: { key: "ast", label: "AST" },
  4: { key: "oreb", label: "OREB" },
  5: { key: "dreb", label: "DREB" },
  6: { key: "reb", label: "REB" },
  7: { key: "ej", label: "EJ" },
  8: { key: "ff", label: "FF" },
  9: { key: "pf", label: "PF" },
  10: { key: "tech", label: "TECH" },
  11: { key: "to", label: "TO" },
  12: { key: "dq", label: "DQ" },
  13: { key: "fgm", label: "FGM" },
  14: { key: "fga", label: "FGA" },
  15: { key: "ftm", label: "FTM" },
  16: { key: "fta", label: "FTA" },
  17: { key: "3pm", label: "3PM" },
  18: { key: "3pa", label: "3PA" },
  19: { key: "fg_pct", label: "FG%" },
  20: { key: "ft_pct", label: "FT%" },
  21: { key: "3p_pct", label: "3P%" },
  22: { key: "afg_pct", label: "AFG%" },
  23: { key: "fgmi", label: "FGMI" },
  24: { key: "ftmi", label: "FTMI" },
  25: { key: "3pmi", label: "3PMI" },
  26: { key: "apg", label: "APG" },
  27: { key: "bpg", label: "BPG" },
  28: { key: "mpg", label: "MPG" },
  29: { key: "ppg", label: "PPG" },
  30: { key: "rpg", label: "RPG" },
  31: { key: "spg", label: "SPG" },
  32: { key: "topg", label: "TOPG" },
  33: { key: "3pg", label: "3PG" },
  34: { key: "ppm", label: "PPM" },
  35: { key: "ato", label: "A/TO" },
  36: { key: "str", label: "STR" },
  37: { key: "dd", label: "DD" },
  38: { key: "td", label: "TD" },
  39: { key: "qd", label: "QD" },
  40: { key: "min", label: "MIN" },
  41: { key: "gs", label: "GS" },
  42: { key: "gp", label: "GP" },
  43: { key: "tw", label: "TW" },
  44: { key: "ftr", label: "FTR" },
};

export function statInfo(statId: number) {
  return STATS[statId] ?? { key: `stat_${statId}`, label: `Stat ${statId}` };
}

/** Only ACTIVE, DAY_TO_DAY and OUT have been observed; the rest are best-effort. */
export function mapInjury(status: string | undefined): InjuryStatus | undefined {
  switch (status) {
    case undefined:
    case "ACTIVE":
    case "NORMAL":
      return undefined;
    case "DAY_TO_DAY":
      return "DTD";
    case "OUT":
      return "OUT";
    case "SUSPENSION":
      return "SUSP";
    case "INJURY_RESERVE":
      return "IR";
    default:
      return "OTHER";
  }
}

/**
 * Only "H2H_POINTS" has been observed. The other branches are unverified
 * guesses until a roto / categories league fixture is captured.
 */
export function mapScoringType(scoringType: string): LeagueFormat {
  if (scoringType === "H2H_POINTS") return "h2h-points";
  const t = scoringType.toUpperCase();
  if (t.includes("ROTO")) return "roto";
  if (t.includes("CATEGOR")) return "h2h-categories";
  if (t.includes("POINTS")) return "points";
  return "h2h-points";
}

export function leagueUrl(leagueId: string | number, season: string | number) {
  return `https://fantasy.espn.com/basketball/league?leagueId=${leagueId}&seasonId=${season}`;
}

/** ESPN CDN headshot pattern; the UI must tolerate a missing image. */
export function headshotUrl(playerId: number) {
  return `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`;
}
