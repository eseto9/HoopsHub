"use client";

import { useEffect, useState, useTransition } from "react";
import { getAlertPrefsAction, saveAlertPrefsAction, sendTestAlertAction, subscribePushAction, unsubscribePushAction } from "@/app/actions/alerts";
import type { AlertPrefs } from "@/lib/alerts";
import { safeAction } from "@/lib/safe-action";
import { Group } from "./list";
import { Notice, type NoticeState } from "./sheet";

type Support = "checking" | "ok" | "ios-install" | "unsupported" | "blocked";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const TYPES: { key: keyof AlertPrefs; label: string; detail: string }[] = [
  { key: "tradeOffers", label: "Trade offers", detail: "When someone sends you an offer" },
  { key: "results", label: "Results", detail: "Claims and trades that go through, plus a Monday recap" },
  { key: "lineup", label: "Lineup reminders", detail: "Before tip-off, if a starter is out or sitting with no game" },
];

/** Turn push alerts on for this device and choose which ones. */
export function AlertsSettings({ publicKey }: { publicKey: string | null }) {
  const [support, setSupport] = useState<Support>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: Support = "ok";
      let ep: string | null = null;
      if (!publicKey) next = "unsupported";
      else if (!supported) next = isIos() && !isStandalone() ? "ios-install" : "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        ep = (await reg?.pushManager.getSubscription())?.endpoint ?? null;
      }
      const p = await safeAction(() => getAlertPrefsAction()).catch(() => null);
      if (cancelled) return;
      setSupport(next);
      setEndpoint(ep);
      if (p && "tradeOffers" in p) setPrefs(p as AlertPrefs);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  function enable() {
    setNotice(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setSupport(permission === "denied" ? "blocked" : "ok");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const res = await safeAction(() => subscribePushAction({ endpoint: json.endpoint, keys: json.keys }));
        if (!res.ok) throw new Error("error" in res && res.error ? res.error : "Couldn't save this device.");
        setEndpoint(json.endpoint);
        setNotice({ kind: "ok", text: "Alerts are on for this device." });
      } catch (err) {
        setNotice({ kind: "error", text: err instanceof Error ? err.message : "Couldn't turn alerts on." });
      }
    });
  }

  function disable() {
    setNotice(null);
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await safeAction(() => unsubscribePushAction(sub.endpoint));
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setNotice({ kind: "ok", text: "Alerts are off for this device." });
    });
  }

  function test() {
    setNotice(null);
    start(async () => {
      const res = await safeAction(() => sendTestAlertAction());
      setNotice(res.ok ? { kind: "ok", text: "Test alert sent. It should appear in a few seconds." } : { kind: "error", text: "error" in res && res.error ? res.error : "Couldn't send." });
    });
  }

  function toggle(key: keyof AlertPrefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    start(async () => {
      const res = await safeAction(() => saveAlertPrefsAction(next));
      if (!res.ok) setPrefs(prefs);
    });
  }

  return (
    <section id="alerts" className="flex scroll-mt-20 flex-col gap-4">
      <div className="px-1">
        <h2 className="text-[22px] font-bold">Alerts</h2>
        <p className="mt-1 text-[15px] text-muted">Notifications on this device for trade offers, results and lineup problems, checked every 30 minutes.</p>
      </div>
      <Notice notice={notice} />

      {support === "ios-install" && (
        <Group header="First, add Hoops Hub to your Home Screen" footer="iPhone only allows notifications for sites added to the Home Screen.">
          {["Tap the Share button in Safari", "Choose “Add to Home Screen”", "Open Hoops Hub from the new icon and come back here"].map((step, i) => (
            <div key={i} className="row-block">
              <div className="row-body gap-3 text-[15px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white">{i + 1}</span>
                {step}
              </div>
            </div>
          ))}
        </Group>
      )}
      {support === "unsupported" && (
        <p className="px-1 text-[15px] text-muted">{publicKey ? "This browser doesn't support notifications." : "Alerts aren't set up on this server yet."}</p>
      )}
      {support === "blocked" && (
        <p className="px-1 text-[15px] text-warning">Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.</p>
      )}

      {support === "ok" &&
        (endpoint ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={test} disabled={busy}>
              Send a Test Alert
            </button>
            <button type="button" className="btn btn-plain px-3 text-danger" onClick={disable} disabled={busy}>
              Turn Off on This Device
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary self-start" onClick={enable} disabled={busy}>
            {busy ? "Turning On…" : "Turn On Alerts"}
          </button>
        ))}

      {prefs && (
        <Group header="Send me" footer="These choices apply to every device you've turned alerts on for.">
          {TYPES.map((t) => (
            <label key={t.key} className="row-block cursor-pointer">
              <span className="row-body justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-[15px]">{t.label}</span>
                  <span className="block text-[13px] text-muted">{t.detail}</span>
                </span>
                <input type="checkbox" role="switch" checked={prefs[t.key]} onChange={() => toggle(t.key)} className="switch" aria-label={t.label} />
              </span>
            </label>
          ))}
        </Group>
      )}
    </section>
  );
}
