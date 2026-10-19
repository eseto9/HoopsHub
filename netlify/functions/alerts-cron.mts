/**
 * Netlify scheduled function: every 30 minutes, ask the site to send any new
 * push alerts (trade offers, results, lineup reminders). The work happens in
 * src/app/api/cron/alerts, protected by CRON_SECRET.
 */
export default async function alertsCron() {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("missing URL or CRON_SECRET", { status: 500 });
  const res = await fetch(`${base}/api/cron/alerts`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  return new Response(await res.text(), { status: res.status });
}

export const config = { schedule: "*/30 * * * *" };
