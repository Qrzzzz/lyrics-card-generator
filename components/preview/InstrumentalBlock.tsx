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
  allowMultiLineTitle,
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
  allowMultiLineTitle: boolean;
  availableWidth: number;
  availableHeight: number;
}) {
  const aspectRatio = getArtworkAspectRatio(coverUrl, coverArtwork);
  const isVerticalArtwork = aspectRatio < 1;
  const sideBySideGap = 52;
  const minimumSongInfoWidth = allowMultiLineTitle
    ? Math.min(480, Math.max(320, availableWidth * 0.42))
    : 248;
  const titleFontSize = isVerticalArtwork ? 52 : 64;
  const titleWidth = isVerticalArtwork
    ? minimumSongInfoWidth
    : Math.min(860, availableWidth);
  const titleLineCount = allowMultiLineTitle
    ? estimateWrappedTitleLines(song.title || "Untitled", titleWidth, titleFontSize)
    : 1;
  const titleHeight = titleLineCount * titleFontSize * 1.18;
  const artistHeight = 28 + 32 * 1.34;
  const albumHeight = showAlbumName && song.album?.trim() ? 20 + 24 * 1.34 : 0;
  const multiLineWrapSafety = allowMultiLineTitle ? titleFontSize * 1.6 : 0;
  const stackedSongInfoHeight = (allowMultiLineTitle ? 48 : 56) + titleHeight + artistHeight + albumHeight + multiLineWrapSafety;
  const baseSize = allowMultiLineTitle ? 500 : 568;
  const artworkSize = resolveAdaptiveArtworkSize({
    baseSize,
    aspectRatio,
    maxWidth: isVerticalArtwork
      ? Math.max(1, availableWidth - sideBySideGap - minimumSongInfoWidth)
      : availableWidth,
    maxHeight: isVerticalArtwork
      ? availableHeight
      : Math.max(1, availableHeight - stackedSongInfoHeight)
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
            : cn("w-full max-w-[860px] justify-items-center", allowMultiLineTitle ? "mt-12" : "mt-14")
        )}
        data-instrumental-song-info
      >
        <h2
          className={cn(
            "w-full font-black leading-[1.18] tracking-normal",
            isVerticalArtwork ? "text-[52px]" : "text-[64px]",
            allowMultiLineTitle ? "multi-line-title" : "truncate"
          )}
          data-allow-multi-line-title={allowMultiLineTitle ? "true" : "false"}
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

function estimateWrappedTitleLines(title: string, width: number, fontSize: number) {
  const textUnits = Array.from(title.trim()).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.34;
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Extended_Pictographic}/u.test(character)) {
      return total + 1;
    }
    if (/\p{Punctuation}/u.test(character)) return total + 0.45;
    // Heavy display fonts and word-boundary wrapping both consume more width
    // than a continuous average-glyph estimate. Reserve conservatively so the
    // fixed 1:1 instrumental canvas shrinks artwork before metadata can clip.
    return total + 0.76;
  }, 0);
  const estimatedTextWidth = Math.max(fontSize, textUnits * fontSize);
  return Math.max(1, Math.ceil(estimatedTextWidth / Math.max(1, width)));
}
