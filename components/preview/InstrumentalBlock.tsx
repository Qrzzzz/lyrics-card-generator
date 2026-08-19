"use client";

import { AdaptiveAlbumArtwork } from "@/components/preview/AdaptiveAlbumArtwork";
import { getArtworkAspectRatio, resolveAdaptiveArtworkSize } from "@/lib/artwork-geometry";
import type { CoverArtworkAnalysis, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InstrumentalBlock({
  song,
  coverUrl,
  coverArtwork,
  onCoverError,
  textColor,
  isDarkText,
  showAlbumName,
  allowTwoLineTitle,
  availableWidth,
  availableHeight
}: {
  song: SongInfo;
  coverUrl?: string;
  coverArtwork?: CoverArtworkAnalysis;
  onCoverError: () => void;
  textColor: string;
  isDarkText: boolean;
  showAlbumName: boolean;
  allowTwoLineTitle: boolean;
  availableWidth: number;
  availableHeight: number;
}) {
  const baseSize = allowTwoLineTitle ? 500 : 568;
  const aspectRatio = getArtworkAspectRatio(coverUrl, coverArtwork);
  const isVerticalArtwork = aspectRatio < 1;
  const sideBySideGap = 52;
  const minimumSongInfoWidth = 248;
  const songInfoHeight = showAlbumName ? 230 : 188;
  const artworkSize = resolveAdaptiveArtworkSize({
    baseSize,
    aspectRatio,
    maxWidth: isVerticalArtwork
      ? Math.max(1, availableWidth - sideBySideGap - minimumSongInfoWidth)
      : availableWidth,
    maxHeight: isVerticalArtwork
      ? availableHeight
      : Math.max(baseSize, availableHeight - songInfoHeight)
  });

  return (
    <div
      className={cn(
        "flex w-full items-center justify-center",
        isVerticalArtwork ? "flex-row gap-[52px] text-left" : "flex-col text-center"
      )}
      data-instrumental-artwork-layout={isVerticalArtwork ? "side-by-side" : "stacked"}
      style={{
        color: textColor,
        textShadow: isDarkText ? "none" : "0 12px 34px rgba(0,0,0,0.34)"
      }}
    >
      <AdaptiveAlbumArtwork
        sourceUrl={coverUrl}
        analysis={coverArtwork}
        resolvedSize={artworkSize}
        borderRadius={48}
        dropShadow="drop-shadow(0 34px 45px rgba(0,0,0,0.30))"
        boxShadow="0 34px 90px rgba(0,0,0,0.30)"
        onError={onCoverError}
        placeholderClassName="bg-white/8"
        testId="instrumental-album-artwork"
      />

      <div
        className={cn(
          "grid min-w-0",
          isVerticalArtwork
            ? "flex-1 justify-items-start"
            : cn("w-full max-w-[860px] justify-items-center", allowTwoLineTitle ? "mt-12" : "mt-14")
        )}
        data-instrumental-song-info
      >
        <h2
          className={cn(
            "w-full font-black leading-[1.18] tracking-normal",
            isVerticalArtwork ? "text-[52px]" : "text-[64px]",
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
