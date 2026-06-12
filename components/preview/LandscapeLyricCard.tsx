"use client";

import { useEffect, useState } from "react";
import { CardFrame } from "@/components/preview/CardFrame";
import { LandscapeAlbumCover } from "@/components/preview/LandscapeAlbumCover";
import { LandscapeFooter } from "@/components/preview/LandscapeFooter";
import { LandscapeInstrumentalBlock } from "@/components/preview/LandscapeInstrumentalBlock";
import { LandscapeLyricsBlock } from "@/components/preview/LandscapeLyricsBlock";
import { LandscapeSongInfo } from "@/components/preview/LandscapeSongInfo";
import { PaletteBackground } from "@/components/preview/PaletteBackground";
import { getCardSize } from "@/lib/card-size";
import { fontClassName } from "@/lib/fonts";
import { proxiedImageUrl } from "@/lib/image-utils";
import { getLandscapeSlots } from "@/lib/landscape-layout";
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
  const slots = getLandscapeSlots(size.width, size.height, {
    showCover: style.showCover,
    allowTwoLineTitle: style.allowTwoLineTitle,
    showSongInfo: style.showSongInfo
  });
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
      style={{ width: size.width, height: size.height }}
      data-export-card="true"
    >
      <PaletteBackground palette={style.extractedPalette} />
      <div className="absolute inset-0 bg-black/12" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.13),transparent_38%,rgba(0,0,0,0.24))]" />

      <CardFrame layoutMode="landscape" enabled={style.frameStyleEnabled} variant={style.frameVariant}>
        {style.showCover ? (
          <LandscapeAlbumCover
            song={song}
            coverUrl={activeCover}
            cropScale={style.coverCropScale}
            left={slots.cover.left}
            top={slots.cover.top}
            size={slots.cover.size}
            onError={() => setCoverFailed(true)}
          />
        ) : null}

        {contentMode === "instrumental" ? (
          <LandscapeInstrumentalBlock
            song={song}
            instrumentalText={style.instrumentalText}
            textColor={textColor}
            left={slots.instrumental.left}
            top={slots.instrumental.top}
            width={slots.instrumental.width}
            isDarkText={isDarkText}
          />
        ) : (
          <>
            {style.showSongInfo ? (
              <LandscapeSongInfo
                song={song}
                textColor={textColor}
                left={slots.songInfo.left}
                top={slots.songInfo.top}
                width={slots.songInfo.width}
                allowTwoLineTitle={style.allowTwoLineTitle}
                isDarkText={isDarkText}
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
              left={slots.lyrics.left}
              top={slots.lyrics.top}
              width={slots.lyrics.width}
              maxHeight={slots.lyrics.maxHeight}
              cardWidth={size.width}
              cardHeight={size.height}
              isDarkText={isDarkText}
            />
          </>
        )}

        <LandscapeFooter
          width={size.width}
          height={size.height}
          showPlatformLogo={style.showPlatformBadge}
          platformSource={song.source}
          showGeneratedWatermark={showGeneratedWatermark}
          showSharedBy={style.showSharedBy}
          sharedByText={style.sharedByText}
          textColor={textColor}
        />
      </CardFrame>
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
