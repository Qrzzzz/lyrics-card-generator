"use client";

import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { AdaptiveAlbumArtwork } from "@/components/preview/AdaptiveAlbumArtwork";
import { InstrumentalBlock } from "@/components/preview/InstrumentalBlock";
import { LandscapeLyricCard } from "@/components/preview/LandscapeLyricCard";
import { LyricsBlock } from "@/components/preview/LyricsBlock";
import { PaletteBackground } from "@/components/preview/PaletteBackground";
import { PortraitFooter } from "@/components/preview/PortraitFooter";
import { ExplicitBadge } from "@/components/preview/ExplicitBadge";
import {
  CARD_ARTWORK_BOX_SHADOW,
  CARD_ARTWORK_DROP_SHADOW,
  resolveCardContentTextShadow
} from "@/lib/card-content-depth";
import { getCardSize as resolveCardSize } from "@/lib/card-size";
import { getPortraitLayout } from "@/lib/card-layout-engine";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { cardFontStyle, fontClassName } from "@/lib/fonts";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { LyricDocumentV2 } from "@/lib/lyrics-document-v2";
import type { CardStyle, CoverArtworkAnalysis, Locale, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function getCardSize(style: CardStyle) {
  return resolveCardSize(style);
}

export function LyricCard({
  song,
  lyricDocument,
  style: rawStyle,
  coverArtwork
}: {
  song: SongInfo;
  lyricDocument: LyricDocumentV2;
  style: CardStyle;
  coverArtwork?: CoverArtworkAnalysis;
  locale?: Locale;
}) {
  // Normalization gives portrait and landscape renderers one stable compatibility contract.
  const style = normalizeCardStyle(rawStyle, { preserveDerivedLandscapePlan: true });
  const cover = song.proxiedCoverUrl || proxiedImageUrl(song.coverUrl);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    // A new URL gets its own load attempt even if the previous cover failed.
    setCoverFailed(false);
  }, [cover]);

  if ((style.layoutMode ?? "portrait") === "landscape") {
    return <LandscapeLyricCard song={song} lyricDocument={lyricDocument} style={style} coverArtwork={coverArtwork} />;
  }

  const size = getCardSize(style);
  const activeCover = coverFailed ? "" : cover;
  const textColor = style.resolvedTextColor || "#FFFFFF";
  const contentMode = style.contentMode ?? "lyrics";
  const showGeneratedWatermark = style.showGeneratedWatermark ?? style.showWatermark;
  const layout = getPortraitLayout(size, style, song, {
    sourceUrl: activeCover,
    analysis: coverArtwork
  });

  // Measurement and export-readiness hooks treat the card data attributes as a DOM contract.
  return (
    <article
      className={cn("relative isolate overflow-hidden bg-[#111216] text-white", fontClassName(style.font))}
      style={{ width: size.width, height: size.height, ...cardFontStyle(style) }}
      data-export-card="true"
    >
      <PaletteBackground
        palette={style.extractedPalette}
        width={size.width}
        height={size.height}
        showFineGrid={style.showFineGrid === true}
        fineGridDensity={style.fineGridDensity ?? "medium"}
      />
      <div
        data-card-safe
        className="absolute"
        style={{
          left: layout.safeRect.x,
          top: layout.safeRect.y,
          width: layout.safeRect.width,
          height: layout.safeRect.height
        }}
      >
        <div
          data-card-content
          className="relative flex h-full w-full flex-col overflow-hidden rounded-none border border-transparent bg-transparent px-[18px] pt-[18px] pb-[8px] backdrop-blur-0"
          style={{ textShadow: resolveCardContentTextShadow(textColor) }}
        >
          {(style.showCover || style.showSongInfo) && contentMode !== "instrumental" && layout.headerRect ? (
            <header
              data-card-header
              className="flex shrink-0 items-center gap-10"
              style={{ minHeight: layout.headerRect.height }}
            >
              {style.showCover ? (
                <AlbumCover
                  coverUrl={activeCover}
                  originalCoverUrl={song.originalCoverUrl}
                  normalizedCoverUrl={song.coverUrl}
                  proxiedCoverUrl={song.proxiedCoverUrl}
                  analysis={coverArtwork}
                  width={layout.coverRect?.width ?? 196}
                  height={layout.coverRect?.height ?? 196}
                  onError={() => setCoverFailed(true)}
                />
              ) : null}
              {style.showSongInfo ? (
                <div className="flex min-h-[196px] min-w-0 flex-col justify-center py-0">
                  <h1
                    className={cn(
                      "text-[51px] font-black leading-[1.48] tracking-normal",
                      style.allowMultiLineTitle ? "multi-line-title" : "truncate"
                    )}
                    style={{ color: textColor }}
                    data-allow-multi-line-title={style.allowMultiLineTitle ? "true" : "false"}
                  >
                    {style.allowMultiLineTitle ? (
                      <>
                        <span>{song.title || "Untitled"}</span>{" "}
                        <ExplicitBadge show={song.explicit} textColor={textColor} />
                      </>
                    ) : (
                      <span className="inline-flex max-w-full min-w-0 items-center gap-[0.22em] align-middle">
                        <span className="min-w-0 truncate">{song.title || "Untitled"}</span>
                        <ExplicitBadge show={song.explicit} textColor={textColor} />
                      </span>
                    )}
                  </h1>
                  <p
                    className="mt-4 truncate text-[35px] font-semibold leading-[1.5]"
                    style={{ color: withAlpha(textColor, 0.64) }}
                  >
                    {song.artist || "Unknown artist"}
                  </p>
                  {style.showAlbumName && song.album ? (
                    <p
                      className="mt-3 truncate text-[27px] font-medium leading-[1.42]"
                      style={{ color: withAlpha(textColor, 0.48) }}
                    >
                      {song.album}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </header>
          ) : null}

          <div
            data-card-lyrics-viewport
            className={cn(
              "flex min-h-0 flex-1 items-center",
              contentMode === "instrumental" ? "justify-center py-0" : "pt-8 pb-4",
              contentMode === "lyrics" ? "overflow-hidden" : "justify-center"
            )}
            style={{
              width: layout.lyricsRect.width,
              marginLeft: style.align === "center" ? "auto" : 0,
              marginRight: style.align === "center" ? "auto" : undefined
            }}
          >
            {contentMode === "instrumental" ? (
              <InstrumentalBlock
                song={song}
                coverUrl={activeCover}
                coverArtwork={coverArtwork}
                onCoverError={() => setCoverFailed(true)}
                textColor={textColor}
                showAlbumName={style.showAlbumName}
                allowMultiLineTitle={style.allowMultiLineTitle}
                availableWidth={layout.lyricsRect.width}
                availableHeight={layout.lyricsRect.height}
              />
            ) : (
              <LyricsBlock
                lyricDocument={lyricDocument}
                translationEnabled={style.translationEnabled}
                lyricFontSize={style.lyricFontSize}
                translationScale={style.translationScale}
                lineHeight={style.lineHeight}
                textColor={textColor}
                align={style.align}
                autoWidth={style.autoWidth === true}
              />
            )}
          </div>

          <div data-card-footer>
            <PortraitFooter
              showPlatformLogo={style.showPlatformBadge}
              platformSource={song.source}
              showGeneratedWatermark={showGeneratedWatermark}
              showSharedBy={style.showSharedBy}
              sharedByText={style.sharedByText}
              textColor={textColor}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function AlbumCover({
  coverUrl,
  originalCoverUrl,
  normalizedCoverUrl,
  proxiedCoverUrl,
  analysis,
  width,
  height,
  onError
}: {
  coverUrl?: string;
  originalCoverUrl?: string;
  normalizedCoverUrl?: string;
  proxiedCoverUrl?: string;
  analysis?: CoverArtworkAnalysis;
  width: number;
  height: number;
  onError: () => void;
}) {
  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const image = event.currentTarget;
    console.debug("[Lyric Card Generator] AlbumCover debug", {
      originalCoverUrl,
      normalizedCoverUrl,
      proxiedCoverUrl,
      displayedCoverUrl: coverUrl,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: width,
      renderedHeight: height
    });
  }

  return (
    <AdaptiveAlbumArtwork
      sourceUrl={coverUrl}
      analysis={analysis}
      resolvedSize={{ width, height }}
      borderRadius={44}
      dropShadow={CARD_ARTWORK_DROP_SHADOW}
      boxShadow={CARD_ARTWORK_BOX_SHADOW}
      onLoad={onLoad}
      onError={onError}
      placeholderClassName="bg-black/10"
      testId="portrait-album-artwork"
    />
  );
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return hex;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
