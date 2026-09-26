"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AdaptiveAlbumArtwork } from "@/components/preview/AdaptiveAlbumArtwork";
import { CardFooter } from "@/components/preview/CardFooter";
import { getArtworkAspectRatio, resolveAdaptiveArtworkSize } from "@/lib/artwork-geometry";
import { CARD_ARTWORK_BOX_SHADOW, CARD_ARTWORK_DROP_SHADOW } from "@/lib/card-content-depth";
import type { CoverArtworkAnalysis, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InstrumentalBlock({
  song,
  coverUrl,
  coverArtwork,
  onCoverError,
  textColor,
  showAlbumName,
  allowMultiLineTitle,
  availableWidth,
  availableHeight,
  showGeneratedWatermark,
  showSharedBy,
  sharedByText
}: {
  song: SongInfo;
  coverUrl?: string;
  coverArtwork?: CoverArtworkAnalysis;
  onCoverError: () => void;
  textColor: string;
  showAlbumName: boolean;
  allowMultiLineTitle: boolean;
  availableWidth: number;
  availableHeight: number;
  showGeneratedWatermark: boolean;
  showSharedBy: boolean;
  sharedByText: string;
}) {
  const songInfoRef = useRef<HTMLDivElement>(null);
  const [measuredInfoHeight, setMeasuredInfoHeight] = useState<number | null>(null);
  const aspectRatio = getArtworkAspectRatio(coverUrl, coverArtwork);
  const titleFontSize = 64;
  const titleWidth = Math.min(860, availableWidth);
  const titleLineCount = allowMultiLineTitle
    ? estimateWrappedTitleLines(song.title || "Untitled", titleWidth, titleFontSize)
    : 1;
  const titleHeight = titleLineCount * titleFontSize * 1.18;
  const artistHeight = 28 + 32 * 1.34;
  const albumHeight = showAlbumName && song.album?.trim() ? 20 + 24 * 1.34 : 0;
  const multiLineWrapSafety = allowMultiLineTitle ? titleFontSize * 1.6 : 0;
  const sharedBy = showSharedBy ? sharedByText.trim() : "";
  const hasCredits = showGeneratedWatermark || Boolean(sharedBy);
  const artworkInfoGap = allowMultiLineTitle ? 48 : 56;
  const estimatedCreditsHeight = hasCredits
    ? 32 + (sharedBy ? 23 * 1.4 : 0) + (showGeneratedWatermark ? 19 * 1.4 : 0) +
      (sharedBy && showGeneratedWatermark ? 10 : 0)
    : 0;
  const estimatedInfoHeight = titleHeight + artistHeight + albumHeight + multiLineWrapSafety +
    estimatedCreditsHeight;
  const stackedSongInfoHeight = artworkInfoGap + (measuredInfoHeight ?? estimatedInfoHeight);
  const baseSize = allowMultiLineTitle ? 500 : 568;

  useLayoutEffect(() => {
    const node = songInfoRef.current;
    if (!node) return;
    const minimumArtworkHeight = Math.min(240, availableHeight * 0.26);
    const infoBudget = availableHeight - artworkInfoGap - minimumArtworkHeight;
    const measure = () => {
      // Fit at the natural size first so shortening text restores the title.
      // Offset dimensions stay in card pixels even in the scaled preview.
      let fittedSize = titleFontSize;
      node.style.setProperty("--instrumental-title-size", `${fittedSize}px`);
      while (allowMultiLineTitle && node.offsetHeight > infoBudget && fittedSize > 40) {
        fittedSize -= 2;
        node.style.setProperty("--instrumental-title-size", `${fittedSize}px`);
      }
      setMeasuredInfoHeight(node.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [song.title, song.artist, song.album, showAlbumName, allowMultiLineTitle,
    availableWidth, availableHeight, showGeneratedWatermark, showSharedBy,
    sharedByText, artworkInfoGap, titleFontSize]);

  const artworkSize = resolveAdaptiveArtworkSize({
    baseSize,
    aspectRatio,
    maxWidth: availableWidth,
    maxHeight: Math.max(1, availableHeight - stackedSongInfoHeight)
  });

  return (
    <div
      className="flex w-full flex-col items-center justify-center text-center"
      data-instrumental-artwork-layout="stacked"
      style={{ color: textColor }}
    >
      <AdaptiveAlbumArtwork
        sourceUrl={coverUrl}
        analysis={coverArtwork}
        resolvedSize={artworkSize}
        borderRadius={48}
        dropShadow={CARD_ARTWORK_DROP_SHADOW}
        boxShadow={CARD_ARTWORK_BOX_SHADOW}
        onError={onCoverError}
        placeholderClassName="bg-white/8"
        testId="instrumental-album-artwork"
      />

      <div
        ref={songInfoRef}
        className={cn(
          "grid w-full min-w-0 max-w-[860px] justify-items-center",
          allowMultiLineTitle ? "mt-12" : "mt-14"
        )}
        data-instrumental-song-info
      >
        <h2
          className={cn(
            "w-full font-black leading-[1.18] tracking-normal",
            "text-[64px]",
            allowMultiLineTitle ? "multi-line-title" : "truncate"
          )}
          data-allow-multi-line-title={allowMultiLineTitle ? "true" : "false"}
          style={{ fontSize: `var(--instrumental-title-size, ${titleFontSize}px)` }}
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
        {hasCredits ? (
          <div data-card-footer className="mt-8 w-full min-w-0">
            <CardFooter
              showGeneratedWatermark={showGeneratedWatermark}
              showSharedBy={showSharedBy}
              sharedByText={sharedByText}
              textColor={textColor}
              instrumentalAlign="center"
            />
          </div>
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
