import "server-only";
import { cached } from "@/lib/adapters/espn/client";
import { normalizeNews } from "@/lib/adapters/espn/playercard";
import type { EspnNewsResponse } from "@/lib/adapters/espn/raw-types";
import type { NewsItem } from "@/lib/schema";

/** ESPN's public fantasy news for one player (by ESPN athlete id), cached 10 minutes. */
export async function playerNews(espnId: string, limit = 3): Promise<NewsItem[]> {
  if (!/^\d+$/.test(espnId)) return [];
  const raw = await cached(`espn:news:${espnId}`, 600, async () => {
    const res = await fetch(`https://site.api.espn.com/apis/fantasy/v3/games/fba/news/players?days=14&playerId=${espnId}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as EspnNewsResponse) : null;
  }).catch(() => null);
  return normalizeNews(raw, limit);
}

/** Run tasks with at most \`n\` in flight, so a page load doesn't fire dozens of requests at once. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
