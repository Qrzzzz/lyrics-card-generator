"use client";

import type { SongSource } from "@/lib/types";
const PLATFORM_ICONS: Partial<Record<SongSource, string>> = {
  apple: "/platform-icons/apple-music.svg",
  qq: "/platform-icons/qq-music.svg",
  netease: "/platform-icons/netease-music.svg",
  spotify: "/platform-icons/spotify.svg"
};

export function PlatformBadge({
  source,
  size = "normal"
}: {
  source: SongSource;
  size?: "normal" | "large";
}) {
  const icon = PLATFORM_ICONS[source];

  if (!icon) {
    return null;
  }

  return (
    <div className="flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={icon}
        alt=""
        className={size === "large" ? "h-[52px] w-[52px] shrink-0 object-contain opacity-90 drop-shadow-md" : "h-16 w-16 shrink-0 scale-110 object-contain opacity-95 drop-shadow-md"}
        draggable={false}
      />
    </div>
  );
}
