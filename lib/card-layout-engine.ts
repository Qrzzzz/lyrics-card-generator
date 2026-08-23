import { getArtworkAspectRatio, resolveAdaptiveArtworkSize } from "@/lib/artwork-geometry";
import type { CardStyle, CoverArtworkAnalysis, SongInfo, SongSource } from "@/lib/types";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardSize = {
  width: number;
  height: number;
};

export type PortraitLayout = {
  safeRect: Rect;
  headerRect?: Rect;
  coverRect?: Rect;
  lyricsRect: Rect;
  footerRect?: Rect;
};

type LayoutSongContext = SongSource | Pick<SongInfo, "source" | "album">;
export type LayoutArtworkContext = {
  sourceUrl?: string;
  analysis?: CoverArtworkAnalysis;
};

/** Computes bounded portrait regions while reserving only currently visible chrome. */
export function getPortraitLayout(
  size: CardSize,
  style: CardStyle,
  songContext: LayoutSongContext = "unknown",
  artworkContext: LayoutArtworkContext = {}
): PortraitLayout {
  const source = getLayoutSource(songContext);
  const hasAlbumName = hasVisibleAlbumName(style, songContext);
  const outerPadding = clamp(Math.round(size.width * 0.042), 28, 54);
  const innerPadding = clamp(Math.round(size.width * 0.02), 14, 26);
  const safeRect = insetRect(
    {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height
    },
    outerPadding + innerPadding
  );
  const contentMode = style.contentMode ?? "lyrics";
  const hasHeader = contentMode === "lyrics" && (style.showCover || style.showSongInfo);
  const hasFooter = hasVisibleFooter(style, source);
  const headerScale = style.showSongInfo && hasAlbumName ? 0.205 : 0.16;
  const baseHeaderHeight = hasHeader ? clamp(Math.round(size.width * headerScale), 130, hasAlbumName ? 284 : 214) : 0;
  const footerHeight = hasFooter ? clamp(Math.round(size.width * 0.08), 74, 126) : 0;
  const headerGap = hasHeader ? clamp(Math.round(size.height * 0.03), 26, 52) : 0;
  const footerGap = hasFooter ? clamp(Math.round(size.height * 0.018), 18, 34) : 0;
  const coverGap = 40;
  const innerHorizontalPadding = 36;
  const minimumSongInfoWidth = Math.min(360, Math.max(248, safeRect.width * 0.3));
  const maximumCoverWidth = style.showSongInfo
    ? Math.max(196, safeRect.width - innerHorizontalPadding - coverGap - minimumSongInfoWidth)
    : Math.max(196, safeRect.width - innerHorizontalPadding);
  const maximumCoverHeight = Math.max(
    196,
    safeRect.height - headerGap - footerHeight - footerGap - 160
  );
  const coverSize = style.showCover && contentMode === "lyrics"
    ? resolveAdaptiveArtworkSize({
        baseSize: 196,
        aspectRatio: getArtworkAspectRatio(artworkContext.sourceUrl, artworkContext.analysis),
        maxWidth: maximumCoverWidth,
        maxHeight: maximumCoverHeight
      })
    : undefined;
  const headerHeight = hasHeader
    ? Math.max(baseHeaderHeight, coverSize?.height ?? 0)
    : 0;
  const lyricsY = safeRect.y + headerHeight + headerGap;
  const lyricsHeight = Math.max(160, safeRect.height - headerHeight - headerGap - footerHeight - footerGap);
  const lyricsWidth = clamp(Math.round(safeRect.width * 0.96), Math.min(520, safeRect.width), safeRect.width);
  const lyricsX = style.align === "center" ? safeRect.x + (safeRect.width - lyricsWidth) / 2 : safeRect.x;

  return {
    safeRect,
    headerRect: hasHeader
      ? {
          x: safeRect.x,
          y: safeRect.y,
          width: safeRect.width,
          height: headerHeight
        }
      : undefined,
    coverRect: coverSize
      ? {
          x: safeRect.x,
          y: safeRect.y,
          width: coverSize.width,
          height: coverSize.height
        }
      : undefined,
    lyricsRect: {
      x: lyricsX,
      y: lyricsY,
      width: lyricsWidth,
      height: lyricsHeight
    },
    footerRect: hasFooter
      ? {
          x: safeRect.x,
          y: safeRect.y + safeRect.height - footerHeight,
          width: safeRect.width,
          height: footerHeight
        }
      : undefined
  };
}

function hasVisibleFooter(style: CardStyle, source: SongSource) {
  return Boolean(
    (style.showPlatformBadge && source !== "unknown") ||
      (style.showSharedBy && style.sharedByText.trim()) ||
      (style.showGeneratedWatermark ?? style.showWatermark)
  );
}

function getLayoutSource(songContext: LayoutSongContext) {
  return typeof songContext === "string" ? songContext : songContext.source;
}

function hasVisibleAlbumName(style: CardStyle, songContext: LayoutSongContext) {
  return typeof songContext !== "string" && Boolean(style.showAlbumName && songContext.album?.trim());
}

function insetRect(rect: Rect, inset: number): Rect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(1, rect.width - inset * 2),
    height: Math.max(1, rect.height - inset * 2)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
