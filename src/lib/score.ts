/**
 * One way to show a matchup score on every screen: fantasy points in points
 * leagues, the category tally (wins-losses-ties) in category leagues.
 */
export interface ScoreLike {
  score?: number;
  categoryRecord?: { wins: number; losses: number; ties: number };
}

const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function scoreText(s: ScoreLike | null | undefined): string {
  if (!s) return "–";
  if (s.categoryRecord) return `${s.categoryRecord.wins}-${s.categoryRecord.losses}-${s.categoryRecord.ties}`;
  return s.score === undefined ? "–" : f1.format(s.score);
}

/** Positive when "me" is ahead: points margin, or categories won minus lost. */
export function scoreLead(me: ScoreLike | null | undefined, them: ScoreLike | null | undefined): number | undefined {
  if (me?.categoryRecord) return me.categoryRecord.wins - me.categoryRecord.losses;
  if (me?.score === undefined || them?.score === undefined) return undefined;
  return me.score - them.score;
}

export function leadText(me: ScoreLike | null | undefined, them: ScoreLike | null | undefined): string | undefined {
  const lead = scoreLead(me, them);
  if (lead === undefined) return undefined;
  if (me?.categoryRecord) return lead > 0 ? `Winning ${scoreText(me)}` : lead < 0 ? `Losing ${scoreText(me)}` : `Tied ${scoreText(me)}`;
  return lead > 0 ? `Up ${f1.format(lead)}` : lead < 0 ? `Down ${f1.format(-lead)}` : "Tied";
}

/** Category values: percentages as .489, counts as whole numbers. */
export function categoryValueText(key: string, v: number | undefined): string {
  if (v === undefined) return "–";
  if (key.endsWith("_pct")) return v >= 1 ? v.toFixed(2) : v.toFixed(3).replace(/^0/, "");
  return Number.isInteger(v) ? String(v) : f1.format(v);
}
