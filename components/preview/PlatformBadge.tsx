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
  size = "normal",
  scale = 1
}: {
  source: SongSource;
  size?: "normal" | "large";
  scale?: number;
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
        className="shrink-0 object-contain opacity-90"
        style={{
          width: (size === "large" ? 52 : 64) * scale,
          height: (size === "large" ? 52 : 64) * scale,
          transform: size === "large" ? undefined : "scale(1.1)"
        }}
        draggable={false}
      />
    </div>
  );
}
