"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-fetches server data on an interval while the tab is visible (for live scores). */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
        setUpdatedAt(new Date());
      }
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <p className="px-5 text-[13px] text-muted" aria-live="polite">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger align-middle" />
      Live · updates every {seconds}s
      {updatedAt && <> · last {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>}
    </p>
  );
}
