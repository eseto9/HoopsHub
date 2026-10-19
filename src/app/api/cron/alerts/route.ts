import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAlertsForUser } from "@/lib/services/leagues";
import { pushConfigured, usersWithSubscriptions } from "@/lib/services/push";

/** Called every 30 minutes by netlify/functions/alerts-cron.mts with the shared CRON_SECRET. */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "push not configured" }, { status: 503 });

  const users = await usersWithSubscriptions();
  let sent = 0;
  let failed = 0;
  for (const userId of users) {
    try {
      sent += await runAlertsForUser(userId);
    } catch {
      // One user's broken connection never stops everyone else's alerts.
      failed++;
    }
  }
  return NextResponse.json({ users: users.length, sent, failed });
}
