"use client";

import type { SongSource } from "@/lib/types";

const PLATFORM_BADGES: Partial<Record<SongSource, { label: string; className: string }>> = {
  apple: {
    label: "AM",
    className: "bg-gradient-to-br from-rose-400 to-pink-600 text-white"
  },
  qq: {
    label: "QQ",
    className: "bg-gradient-to-br from-amber-300 to-emerald-500 text-black"
  },
  netease: {
    label: "NE",
    className: "bg-gradient-to-br from-red-500 to-rose-700 text-white"
  }
};

export function PlatformBadge({
  source,
  size = "normal"
}: {
  source: SongSource;
  size?: "normal" | "large";
}) {
  const badge = PLATFORM_BADGES[source];

  if (!badge) {
    return null;
  }

  const dimension = size === "large" ? "h-[52px] w-[52px] text-[18px]" : "h-16 w-16 text-[20px]";

  return (
    <div className="flex items-center justify-center">
      <span
        aria-label={`${source} platform badge`}
        className={`${dimension} inline-flex shrink-0 items-center justify-center rounded-[18px] font-black tracking-normal opacity-95 shadow-[0_14px_34px_rgba(0,0,0,0.28)] ${badge.className}`}
        data-platform-badge={source}
      >
        {badge.label}
      </span>
    </div>
  );
}
