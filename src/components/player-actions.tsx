"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setWatchedAction } from "@/app/actions/watchlist";
import { safeAction } from "@/lib/safe-action";
import type { PlayerListing, RosterSlot } from "@/lib/schema";
import { AddPlayerSheet } from "./add-player-sheet";
import { Notice, type NoticeState } from "./sheet";

/** Add to team / trade for / watchlist buttons on the player page. */
export function PlayerActions({
  listing,
  mySlots,
  watched: initiallyWatched,
  tradeHref,
  platform,
  leagueId,
  platformName,
}: {
  listing: PlayerListing;
  mySlots: RosterSlot[] | null;
  watched: boolean;
  tradeHref?: string;
  platform: string;
  leagueId: string;
  platformName: string;
}) {
  const router = useRouter();
  const [watched, setWatched] = useState(initiallyWatched);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const p = listing.player;

  async function toggleWatch() {
    const next = !watched;
    setWatched(next);
    const res = await safeAction(() => setWatchedAction({ platform, playerId: p.externalId, watched: next }));
    if (!res.ok) setWatched(!next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {mySlots && (
          <button type="button" className="btn btn-primary" onClick={() => (setNotice(null), setAdding(true))}>
            {listing.status === "waivers" ? "Claim off Waivers" : "Add to Team"}
          </button>
        )}
        {tradeHref && (
          <Link href={tradeHref} className="btn btn-primary">
            Propose a Trade
          </Link>
        )}
        <button type="button" className="btn btn-secondary" aria-pressed={watched} onClick={toggleWatch}>
          <span className={watched ? "text-warning" : ""}>{watched ? "★" : "☆"}</span> {watched ? "Watching" : "Watch"}
        </button>
      </div>
      <Notice notice={notice} />
      {adding && mySlots && (
        <AddPlayerSheet
          target={p}
          waivers={listing.status === "waivers"}
          waiverClearsAt={listing.waiverClearsAt}
          mySlots={mySlots}
          platform={platform}
          leagueId={leagueId}
          platformName={platformName}
          onClose={(result) => {
            setAdding(false);
            if (result) {
              setNotice(result.notice);
              if (result.changed) router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
