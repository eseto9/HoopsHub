import "server-only";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import type { AlertPrefs, PushMessage } from "@/lib/alerts";
import { getDb, schema } from "@/lib/db/client";

const { pushSubscription, alertSettings, alertSent } = schema;

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let configured = false;
function setup() {
  if (configured) return;
  if (!pushConfigured()) throw new Error("Push notifications aren't set up on this server");
  const subject = process.env.VAPID_SUBJECT!;
  webpush.setVapidDetails(subject.startsWith("mailto:") || subject.startsWith("https:") ? subject : `mailto:${subject}`, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(userId: string, sub: BrowserSubscription, userAgent?: string) {
  await getDb()
    .insert(pushSubscription)
    .values({ id: crypto.randomUUID(), userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

export async function deleteSubscription(userId: string, endpoint: string) {
  await getDb().delete(pushSubscription).where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
}

export async function countSubscriptions(userId: string): Promise<number> {
  return (await getDb().select({ id: pushSubscription.id }).from(pushSubscription).where(eq(pushSubscription.userId, userId))).length;
}

export async function usersWithSubscriptions(): Promise<string[]> {
  const rows = await getDb().selectDistinct({ userId: pushSubscription.userId }).from(pushSubscription);
  return rows.map((r) => r.userId);
}

export async function getAlertPrefs(userId: string): Promise<AlertPrefs> {
  const [row] = await getDb().select().from(alertSettings).where(eq(alertSettings.userId, userId));
  return { tradeOffers: row?.tradeOffers ?? true, results: row?.results ?? true, lineup: row?.lineup ?? true };
}

export async function saveAlertPrefs(userId: string, prefs: AlertPrefs) {
  await getDb()
    .insert(alertSettings)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: alertSettings.userId, set: { ...prefs, updatedAt: new Date() } });
}

/** Claim an alert key; false if it was already sent. */
export async function claimAlert(userId: string, key: string): Promise<boolean> {
  const rows = await getDb().insert(alertSent).values({ userId, key }).onConflictDoNothing().returning({ key: alertSent.key });
  return rows.length > 0;
}

/** Send to every device the user turned alerts on for. Devices that unsubscribed are removed. */
export async function sendToUser(userId: string, msg: Omit<PushMessage, "key">): Promise<number> {
  setup();
  const subs = await getDb().select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600 });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await getDb().delete(pushSubscription).where(eq(pushSubscription.id, s.id));
      }
    }),
  );
  return sent;
}
