import "server-only";
import { getAdapter } from "@/lib/adapters/registry";
import type { AdapterConnection, PlatformAdapter, TradeProposal } from "@/lib/adapters/types";
import { PlatformError, ReconnectRequiredError } from "@/lib/errors";
import type { Platform } from "@/lib/schema";
import { markNeedsReconnect } from "./connections";
import { resolveLeague } from "./leagues";

export type MoveOutcome =
  | { ok: true; message: string; pending?: boolean }
  | { ok: false; error: string; reconnect?: boolean; /** Data on screen is out of date; refresh it. */ stale?: boolean };

/** Resolve the league through the user's own account and find their team. */
async function ownTeam(userId: string, platform: Platform, leagueId: string): Promise<
  { ok: true; conn: AdapterConnection; adapter: PlatformAdapter; teamId: string } | { ok: false; error: string }
> {
  const resolved = await resolveLeague(userId, platform, leagueId);
  if (!resolved) return { ok: false, error: "League not found." };
  if (!resolved.viaAccount) return { ok: false, error: "Connect your account to make moves in this league." };
  const adapter = getAdapter(platform);
  const team = (await adapter.getTeams(resolved.conn, leagueId)).find((t) => t.isMine);
  if (!team) return { ok: false, error: "Couldn't find your team in this league." };
  return { ok: true, conn: resolved.conn, adapter, teamId: team.externalId };
}

async function run(conn: AdapterConnection, fn: () => Promise<MoveOutcome>): Promise<MoveOutcome> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ReconnectRequiredError) {
      await markNeedsReconnect(conn.id);
      return { ok: false, error: "Your connection expired. Reconnect to keep making moves.", reconnect: true };
    }
    if (err instanceof PlatformError) return { ok: false, error: err.message, stale: err.status === 409 };
    throw err;
  }
}

export async function addDropPlayer(
  userId: string,
  platform: Platform,
  leagueId: string,
  move: { addPlayerId: string; addName: string; dropPlayerId?: string; dropName?: string },
): Promise<MoveOutcome> {
  const own = await ownTeam(userId, platform, leagueId);
  if (!own.ok) return own;
  if (!own.adapter.addDrop || !own.adapter.capabilities.addDrop) return { ok: false, error: "Adding players isn't supported here yet." };
  return run(own.conn, async () => {
    const res = await own.adapter.addDrop!(own.conn, leagueId, own.teamId, { addPlayerId: move.addPlayerId, dropPlayerId: move.dropPlayerId });
    const dropped = move.dropName ? ` and dropping ${move.dropName}` : "";
    return res.status === "pending"
      ? { ok: true, pending: true, message: `Claim placed for ${move.addName}${dropped}. It processes when waivers clear.` }
      : { ok: true, message: `Added ${move.addName}${move.dropName ? ` and dropped ${move.dropName}` : ""}.` };
  });
}

export async function proposeTrade(userId: string, platform: Platform, leagueId: string, proposal: TradeProposal): Promise<MoveOutcome> {
  const own = await ownTeam(userId, platform, leagueId);
  if (!own.ok) return own;
  if (!own.adapter.proposeTrade || !own.adapter.capabilities.trades) return { ok: false, error: "Trades aren't supported here yet." };
  return run(own.conn, async () => {
    await own.adapter.proposeTrade!(own.conn, leagueId, own.teamId, proposal);
    return { ok: true, pending: true, message: "Trade offer sent. It shows under Activity until they respond." };
  });
}

export async function cancelPendingMove(userId: string, platform: Platform, leagueId: string, transactionId: string): Promise<MoveOutcome> {
  const own = await ownTeam(userId, platform, leagueId);
  if (!own.ok) return own;
  if (!own.adapter.cancelPending) return { ok: false, error: "Cancelling isn't supported here yet." };
  return run(own.conn, async () => {
    await own.adapter.cancelPending!(own.conn, leagueId, own.teamId, transactionId);
    return { ok: true, message: "Cancelled." };
  }).then((r) =>
    !r.ok && r.stale ? { ...r, error: "That move was already declined, processed or closed. Showing the latest." } : r,
  );
}
