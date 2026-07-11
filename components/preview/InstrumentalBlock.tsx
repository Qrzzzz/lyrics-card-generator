"use client";

import type { SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InstrumentalBlock({
  song,
  coverUrl,
  cropScale,
  onCoverError,
  textColor,
  isDarkText,
  showAlbumName,
  allowTwoLineTitle
}: {
  song: SongInfo;
  coverUrl?: string;
  cropScale: number;
  onCoverError: () => void;
  textColor: string;
  isDarkText: boolean;
  showAlbumName: boolean;
  allowTwoLineTitle: boolean;
}) {
  return (
    <div
      className="flex w-full flex-col items-center justify-center text-center"
      style={{
        color: textColor,
        textShadow: isDarkText ? "none" : "0 12px 34px rgba(0,0,0,0.34)"
      }}
    >
      <div
        className={cn(
          "relative aspect-square shrink-0 overflow-hidden rounded-[48px] bg-black/12 shadow-[0_34px_90px_rgba(0,0,0,0.30)]",
          allowTwoLineTitle ? "w-[500px] max-w-[74%]" : "w-[568px] max-w-[82%]"
        )}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            crossOrigin="anonymous"
            onError={onCoverError}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: `scale(${cropScale})` }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-white/8" />
        )}
      </div>

      <div
        className={cn("grid w-full max-w-[860px] justify-items-center", allowTwoLineTitle ? "mt-12" : "mt-14")}
        data-instrumental-song-info
      >
        <h2
          className={cn(
            "w-full text-[64px] font-black leading-[1.18] tracking-normal",
            allowTwoLineTitle ? "two-line-title" : "truncate"
          )}
          data-allow-two-line-title={allowTwoLineTitle ? "true" : "false"}
        >
          {song.title || "Untitled"}
        </h2>
        <p className="mt-7 w-full truncate text-[32px] font-semibold leading-[1.34] opacity-[0.72]">
          {song.artist || "Unknown artist"}
        </p>
        {showAlbumName && song.album?.trim() ? (
          <p className="mt-5 w-full truncate text-[24px] font-medium leading-[1.34] opacity-[0.54]" data-instrumental-album>
            {song.album.trim()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
