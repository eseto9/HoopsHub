"use server";

import { revalidatePath } from "next/cache";
import { PLATFORMS, type Platform } from "@/lib/schema";
import { movePlayer, type MoveResult } from "@/lib/services/lineup";
import { requireUser } from "@/lib/session";

export async function moveLineupAction(input: {
  platform: string;
  leagueId: string;
  from: number;
  to: number;
  playerId: string;
  targetPlayerId: string | null;
}): Promise<MoveResult> {
  const user = await requireUser();
  if (!PLATFORMS.includes(input.platform as Platform) || !/^\d+$/.test(input.leagueId)) {
    return { ok: false, error: "Invalid league." };
  }
  if (!Number.isInteger(input.from) || !Number.isInteger(input.to)) return { ok: false, error: "Invalid move." };

  const result = await movePlayer(user.id, input.platform as Platform, input.leagueId, {
    from: input.from,
    to: input.to,
    playerId: String(input.playerId),
    targetPlayerId: input.targetPlayerId === null ? null : String(input.targetPlayerId),
  });
  if (result.ok) {
    revalidatePath(`/leagues/${input.platform}/${input.leagueId}`);
    revalidatePath("/dashboard");
  }
  return result;
}
