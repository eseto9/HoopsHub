import type { MatchupSide, ScoringCategory } from "@/lib/schema";
import { categoryValueText } from "@/lib/score";

/**
 * Category-by-category scoreboard for a category-league matchup: each team's
 * value, with the side winning that category highlighted (lower wins for
 * stats like turnovers).
 */
export function CategoryBoard({
  categories,
  home,
  away,
  homeName,
  awayName,
}: {
  categories: ScoringCategory[];
  home: MatchupSide;
  away: MatchupSide;
  homeName: string;
  awayName: string;
}) {
  if (!home.categoryValues || !away.categoryValues) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="group-header">Categories</h2>
      <div className="list-group overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[15px] tabular-nums">
          <thead>
            <tr className="text-[11px] font-semibold text-muted uppercase [&>th]:border-b-[0.5px] [&>th]:border-separator [&>th]:px-3 [&>th]:py-2">
              <th className="text-left">Category</th>
              <th className="max-w-[140px] truncate text-right">{homeName}</th>
              <th className="max-w-[140px] truncate text-right">{awayName}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const h = home.categoryValues![c.stat];
              const a = away.categoryValues![c.stat];
              const winner = h === undefined || a === undefined || h === a ? null : (h > a) === c.higherIsBetter ? "home" : "away";
              return (
                <tr key={c.stat} className="[&>td]:border-t-[0.5px] [&>td]:border-separator first:[&>td]:border-t-0">
                  <td className="px-3 py-2 font-medium">
                    {c.label}
                    {!c.higherIsBetter && <span className="ml-1 text-[11px] text-muted">(lower wins)</span>}
                  </td>
                  <td className={`px-3 py-2 text-right ${winner === "home" ? "font-semibold text-success" : winner ? "text-muted" : ""}`}>{categoryValueText(c.stat, h)}</td>
                  <td className={`px-3 py-2 text-right ${winner === "away" ? "font-semibold text-success" : winner ? "text-muted" : ""}`}>{categoryValueText(c.stat, a)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
