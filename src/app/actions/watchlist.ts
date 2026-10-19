"use server";

import { PLATFORMS, type Platform } from "@/lib/schema";
import { setWatched } from "@/lib/services/watchlist";
import { requireUser } from "@/lib/session";

export async function setWatchedAction(input: { platform: string; playerId: string; watched: boolean }): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!PLATFORMS.includes(input.platform as Platform) || !/^\d{1,12}$/.test(input.playerId)) return { ok: false };
  await setWatched(user.id, input.platform as Platform, input.playerId, Boolean(input.watched));
  return { ok: true };
}
