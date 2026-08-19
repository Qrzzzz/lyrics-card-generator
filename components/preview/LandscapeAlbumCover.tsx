"use client";

import type { SyntheticEvent } from "react";
import { AdaptiveAlbumArtwork } from "@/components/preview/AdaptiveAlbumArtwork";
import type { CoverArtworkAnalysis, SongInfo } from "@/lib/types";

export function LandscapeAlbumCover({
  song,
  coverUrl,
  analysis,
  left,
  top,
  width,
  height,
  onError
}: {
  song: SongInfo;
  coverUrl?: string;
  analysis?: CoverArtworkAnalysis;
  left: number;
  top: number;
  width: number;
  height: number;
  onError: () => void;
}) {
  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const image = event.currentTarget;
    console.debug("[Lyric Card Generator] LandscapeAlbumCover debug", {
      originalCoverUrl: song.originalCoverUrl,
      normalizedCoverUrl: song.coverUrl,
      proxiedCoverUrl: song.proxiedCoverUrl,
      displayedCoverUrl: coverUrl,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight
    });
  }

  return (
    <AdaptiveAlbumArtwork
      sourceUrl={coverUrl}
      analysis={analysis}
      resolvedSize={{ width, height }}
      borderRadius={28}
      className="absolute z-10"
      style={{ left, top }}
      dropShadow="drop-shadow(0 34px 45px rgba(0,0,0,0.30))"
      boxShadow="0 34px 90px rgba(0,0,0,0.30)"
      onLoad={onLoad}
      onError={onError}
      placeholderClassName="bg-black/10"
      testId="landscape-album-artwork"
    />
  );
}
