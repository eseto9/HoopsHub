import type { Platform } from "@/lib/schema";
import { IconTile } from "./list";

const LABEL: Record<Platform, string> = { espn: "ESPN", yahoo: "Yahoo", sleeper: "Sleeper" };
const COLOR: Record<Platform, string> = { espn: "var(--espn)", yahoo: "var(--yahoo)", sleeper: "var(--sleeper)" };
const GLYPH: Record<Platform, string> = { espn: "E", yahoo: "Y!", sleeper: "S" };

/** Settings-style icon tile for a platform. */
export function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <IconTile color={COLOR[platform]}>
      <span className="text-[13px] font-extrabold italic tracking-tight" aria-label={LABEL[platform]}>
        {GLYPH[platform]}
      </span>
    </IconTile>
  );
}

export function platformLabel(platform: Platform) {
  return LABEL[platform];
}
