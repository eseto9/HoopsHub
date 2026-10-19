import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getAdapter } from "@/lib/adapters/registry";
import type { AdapterConnection } from "@/lib/adapters/types";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db/client";
import type { Connection, Platform } from "@/lib/schema";

const { connection, leaguePreference } = schema;

type ConnectionRow = typeof connection.$inferSelect;

/** Client-safe projection. Never includes credentials. */
function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform,
    externalUserId: row.externalUserId,
    displayName: row.displayName,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  };
}

export async function listConnections(userId: string): Promise<Connection[]> {
  const rows = await getDb().select().from(connection).where(eq(connection.userId, userId));
  return rows.map(toConnection);
}

/** Server-only: connections with decrypted credentials, for adapters. */
export async function getAdapterConnections(userId: string): Promise<(AdapterConnection & { status: Connection["status"] })[]> {
  const rows = await getDb().select().from(connection).where(eq(connection.userId, userId));
  return rows.map((row) => {
    let credentials: Record<string, string> | null = null;
    if (row.encryptedCredentials) {
      try {
        credentials = decryptJson(row.encryptedCredentials);
      } catch {
        // Key rotated or data corrupted: treat as needing reconnect.
        credentials = null;
      }
    }
    return {
      id: row.id,
      userId: row.userId,
      platform: row.platform,
      externalUserId: row.externalUserId,
      credentials,
      status: row.encryptedCredentials && !credentials ? "needs_reconnect" : row.status,
    };
  });
}

/**
 * Validate credentials with the platform, then create or refresh the
 * connection. Reconnecting the same account updates it in place.
 */
export async function connectPlatform(userId: string, platform: Platform, input: Record<string, string>): Promise<Connection> {
  const result = await getAdapter(platform).connect(userId, input);
  const encrypted = result.credentials ? encryptJson(result.credentials) : null;
  const now = new Date();
  const [row] = await getDb()
    .insert(connection)
    .values({
      id: crypto.randomUUID(),
      userId,
      platform,
      externalUserId: result.externalUserId,
      displayName: result.displayName,
      status: "active",
      encryptedCredentials: encrypted,
      lastSyncedAt: now,
    })
    .onConflictDoUpdate({
      target: [connection.userId, connection.platform, connection.externalUserId],
      set: { displayName: result.displayName, status: "active", encryptedCredentials: encrypted, lastSyncedAt: now, updatedAt: now },
    })
    .returning();
  return toConnection(row);
}

export async function markNeedsReconnect(connectionId: string) {
  await getDb()
    .update(connection)
    .set({ status: "needs_reconnect", updatedAt: new Date() })
    .where(eq(connection.id, connectionId));
}

export async function markSynced(connectionId: string) {
  await getDb().update(connection).set({ lastSyncedAt: new Date() }).where(eq(connection.id, connectionId));
}

export async function deleteConnection(userId: string, connectionId: string) {
  await getDb().delete(connection).where(and(eq(connection.id, connectionId), eq(connection.userId, userId)));
}

// ---------------------------------------------------------------------------
// League preferences (public leagues added by id, hidden leagues, picked team)
// ---------------------------------------------------------------------------

export async function listLeaguePreferences(userId: string) {
  return getDb().select().from(leaguePreference).where(eq(leaguePreference.userId, userId));
}

export async function addPublicLeague(userId: string, platform: Platform, externalLeagueId: string, myTeamExternalId: string) {
  await getDb()
    .insert(leaguePreference)
    .values({ id: crypto.randomUUID(), userId, platform, externalLeagueId, myTeamExternalId, hidden: false })
    .onConflictDoUpdate({
      target: [leaguePreference.userId, leaguePreference.platform, leaguePreference.externalLeagueId],
      set: { myTeamExternalId, hidden: false },
    });
}

export async function removePublicLeague(userId: string, platform: Platform, externalLeagueId: string) {
  await getDb()
    .delete(leaguePreference)
    .where(
      and(
        eq(leaguePreference.userId, userId),
        eq(leaguePreference.platform, platform),
        eq(leaguePreference.externalLeagueId, externalLeagueId),
        isNull(leaguePreference.connectionId),
      ),
    );
}
