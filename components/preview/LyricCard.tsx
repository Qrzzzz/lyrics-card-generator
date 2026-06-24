"use client";

import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { InstrumentalBlock } from "@/components/preview/InstrumentalBlock";
import { LandscapeLyricCard } from "@/components/preview/LandscapeLyricCard";
import { LyricsBlock } from "@/components/preview/LyricsBlock";
import { PaletteBackground } from "@/components/preview/PaletteBackground";
import { PortraitFooter } from "@/components/preview/PortraitFooter";
import { getCardSize as resolveCardSize } from "@/lib/card-size";
import { getPortraitLayout } from "@/lib/card-layout-engine";
import { cardFontStyle, fontClassName } from "@/lib/fonts";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { CardStyle, Locale, SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function getCardSize(style: CardStyle) {
  return resolveCardSize(style);
}

export function LyricCard({
  song,
  lyrics,
  style,
  locale = "en"
}: {
  song: SongInfo;
  lyrics: string;
  style: CardStyle;
  locale?: Locale;
}) {
  if ((style.layoutMode ?? "portrait") === "landscape") {
    return <LandscapeLyricCard song={song} lyrics={lyrics} style={style} />;
  }

  const size = getCardSize(style);
  const cover = song.proxiedCoverUrl || proxiedImageUrl(song.coverUrl);
  const [coverFailed, setCoverFailed] = useState(false);
  const activeCover = coverFailed ? "" : cover;
  const textColor = style.resolvedTextColor || "#FFFFFF";
  const isDarkText = isColorDark(textColor);
  const contentMode = style.contentMode ?? "lyrics";
  const showGeneratedWatermark = style.showGeneratedWatermark ?? style.showWatermark;
  const frameEnabled = style.frameStyleEnabled && style.frameVariant !== "fullBleed";
  const layout = getPortraitLayout(size, style, song.source);
  const glassBackground = frameEnabled
    ? isDarkText
      ? "rgba(255,255,255,0.32)"
      : "rgba(255,255,255,0.105)"
    : "transparent";
  const frameShadow = frameEnabled
    ? "inset 0 1px 0 rgba(255,255,255,0.22), 0 36px 120px rgba(0,0,0,0.42)"
    : "none";

  useEffect(() => {
    setCoverFailed(false);
  }, [cover]);

  return (
    <article
      className={cn("relative isolate overflow-hidden bg-[#111216] text-white", fontClassName(style.font))}
      style={{ width: size.width, height: size.height, ...cardFontStyle(style) }}
      data-export-card="true"
    >
      <PaletteBackground palette={style.extractedPalette} showFineGrid={style.showFineGrid !== false} />
      <div className="absolute inset-0 bg-black/14" />
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.14),transparent_42%,rgba(0,0,0,0.22))]" />

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
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden",
            frameEnabled
              ? "rounded-[48px] border border-white/18 p-[42px] backdrop-blur-[34px]"
              : "rounded-none border border-transparent bg-transparent p-[18px] backdrop-blur-0"
          )}
          style={{
            background: frameEnabled ? glassBackground : "transparent",
            boxShadow: frameEnabled ? frameShadow : "none"
          }}
        >
          {frameEnabled ? <div className="absolute inset-x-0 top-0 h-px bg-white/35" /> : null}

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
                  cropScale={style.coverCropScale}
                  onError={() => setCoverFailed(true)}
                />
              ) : null}
              {style.showSongInfo ? (
                <div className="min-w-0 py-3">
                  <h1
                    className={cn(
                      "text-[51px] font-black leading-[1.48] tracking-normal",
                      style.allowTwoLineTitle ? "two-line-title" : "truncate"
                    )}
                    style={{ color: textColor }}
                  >
                    {song.title || "Untitled"}
                  </h1>
                  <p
                    className="mt-4 truncate text-[35px] font-semibold leading-[1.5]"
                    style={{ color: withAlpha(textColor, 0.64) }}
                  >
                    {song.artist || "Unknown artist"}
                  </p>
                </div>
              ) : null}
            </header>
          ) : null}

          <main
            data-card-lyrics-viewport
            className={cn(
              "flex min-h-0 flex-1 items-center",
              contentMode === "instrumental" ? "justify-center py-0" : "py-10",
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
                cropScale={style.coverCropScale}
                onCoverError={() => setCoverFailed(true)}
                textColor={textColor}
                isDarkText={isDarkText}
              />
            ) : (
              <LyricsBlock
                lyrics={lyrics}
                translationText={style.translationText}
                translationEnabled={style.translationEnabled}
                lyricFontSize={style.lyricFontSize}
                translationScale={style.translationScale}
                lineHeight={style.lineHeight}
                textColor={textColor}
                align={style.align}
                isDarkText={isDarkText}
              />
            )}
          </main>

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
  cropScale,
  onError
}: {
  coverUrl?: string;
  originalCoverUrl?: string;
  normalizedCoverUrl?: string;
  proxiedCoverUrl?: string;
  cropScale: number;
  onError: () => void;
}) {
  const className = "relative h-[174px] w-[174px] shrink-0 overflow-hidden rounded-[39px] bg-black/10";

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
      containerClassName: className
    });
  }

  return (
    <div className={className}>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          crossOrigin="anonymous"
          onLoad={onLoad}
          onError={onError}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: `scale(${cropScale})` }}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-black/10" />
      )}
    </div>
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
