"use client";

import { useState } from "react";

/** Round player headshot; falls back to initials when there's no photo. */
export function PlayerAvatar({ src, name, size = "md" }: { src?: string; name: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-semibold text-muted ${
        size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[12px]"
      }`}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- ESPN CDN, already resized server-side
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full scale-[1.35] object-cover object-[50%_20%]"
        />
      ) : (
        initials
      )}
    </span>
  );
}
