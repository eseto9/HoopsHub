/**
 * Fetch real ESPN fantasy basketball data and save it to /fixtures/espn.
 *
 *   npx tsx scripts/fetch-espn.ts <leagueId> [leagueId...] [--season 2027]
 *
 * With cookies set and no league ids, only the fan profile is fetched, which
 * lists the leagues your account belongs to.
 *
 * Public leagues need nothing. Private leagues need your ESPN cookies in
 * .env.local (gitignored), NOT on the command line:
 *   ESPN_S2=...        cookie "espn_s2" from espn.com, copied as-is
 *   ESPN_SWID={...}    cookie "SWID", including the curly braces
 *
 * Every saved file has the exact espn_s2 and SWID values replaced with
 * placeholders. Before committing, run `node scripts/anonymize-fixtures.mjs`
 * to replace leaguemates' names (the repo is public).
 *
 * Output:
 *   fixtures/espn/game.json                       game metadata (current season etc.)
 *   fixtures/espn/pro-teams-<season>.json         NBA teams + schedules
 *   fixtures/espn/fan.json                        your ESPN profile + leagues (cookies only)
 *   fixtures/espn/league-<id>/settings.json       mSettings + mStatus + mTeam
 *   fixtures/espn/league-<id>/roster.json         mRoster
 *   fixtures/espn/league-<id>/matchups.json       mMatchup + mMatchupScore
 *   fixtures/espn/league-<id>/standings.json      mStandings
 *   fixtures/espn/league-<id>/scoreboard.json     mScoreboard (current period)
 *   fixtures/espn/league-<id>/free-agents.json    kona_player_info (top 50 FA/waivers)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const READS = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba";
const OUT = path.join(process.cwd(), "fixtures", "espn");

const ESPN_S2 = process.env.ESPN_S2?.trim() || "";
const SWID = process.env.ESPN_SWID?.trim() || "";
const cookieHeader = ESPN_S2 && SWID ? `espn_s2=${ESPN_S2}; SWID=${SWID}` : "";

export function redact(text: string, s2 = ESPN_S2, swid = SWID): string {
  let out = text;
  if (s2) {
    out = out.split(s2).join("REDACTED_ESPN_S2");
    let decoded = s2;
    try {
      decoded = decodeURIComponent(s2);
    } catch {}
    out = out.split(decoded).join("REDACTED_ESPN_S2");
  }
  if (swid) {
    const bare = swid.replace(/[{}]/g, "").replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    // Case-insensitive: ESPN returns member ids in varying case, with or without braces.
    out = out.replace(new RegExp(`\\{?${bare}\\}?`, "gi"), "{REDACTED-SWID}");
  }
  return out;
}

async function get(url: string, extraHeaders: Record<string, string> = {}): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 400)); // be gentle; limits are undocumented
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(cookieHeader ? { Cookie: cookieHeader } : {}), ...extraHeaders },
    redirect: "manual",
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${res.status} from ESPN: ` +
        (cookieHeader
          ? "your cookies were rejected (expired, or this account isn't in the league)."
          : "this league is private. Put ESPN_S2 and ESPN_SWID in .env.local and re-run."),
    );
  }
  if (res.status === 404) throw new Error("404 from ESPN: league not found for this season (try --season).");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${redact(url)}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error(`Expected JSON but got "${type}" for ${redact(url)}`);
  return res.json();
}

async function save(rel: string, data: unknown) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  const text = redact(JSON.stringify(data, null, 2));
  await writeFile(file, text);
  console.log(`  saved ${path.relative(process.cwd(), file)} (${Math.round(text.length / 1024)} KB)`);
}

function leagueUrl(season: string, leagueId: string, views: string[], extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const v of views) params.append("view", v);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return `${READS}/seasons/${season}/segments/0/leagues/${leagueId}?${params}`;
}

function field(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const seasonIdx = args.indexOf("--season");
  const seasonArg = seasonIdx >= 0 ? args[seasonIdx + 1] : undefined;
  const leagueIds = args.filter((a, i) => /^\d+$/.test(a) && (seasonIdx < 0 || i !== seasonIdx + 1));

  if (leagueIds.length === 0 && !cookieHeader) {
    console.error("Usage: npx tsx scripts/fetch-espn.ts <leagueId> [leagueId...] [--season 2027]");
    console.error("Find the league id in the URL: fantasy.espn.com/basketball/league?leagueId=XXXXX");
    process.exit(1);
  }
  if ((ESPN_S2 && !SWID) || (!ESPN_S2 && SWID)) console.log("Warning: only one of ESPN_S2 / ESPN_SWID is set; ignoring both.");
  console.log(cookieHeader ? "Using ESPN cookies from .env.local (values are redacted in saved files)." : "No cookies set: public leagues only.");

  console.log("Fetching game metadata...");
  const game = await get(READS);
  await save("game.json", game);

  // ESPN appears to label NBA seasons by the year they end (2026-27 -> 2027);
  // prefer the API's own value, and --season overrides both.
  const now = new Date();
  const season =
    seasonArg ?? String(field(game, "currentSeasonId") ?? (now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear()));
  console.log(`Season: ${season}`);

  console.log("Fetching NBA pro teams...");
  try {
    await save(`pro-teams-${season}.json`, await get(`${READS}/seasons/${season}?view=proTeamSchedules_wl`));
  } catch (e) {
    console.log(`  pro teams: ${(e as Error).message}`);
  }

  if (cookieHeader) {
    console.log("Fetching your ESPN fan profile (for automatic league discovery)...");
    try {
      await save(
        "fan.json",
        await get(`https://fan.api.espn.com/apis/v2/fans/${encodeURIComponent(SWID)}?displayEvents=true&featureFlags=challengeEntries&platform=web`),
      );
    } catch (e) {
      console.log(`  fan profile: ${(e as Error).message}`);
    }
  }

  for (const id of leagueIds) {
    console.log(`League ${id}...`);
    try {
      const settings = await get(leagueUrl(season, id, ["mSettings", "mStatus", "mTeam"]));
      await save(`league-${id}/settings.json`, settings);

      await save(`league-${id}/roster.json`, await get(leagueUrl(season, id, ["mRoster"])));
      await save(`league-${id}/matchups.json`, await get(leagueUrl(season, id, ["mMatchup", "mMatchupScore"])));
      await save(`league-${id}/standings.json`, await get(leagueUrl(season, id, ["mStandings"])));

      const period = field(settings, "scoringPeriodId");
      const periodParam: Record<string, string> = period ? { scoringPeriodId: String(period) } : {};
      await save(`league-${id}/scoreboard.json`, await get(leagueUrl(season, id, ["mScoreboard"], periodParam)));

      const filter = {
        players: {
          filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
          limit: 50,
          sortPercOwned: { sortPriority: 1, sortAsc: false },
        },
      };
      await save(
        `league-${id}/free-agents.json`,
        await get(leagueUrl(season, id, ["kona_player_info"], periodParam), { "X-Fantasy-Filter": JSON.stringify(filter) }),
      );
    } catch (e) {
      console.log(`  ${(e as Error).message}`);
    }
  }

  console.log(`\nDone. Fixtures in fixtures/espn/. Cookies were ${cookieHeader ? "used and redacted" : "not used"}.`);
}

if (process.argv[1]?.includes("fetch-espn")) {
  main().catch((err) => {
    console.error(err instanceof Error ? redact(err.message) : err);
    process.exit(1);
  });
}
