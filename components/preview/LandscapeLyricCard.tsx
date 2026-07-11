"use client";

import { useEffect, useState } from "react";
import { LandscapeAlbumCover } from "@/components/preview/LandscapeAlbumCover";
import { LandscapeFooter } from "@/components/preview/LandscapeFooter";
import { LandscapeInstrumentalBlock } from "@/components/preview/LandscapeInstrumentalBlock";
import { LandscapeLyricsBlock } from "@/components/preview/LandscapeLyricsBlock";
import { LandscapeSongInfo } from "@/components/preview/LandscapeSongInfo";
import { PaletteBackground } from "@/components/preview/PaletteBackground";
import { getCardSize } from "@/lib/card-size";
import { getLandscapeLayout } from "@/lib/card-layout-engine";
import { FIXED_COVER_CROP_SCALE } from "@/lib/card-style-normalize";
import { cardFontStyle, fontClassName } from "@/lib/fonts";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { CardStyle, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LandscapeLyricCard({
  song,
  lyrics,
  style
}: {
  song: SongInfo;
  lyrics: string;
  style: CardStyle;
}) {
  const size = getCardSize(style);
  const layout = getLandscapeLayout(size, style, song);
  const cover = song.proxiedCoverUrl || proxiedImageUrl(song.coverUrl);
  const [coverFailed, setCoverFailed] = useState(false);
  const activeCover = coverFailed ? "" : cover;
  const textColor = style.resolvedTextColor || "#FFFFFF";
  const isDarkText = isColorDark(textColor);
  const showGeneratedWatermark = style.showGeneratedWatermark ?? style.showWatermark;
  const contentMode = style.contentMode ?? "lyrics";

  useEffect(() => {
    setCoverFailed(false);
  }, [cover]);

  return (
    <article
      className={cn("relative isolate overflow-hidden bg-[#111216] text-white", fontClassName(style.font))}
      style={{ width: size.width, height: size.height, ...cardFontStyle(style) }}
      data-export-card="true"
    >
      <PaletteBackground
        palette={style.extractedPalette}
        showFineGrid={style.showFineGrid === true}
        fineGridDensity={style.fineGridDensity ?? "medium"}
      />
      <div className="absolute inset-0 bg-black/12" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.13),transparent_38%,rgba(0,0,0,0.24))]" />

      <div
        data-card-safe
        className="absolute"
        style={{
          left: layout.safeRect.x,
          top: layout.safeRect.y,
          width: layout.safeRect.width,
          height: layout.safeRect.height
        }}
      />
      <div data-card-content>
        {style.showCover && layout.coverRect ? (
          <LandscapeAlbumCover
            song={song}
            coverUrl={activeCover}
            cropScale={FIXED_COVER_CROP_SCALE}
            left={layout.coverRect.x}
            top={layout.coverRect.y}
            size={layout.coverRect.width}
            onError={() => setCoverFailed(true)}
          />
        ) : null}

        {contentMode === "instrumental" ? (
          <LandscapeInstrumentalBlock
            song={song}
            instrumentalText={style.instrumentalText}
            textColor={textColor}
            showAlbumName={style.showAlbumName}
            left={layout.contentRect.x}
            top={layout.contentRect.y + layout.contentRect.height * 0.22}
            width={layout.contentRect.width}
            isDarkText={isDarkText}
          />
        ) : (
          <>
            {style.showSongInfo && layout.songInfoRect ? (
              <LandscapeSongInfo
                song={song}
                textColor={textColor}
                left={layout.songInfoRect.x}
                top={layout.songInfoRect.y}
                width={layout.songInfoRect.width}
                allowTwoLineTitle={style.allowTwoLineTitle}
                isDarkText={isDarkText}
                showAlbumName={style.showAlbumName}
              />
            ) : null}
            <LandscapeLyricsBlock
              lyrics={lyrics}
              translationText={style.translationText}
              translationEnabled={style.translationEnabled}
              lyricFontSize={style.lyricFontSize}
              translationScale={style.translationScale}
              lineHeight={style.lineHeight}
              textColor={textColor}
              left={layout.lyricsRect.x}
              top={layout.lyricsRect.y}
              width={layout.lyricsRect.width}
              maxHeight={layout.lyricsRect.height}
              cardWidth={size.width}
              cardHeight={size.height}
              align={style.align}
              isDarkText={isDarkText}
            />
          </>
        )}

        <LandscapeFooter
          rect={layout.footerRect}
          showPlatformLogo={style.showPlatformBadge}
          platformSource={song.source}
          showGeneratedWatermark={showGeneratedWatermark}
          showSharedBy={style.showSharedBy}
          sharedByText={style.sharedByText}
          textColor={textColor}
        />
      </div>
    </article>
  );
}

function isColorDark(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return false;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance < 0.42;
}
