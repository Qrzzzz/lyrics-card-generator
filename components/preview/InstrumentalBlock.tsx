"use client";

import type { SongInfo } from "@/lib/types";

export function InstrumentalBlock({
  song,
  coverUrl,
  cropScale,
  onCoverError,
  textColor,
  isDarkText,
  showAlbumName
}: {
  song: SongInfo;
  coverUrl?: string;
  cropScale: number;
  onCoverError: () => void;
  textColor: string;
  isDarkText: boolean;
  showAlbumName: boolean;
}) {
  return (
    <div
      className="flex w-full flex-col items-center justify-center text-center"
      style={{
        color: textColor,
        textShadow: isDarkText ? "none" : "0 12px 34px rgba(0,0,0,0.34)"
      }}
    >
      <div className="relative aspect-square w-[620px] max-w-[84%] shrink-0 overflow-hidden rounded-[48px] bg-black/12 shadow-[0_34px_90px_rgba(0,0,0,0.30)]">
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

      <h2 className="mt-12 max-w-full text-[64px] font-black leading-[1.12] tracking-normal">
        {song.title || "Untitled"}
      </h2>
      <p className="mt-5 max-w-full text-[32px] font-semibold leading-[1.2] opacity-[0.72]">
        {song.artist || "Unknown artist"}
      </p>
      {showAlbumName && song.album ? (
        <p className="mt-4 max-w-full text-[24px] font-medium leading-[1.2] opacity-[0.54]">
          {song.album}
        </p>
      ) : null}
    </div>
  );
}
