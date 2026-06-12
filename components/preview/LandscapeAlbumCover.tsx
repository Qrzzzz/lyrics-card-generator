"use client";

import type { SyntheticEvent } from "react";
import type { SongInfo } from "@/lib/types";

export function LandscapeAlbumCover({
  song,
  coverUrl,
  cropScale,
  left,
  top,
  size,
  onError
}: {
  song: SongInfo;
  coverUrl?: string;
  cropScale: number;
  left: number;
  top: number;
  size: number;
  onError: () => void;
}) {
  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const image = event.currentTarget;
    console.debug("[Lyric Glass Card] LandscapeAlbumCover debug", {
      originalCoverUrl: song.originalCoverUrl,
      normalizedCoverUrl: song.coverUrl,
      proxiedCoverUrl: song.proxiedCoverUrl,
      displayedCoverUrl: coverUrl,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight
    });
  }

  return (
    <div
      className="absolute z-10 overflow-hidden rounded-[28px] bg-black/10 shadow-[0_34px_90px_rgba(0,0,0,0.30)]"
      style={{
        left,
        top,
        width: size,
        height: size
      }}
    >
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          crossOrigin="anonymous"
          onLoad={onLoad}
          onError={onError}
          className="h-full w-full object-cover"
          style={{ transform: `scale(${cropScale})` }}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-black/10" />
      )}
    </div>
  );
}
