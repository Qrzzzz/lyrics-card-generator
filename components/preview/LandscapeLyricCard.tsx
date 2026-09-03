"use client";

import { useEffect, useState } from "react";
import { AdaptiveAlbumArtwork } from "@/components/preview/AdaptiveAlbumArtwork";
import { LandscapeAccessories } from "@/components/preview/LandscapeAccessories";
import { LandscapeLyricsContent } from "@/components/preview/LandscapeLyricsContent";
import { LandscapeSongMetadata } from "@/components/preview/LandscapeSongMetadata";
import { PaletteBackground } from "@/components/preview/PaletteBackground";
import {
  CARD_ARTWORK_BOX_SHADOW,
  CARD_ARTWORK_DROP_SHADOW,
  resolveCardContentTextShadow
} from "@/lib/card-content-depth";
import { getCardSize } from "@/lib/card-size";
import { cardFontStyle, fontClassName } from "@/lib/fonts";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { LyricDocumentV2 } from "@/lib/lyrics-document-v2";
import type { CardStyle, CoverArtworkAnalysis, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LandscapeLyricCard({
  song,
  lyricDocument,
  style,
  coverArtwork
}: {
  song: SongInfo;
  lyricDocument: LyricDocumentV2;
  style: CardStyle;
  coverArtwork?: CoverArtworkAnalysis;
}) {
  const size = getCardSize(style);
  const plan = style.landscapePlan;
  const cover = song.proxiedCoverUrl || proxiedImageUrl(song.coverUrl);
  const [coverFailed, setCoverFailed] = useState(false);
  const activeCover = coverFailed ? "" : cover;
  const textColor = style.resolvedTextColor || "#FFFFFF";
  const showGeneratedWatermark = style.showGeneratedWatermark ?? style.showWatermark;

  useEffect(() => setCoverFailed(false), [cover]);

  return (
    <article
      className={cn("relative isolate overflow-hidden bg-[#111216] text-white", fontClassName(style.font))}
      style={{ width: size.width, height: size.height, ...cardFontStyle(style) }}
      data-export-card="true"
      data-landscape-plan={plan ? "ready" : "measuring"}
      data-landscape-measurement-key={plan?.measurementKey}
    >
      <PaletteBackground
        palette={style.extractedPalette}
        width={size.width}
        height={size.height}
        showFineGrid={style.showFineGrid === true}
        fineGridDensity={style.fineGridDensity ?? "medium"}
      />
      {plan ? (
        <>
          <div
            data-card-safe
            className="absolute"
            style={{
              left: plan.safeRect.x,
              top: plan.safeRect.y,
              width: plan.safeRect.width,
              height: plan.safeRect.height
            }}
          />
          <div
            data-card-content
            className="absolute inset-0"
            style={{ textShadow: resolveCardContentTextShadow(textColor) }}
          >
            <AdaptiveAlbumArtwork
              sourceUrl={activeCover}
              analysis={coverArtwork}
              resolvedSize={{ width: plan.coverRect.width, height: plan.coverRect.height }}
              borderRadius={28 * plan.leftScale}
              className="absolute z-10"
              style={{ left: plan.coverRect.x, top: plan.coverRect.y }}
              dropShadow={CARD_ARTWORK_DROP_SHADOW}
              boxShadow={CARD_ARTWORK_BOX_SHADOW}
              onError={() => setCoverFailed(true)}
              placeholderClassName="bg-black/10"
              testId="landscape-album-artwork"
            />

            <div
              data-card-header
              className="absolute z-10"
              style={{
                left: plan.metadataRect.x,
                top: plan.metadataRect.y,
                width: plan.metadataRect.width,
                minHeight: plan.metadataRect.height
              }}
            >
              <LandscapeSongMetadata
                song={song}
                textColor={textColor}
                showAlbumName={style.showAlbumName}
                scale={plan.leftScale}
              />
            </div>

            {plan.accessoriesRect ? (
              <div
                data-card-accessories
                className="absolute z-20"
                style={{
                  left: plan.accessoriesRect.x,
                  top: plan.accessoriesRect.y,
                  width: plan.accessoriesRect.width,
                  minHeight: plan.accessoriesRect.height
                }}
              >
                <LandscapeAccessories
                  source={song.source}
                  showPlatformBadge={style.showPlatformBadge}
                  showSharedBy={style.showSharedBy}
                  sharedByText={style.sharedByText}
                  showGeneratedWatermark={showGeneratedWatermark}
                  textColor={textColor}
                  scale={plan.leftScale}
                />
              </div>
            ) : null}

            <div
              data-card-lyrics
              className="absolute z-10"
              style={{
                left: plan.lyricsRect.x,
                top: plan.lyricsRect.y,
                width: plan.lyricsRect.width,
                minHeight: plan.lyricsRect.height
              }}
            >
              <LandscapeLyricsContent
                lyricDocument={lyricDocument}
                translationEnabled={style.translationEnabled}
                lyricFontSize={style.lyricFontSize}
                translationScale={style.translationScale}
                lineHeight={style.lineHeight}
                textColor={textColor}
                align={style.align}
              />
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}
