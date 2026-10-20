import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeLeague, normalizeMatchups } from "@/lib/adapters/espn/normalize";
import type { EspnLeagueSettingsResponse, EspnMatchupsResponse } from "@/lib/adapters/espn/raw-types";
import { CategoryBoard } from "@/components/category-board";

const load = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", "espn", rel), "utf8")) as T;

describe("CategoryBoard on a finished most-categories matchup", () => {
  const settings = load<EspnLeagueSettingsResponse>("league-13937/settings.json");
  const league = normalizeLeague(settings, { leagueId: "13937", connectionId: "c" });
  const cats = new Set(settings.settings.scoringSettings.scoringItems.map((i) => i.statId));
  const m = normalizeMatchups(load<EspnMatchupsResponse>("league-13937/matchups.json"), 13937, 1, true, cats)[0];
  const html = renderToStaticMarkup(<CategoryBoard categories={league.scoring.categories!} home={m.home} away={m.away!} homeName="Home" awayName="Away" />);

  it("shows one row per category, with percentages as .xxx and TO marked lower-is-better", () => {
    expect((html.match(/<tr/g) ?? []).length).toBe(1 + 11);
    expect(html).toContain("(lower wins)");
    expect(html).toMatch(/>\.\d{3}</);
  });

  it("highlights as many categories per side as the tally says", () => {
    const greens = (html.match(/font-semibold text-success/g) ?? []).length;
    expect(greens).toBe(m.home.categoryRecord!.wins + m.away!.categoryRecord!.wins);
  });
});
