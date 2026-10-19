/**
 * Fetch real Sleeper NBA data and save it to /fixtures/sleeper.
 *
 *   npx tsx scripts/fetch-sleeper.ts <sleeper_username> [season]
 *   npx tsx scripts/fetch-sleeper.ts --league <league_id>
 *
 * With --league, the league's owner (or first manager) stands in as "the
 * user", so user.json and leagues-<season>.json come from them.
 *
 * Sleeper's API is public (no auth), so there are no credentials to strip.
 * Responses are saved raw so the adapter types can be written from real shapes.
 *
 * Output:
 *   fixtures/sleeper/state.json
 *   fixtures/sleeper/user.json
 *   fixtures/sleeper/leagues-<season>.json
 *   fixtures/sleeper/league-<id>/{league,users,rosters,traded_picks}.json
 *   fixtures/sleeper/league-<id>/matchups-week-<n>.json
 *   fixtures/sleeper/league-<id>/transactions-week-<n>.json
 *   fixtures/sleeper/league-<id>/drafts.json, draft-picks.json
 *   fixtures/sleeper/league-<id>/winners_bracket.json
 *   fixtures/sleeper/trending-add.json
 *   fixtures/sleeper/players-nba.json        (only players on fetched rosters)
 *   fixtures/sleeper/players-nba.full.json   (full dump, gitignored)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://api.sleeper.app/v1";
const OUT = path.join(process.cwd(), "fixtures", "sleeper");

async function get(urlPath: string): Promise<unknown> {
  // Sleeper asks for < 1000 calls/minute; stay well under.
  await new Promise((r) => setTimeout(r, 150));
  const res = await fetch(`${BASE}${urlPath}`);
  if (!res.ok) throw new Error(`GET ${urlPath} -> ${res.status}`);
  return res.json();
}

async function save(rel: string, data: unknown) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  const count = Array.isArray(data) ? ` (${data.length} items)` : "";
  console.log(`  saved ${path.relative(process.cwd(), file)}${count}`);
}

function field(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const leagueArg = args[0] === "--league" ? args[1] : undefined;
  let [username, seasonArg] = leagueArg ? [undefined, undefined] : args;
  if (leagueArg) {
    const league = await get(`/league/${leagueArg}`);
    const users = (await get(`/league/${leagueArg}/users`)) as unknown[];
    const owner = users.find((u) => field(u, "is_owner")) ?? users[0];
    username = String(field(owner, "display_name") ?? "");
    seasonArg = String(field(league, "season") ?? "");
  }
  if (!username) {
    console.error("Usage: npx tsx scripts/fetch-sleeper.ts <sleeper_username> [season]  |  --league <league_id>");
    process.exit(1);
  }

  console.log("Fetching NBA state...");
  const state = await get("/state/nba");
  await save("state.json", state);

  console.log(`Fetching user "${username}"...`);
  const user = await get(`/user/${encodeURIComponent(username)}`);
  if (!user) throw new Error(`Sleeper user "${username}" not found`);
  await save("user.json", user);
  const userId = String(field(user, "user_id"));

  const season = seasonArg ?? String(field(state, "season") ?? new Date().getFullYear());
  console.log(`Fetching NBA leagues for season ${season}...`);
  const all = (await get(`/user/${userId}/leagues/nba/${season}`)) as unknown[];
  // With --league, only capture that league (the stand-in user may be in many).
  const leagues = leagueArg ? all.filter((l) => String(field(l, "league_id")) === leagueArg) : all;
  await save(`leagues-${season}.json`, leagues);

  if (!Array.isArray(leagues) || leagues.length === 0) {
    console.log(`\nNo NBA leagues found for ${season}. Try passing a different season, e.g. ${Number(season) - 1}.`);
    return;
  }

  const currentWeek = Number(field(state, "week") ?? field(state, "leg") ?? 1) || 1;
  const rosteredIds = new Set<string>();

  for (const league of leagues) {
    const id = String(field(league, "league_id"));
    console.log(`League ${id} (${String(field(league, "name"))})...`);
    await save(`league-${id}/league.json`, await get(`/league/${id}`));
    await save(`league-${id}/users.json`, await get(`/league/${id}/users`));
    const rosters = (await get(`/league/${id}/rosters`)) as unknown[];
    await save(`league-${id}/rosters.json`, rosters);
    await save(`league-${id}/traded_picks.json`, await get(`/league/${id}/traded_picks`));
    await save(`league-${id}/winners_bracket.json`, await get(`/league/${id}/winners_bracket`).catch(() => []));
    const drafts = (await get(`/league/${id}/drafts`)) as unknown[];
    await save(`league-${id}/drafts.json`, drafts);
    const draftId = drafts?.[0] ? field(drafts[0], "draft_id") : undefined;
    if (draftId) await save(`league-${id}/draft-picks.json`, await get(`/draft/${draftId}/picks`));

    for (const r of rosters ?? []) {
      for (const key of ["players", "starters", "reserve", "taxi"]) {
        const ids = field(r, key);
        if (Array.isArray(ids)) ids.forEach((p) => p && rosteredIds.add(String(p)));
      }
    }

    // Week 1 plus current week (and previous) to see upcoming, live, and final shapes.
    const weeks = [...new Set([1, Math.max(1, currentWeek - 1), currentWeek])];
    for (const w of weeks) {
      try {
        await save(`league-${id}/matchups-week-${w}.json`, await get(`/league/${id}/matchups/${w}`));
        await save(`league-${id}/transactions-week-${w}.json`, await get(`/league/${id}/transactions/${w}`));
      } catch (e) {
        console.log(`  matchups week ${w}: ${(e as Error).message}`);
      }
    }
  }

  console.log("Fetching trending adds...");
  await save("trending-add.json", await get("/players/nba/trending/add?lookback_hours=24&limit=25"));

  console.log("Fetching full NBA player map (large, once)...");
  const players = (await get("/players/nba")) as Record<string, unknown>;
  await save("players-nba.full.json", players);
  const subset: Record<string, unknown> = {};
  for (const pid of rosteredIds) if (players[pid]) subset[pid] = players[pid];
  // Include a handful of unrostered players so free-agent normalization has samples.
  let extra = 0;
  for (const [pid, p] of Object.entries(players)) {
    if (extra >= 25) break;
    if (!rosteredIds.has(pid) && field(p, "active") === true && field(p, "team")) {
      subset[pid] = p;
      extra++;
    }
  }
  await save("players-nba.json", subset);

  console.log(`\nDone. ${leagues.length} league(s), ${rosteredIds.size} rostered players.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
