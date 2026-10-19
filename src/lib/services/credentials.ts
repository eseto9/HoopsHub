import "server-only";
import { eq } from "drizzle-orm";
import { encryptJson } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db/client";

/** Re-encrypt and store refreshed credentials (e.g. a new Yahoo access token). */
export async function saveCredentials(connectionId: string, credentials: Record<string, string>) {
  await getDb()
    .update(schema.connection)
    .set({ encryptedCredentials: encryptJson(credentials), status: "active", updatedAt: new Date() })
    .where(eq(schema.connection.id, connectionId));
}
