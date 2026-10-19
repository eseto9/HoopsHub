"use client";

import { useState } from "react";

/** Team logo, falling back to an initial when the platform's image can't load (e.g. ESPN custom uploads). */
export function TeamAvatar({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- league logos come from arbitrary hosts
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-[30px] w-[30px] shrink-0 rounded-full bg-surface-2 object-cover"
      />
    );
  }
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a5a5ab] to-[#86868c] text-[13px] font-semibold text-white">
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
