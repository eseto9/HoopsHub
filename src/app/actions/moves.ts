"use server";

import { revalidatePath } from "next/cache";
import { markFresh } from "@/lib/cache";
import { PLATFORMS, type Platform } from "@/lib/schema";
import { addDropPlayer, cancelPendingMove, proposeTrade, type MoveOutcome } from "@/lib/services/moves";
import { requireUser } from "@/lib/session";

const ID = /^\d{1,12}$/;
const TXN = /^[0-9a-f-]{36}$/i;

function valid(platform: string, leagueId: string): platform is Platform {
  return PLATFORMS.includes(platform as Platform) && ID.test(leagueId);
}

async function refresh(platform: string, leagueId: string) {
  await markFresh();
  revalidatePath(`/leagues/${platform}/${leagueId}`);
  revalidatePath("/dashboard");
}

export async function addDropAction(input: {
  platform: string;
  leagueId: string;
  addPlayerId: string;
  addName: string;
  dropPlayerId?: string;
  dropName?: string;
}): Promise<MoveOutcome> {
  const user = await requireUser();
  if (!valid(input.platform, input.leagueId) || !ID.test(input.addPlayerId) || (input.dropPlayerId && !ID.test(input.dropPlayerId))) {
    return { ok: false, error: "Invalid move." };
  }
  const res = await addDropPlayer(user.id, input.platform, input.leagueId, {
    addPlayerId: input.addPlayerId,
    addName: String(input.addName).slice(0, 80),
    dropPlayerId: input.dropPlayerId,
    dropName: input.dropName ? String(input.dropName).slice(0, 80) : undefined,
  });
  if (res.ok || (!res.ok && res.stale)) await refresh(input.platform, input.leagueId);
  return res;
}

export async function proposeTradeAction(input: {
  platform: string;
  leagueId: string;
  toTeamId: string;
  sendPlayerIds: string[];
  receivePlayerIds: string[];
  message?: string;
}): Promise<MoveOutcome> {
  const user = await requireUser();
  const ids = [...input.sendPlayerIds, ...input.receivePlayerIds];
  if (!valid(input.platform, input.leagueId) || !ID.test(input.toTeamId) || ids.length > 20 || !ids.every((i) => ID.test(i))) {
    return { ok: false, error: "Invalid trade." };
  }
  const res = await proposeTrade(user.id, input.platform, input.leagueId, {
    toTeamId: input.toTeamId,
    sendPlayerIds: input.sendPlayerIds,
    receivePlayerIds: input.receivePlayerIds,
    message: input.message ? String(input.message).slice(0, 500) : undefined,
  });
  if (res.ok || (!res.ok && res.stale)) await refresh(input.platform, input.leagueId);
  return res;
}

export async function cancelPendingAction(input: { platform: string; leagueId: string; transactionId: string }): Promise<MoveOutcome> {
  const user = await requireUser();
  if (!valid(input.platform, input.leagueId) || !TXN.test(input.transactionId)) return { ok: false, error: "Invalid request." };
  const res = await cancelPendingMove(user.id, input.platform, input.leagueId, input.transactionId);
  if (res.ok || (!res.ok && res.stale)) await refresh(input.platform, input.leagueId);
  return res;
}
