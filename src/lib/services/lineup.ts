import "server-only";
import { getAdapter } from "@/lib/adapters/registry";
import { invalidate } from "@/lib/cache";
import { PlatformError, ReconnectRequiredError } from "@/lib/errors";
import { planMove } from "@/lib/lineup";
import type { Platform } from "@/lib/schema";
import { markNeedsReconnect } from "./connections";
import { resolveLeague } from "./leagues";

export type MoveResult = { ok: true; message: string } | { ok: false; error: string; reconnect?: boolean };

/**
 * Move a player on the user's own team. Re-reads the roster fresh and
 * re-checks the move server-side; never trusts the client's view.
 */
export async function movePlayer(
  userId: string,
  platform: Platform,
  leagueId: string,
  move: { from: number; to: number; playerId: string; targetPlayerId: string | null },
): Promise<MoveResult> {
  const resolved = await resolveLeague(userId, platform, leagueId);
  if (!resolved) return { ok: false, error: "League not found." };
  const adapter = getAdapter(platform);
  if (!resolved.viaAccount || !adapter.setLineup || !adapter.capabilities.setLineup) {
    return { ok: false, error: "Connect your account to edit this lineup." };
  }
  const { conn } = resolved;
  const myTeam = (await adapter.getTeams(conn, leagueId)).find((t) => t.isMine);
  if (!myTeam) return { ok: false, error: "Couldn't find your team in this league." };

  // Cache keys are "<platform>:conn:<connectionId>:..." (see each adapter).
  invalidate(`${platform}:conn:${conn.id}:`);
  const { slots } = await adapter.getRoster(conn, leagueId, myTeam.externalId);
  const a = slots[move.from]?.player;
  const b = slots[move.to]?.player ?? null;
  if (a?.externalId !== move.playerId || (b?.externalId ?? null) !== move.targetPlayerId) {
    return { ok: false, error: "Your lineup changed since this page loaded. Refresh and try again." };
  }
  const plan = planMove(slots, move.from, move.to);
  if (!plan.ok) return { ok: false, error: plan.reason };

  try {
    await adapter.setLineup(conn, leagueId, myTeam.externalId, plan.changes);
  } catch (err) {
    if (err instanceof ReconnectRequiredError) {
      await markNeedsReconnect(conn.id);
      return { ok: false, error: "Your connection expired. Reconnect to keep editing.", reconnect: true };
    }
    if (err instanceof PlatformError) return { ok: false, error: err.message };
    throw err;
  }
  const to = slots[move.to].slot;
  return { ok: true, message: b ? `Swapped ${a.name} and ${b.name}.` : `Moved ${a.name} to ${to}.` };
}
