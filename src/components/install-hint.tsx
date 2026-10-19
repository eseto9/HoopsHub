"use client";

import { useSyncExternalStore } from "react";

const KEY = "hh_install_hint_dismissed";
const noop = () => () => {};

/** iPhone Safari never offers to install a site, so say how, once (until dismissed). */
function shouldShow(): boolean {
  try {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return ios && !standalone && localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

export function InstallHint() {
  const show = useSyncExternalStore(noop, shouldShow, () => false);
  if (!show) return null;
  return (
    <div className="flex items-start gap-3 rounded-[14px] bg-surface px-4 py-3 text-[15px]">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Get the app:</span> tap Share, then &ldquo;Add to Home Screen&rdquo;. Hoops Hub opens full-screen and can send you alerts.
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 text-[17px] text-muted"
        onClick={(e) => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
          (e.currentTarget.parentElement as HTMLElement).remove();
        }}
      >
        ✕
      </button>
    </div>
  );
}
