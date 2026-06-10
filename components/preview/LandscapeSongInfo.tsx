"use client";

import type { SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { withAlpha } from "@/lib/palette-background";

export function LandscapeSongInfo({
  song,
  textColor,
  left,
  top,
  width,
  allowTwoLineTitle,
  isDarkText
}: {
  song: SongInfo;
  textColor: string;
  left: number;
  top: number;
  width: number;
  allowTwoLineTitle: boolean;
  isDarkText: boolean;
}) {
  return (
    <header
      className="absolute z-10"
      data-landscape-song-info="true"
      style={{
        left,
        top,
        width,
        color: textColor,
        textShadow: isDarkText ? "none" : "0 10px 32px rgba(0,0,0,0.34)"
      }}
    >
      <h1
        className={cn(
          "text-[42px] font-black leading-[1.18] tracking-normal",
          allowTwoLineTitle ? "two-line-title" : "truncate"
        )}
      >
        {song.title || "Untitled"}
      </h1>
      <p className="mt-4 truncate text-[26px] font-semibold leading-[1.22]" style={{ color: withAlpha(textColor, 0.72) }}>
        {song.artist || "Unknown artist"}
      </p>
      {song.album ? (
        <p className="mt-3 truncate text-[20px] font-medium leading-[1.2]" style={{ color: withAlpha(textColor, 0.5) }}>
          {song.album}
        </p>
      ) : null}
    </header>
  );
}
