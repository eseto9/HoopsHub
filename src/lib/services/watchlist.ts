import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { Platform } from "@/lib/schema";

const { watchlist } = schema;

export async function watchedPlayerIds(userId: string, platform: Platform): Promise<string[]> {
  const rows = await getDb()
    .select({ id: watchlist.playerExternalId })
    .from(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.platform, platform)));
  return rows.map((r) => r.id);
}

/** Adds or removes a player; returns whether they're now watched. */
export async function setWatched(userId: string, platform: Platform, playerExternalId: string, watched: boolean): Promise<boolean> {
  const db = getDb();
  if (watched) {
    await db.insert(watchlist).values({ id: crypto.randomUUID(), userId, platform, playerExternalId }).onConflictDoNothing();
  } else {
    await db
      .delete(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.platform, platform), eq(watchlist.playerExternalId, playerExternalId)));
  }
  return watched;
}
