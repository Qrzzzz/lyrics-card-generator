"use client";

import type { SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { withAlpha } from "@/lib/palette-background";
import { ExplicitBadge } from "@/components/preview/ExplicitBadge";

export function LandscapeSongInfo({
  song,
  textColor,
  left,
  top,
  width,
  allowTwoLineTitle,
  isDarkText,
  showAlbumName,
  showExplicitBadge
}: {
  song: SongInfo;
  textColor: string;
  left: number;
  top: number;
  width: number;
  allowTwoLineTitle: boolean;
  isDarkText: boolean;
  showAlbumName: boolean;
  showExplicitBadge: boolean;
}) {
  return (
    <header
      className="absolute z-10"
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
          "text-[63px] font-black leading-[1.42] tracking-normal",
          allowTwoLineTitle ? "two-line-title" : "truncate"
        )}
      >
        <span className="inline-flex max-w-full min-w-0 items-baseline gap-[0.24em] align-baseline">
          <span className={allowTwoLineTitle ? "min-w-0" : "min-w-0 truncate"}>{song.title || "Untitled"}</span>
          <ExplicitBadge show={song.explicit && showExplicitBadge} textColor={textColor} />
        </span>
      </h1>
      <p className="mt-6 truncate text-[39px] font-semibold leading-[1.45]" style={{ color: withAlpha(textColor, 0.72) }}>
        {song.artist || "Unknown artist"}
      </p>
      {showAlbumName && song.album ? (
        <p className="mt-5 truncate text-[30px] font-medium leading-[1.42]" style={{ color: withAlpha(textColor, 0.5) }}>
          {song.album}
        </p>
      ) : null}
    </header>
  );
}
