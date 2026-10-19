"use server";

import { headers } from "next/headers";
import type { AlertPrefs } from "@/lib/alerts";
import { deleteSubscription, getAlertPrefs, saveAlertPrefs, saveSubscription, sendToUser, type BrowserSubscription } from "@/lib/services/push";
import { requireUser } from "@/lib/session";

const isUrl = (s: unknown) => typeof s === "string" && /^https:\/\/[^\s]{10,1000}$/.test(s);
const isKey = (s: unknown) => typeof s === "string" && /^[A-Za-z0-9_-]{10,200}=*$/.test(s);

export async function subscribePushAction(sub: BrowserSubscription): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!isUrl(sub?.endpoint) || !isKey(sub?.keys?.p256dh) || !isKey(sub?.keys?.auth)) return { ok: false, error: "That browser subscription looks invalid." };
  await saveSubscription(user.id, sub, (await headers()).get("user-agent") ?? undefined);
  return { ok: true };
}

export async function unsubscribePushAction(endpoint: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (isUrl(endpoint)) await deleteSubscription(user.id, endpoint);
  return { ok: true };
}

export async function saveAlertPrefsAction(prefs: AlertPrefs): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await saveAlertPrefs(user.id, { tradeOffers: !!prefs.tradeOffers, results: !!prefs.results, lineup: !!prefs.lineup });
  return { ok: true };
}

export async function getAlertPrefsAction(): Promise<AlertPrefs> {
  const user = await requireUser();
  return getAlertPrefs(user.id);
}

export async function sendTestAlertAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    const n = await sendToUser(user.id, { title: "Hoops Hub", body: "Alerts are on. You'll hear about trade offers, results and lineup problems.", url: "/my-teams?view=lineup", tag: "test" });
    return n ? { ok: true } : { ok: false, error: "No device got it. Try turning alerts off and on again." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't send." };
  }
}
