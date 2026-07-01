import { getCardSize } from "@/lib/card-size";
import { LANDSCAPE_FRAME_INSET, PORTRAIT_FRAME_INSET } from "@/lib/frame-layout";
import type { CardStyle, SongSource } from "@/lib/types";

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
  lyricsRect: Rect;
  footerRect?: Rect;
};

export type LandscapeLayout = {
  safeRect: Rect;
  coverRect?: Rect;
  contentRect: Rect;
  songInfoRect?: Rect;
  lyricsRect: Rect;
  footerRect?: Rect;
};

export function getPortraitLayout(size: CardSize, style: CardStyle, source: SongSource = "unknown"): PortraitLayout {
  const frameEnabled = isFrameEnabled(style);
  const outerPadding = frameEnabled ? PORTRAIT_FRAME_INSET : clamp(Math.round(size.width * 0.042), 28, 54);
  const innerPadding = frameEnabled ? clamp(Math.round(size.width * 0.052), 36, 62) : clamp(Math.round(size.width * 0.02), 14, 26);
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
  const headerScale = style.showSongInfo && style.showAlbumName ? 0.205 : 0.16;
  const headerHeight = hasHeader ? clamp(Math.round(size.width * headerScale), 130, style.showAlbumName ? 284 : 214) : 0;
  const footerHeight = hasFooter ? clamp(Math.round(size.width * 0.08), 74, 126) : 0;
  const headerGap = hasHeader ? clamp(Math.round(size.height * 0.03), 26, 52) : 0;
  const footerGap = hasFooter ? clamp(Math.round(size.height * 0.018), 18, 34) : 0;
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

export function getLandscapeLayout(size: CardSize, style: CardStyle, source: SongSource = "unknown"): LandscapeLayout {
  const frameEnabled = isFrameEnabled(style);
  const frameInset = frameEnabled ? LANDSCAPE_FRAME_INSET : 0;
  const shortSide = Math.min(size.width, size.height);
  const horizontalPadding = clamp(Math.round(size.width * 0.055), 72, 168) + frameInset;
  const verticalPadding = clamp(Math.round(shortSide * 0.07), 48, 108) + frameInset;
  const safeRect = {
    x: horizontalPadding,
    y: verticalPadding,
    width: Math.max(1, size.width - horizontalPadding * 2),
    height: Math.max(1, size.height - verticalPadding * 2)
  };
  const contentMode = style.contentMode ?? "lyrics";
  const hasFooter = hasVisibleFooter(style, source);
  const footerHeight = hasFooter ? clamp(Math.round(safeRect.height * 0.11), 74, 124) : 0;
  const footerGap = hasFooter ? clamp(Math.round(safeRect.height * 0.035), 24, 48) : 0;
  const usableBottom = safeRect.y + safeRect.height - footerHeight - footerGap;
  const gap = clamp(Math.round(safeRect.width * 0.035), 42, 88);
  const showCover = style.showCover && contentMode === "lyrics";
  const maxCoverByHeight = safeRect.height * (size.width / size.height < 1.55 ? 0.6 : 0.74);
  const maxCoverByWidth = safeRect.width * 0.42;
  const coverSize = showCover ? clamp(Math.round(Math.min(maxCoverByHeight, maxCoverByWidth)), 260, 760) : 0;
  const coverRect = showCover
    ? {
        x: safeRect.x,
        y: safeRect.y + Math.max(0, (usableBottom - safeRect.y - coverSize) / 2),
        width: coverSize,
        height: coverSize
      }
    : undefined;
  const rawContentX = coverRect ? coverRect.x + coverRect.width + gap : safeRect.x;
  const rawContentWidth = coverRect ? safeRect.x + safeRect.width - rawContentX : safeRect.width;
  const maxContentWidth = showCover ? clamp(Math.round(size.width * 0.48), 680, 1060) : clamp(Math.round(size.width * 0.58), 780, 1180);
  const contentWidth = Math.min(rawContentWidth, maxContentWidth);
  const contentX = coverRect ? rawContentX : safeRect.x + (safeRect.width - contentWidth) / 2;
  const showSongInfo = style.showSongInfo && contentMode === "lyrics";
  const songInfoScale = style.allowTwoLineTitle || style.showAlbumName ? 0.25 : 0.2;
  const songInfoHeight = showSongInfo ? clamp(Math.round(safeRect.height * songInfoScale), 130, style.showAlbumName ? 290 : 252) : 0;
  const songInfoGap = showSongInfo ? clamp(Math.round(safeRect.height * 0.035), 24, 50) : 0;
  const lyricsY = safeRect.y + songInfoHeight + songInfoGap;
  const lyricsHeight = Math.max(170, usableBottom - lyricsY);

  return {
    safeRect,
    coverRect,
    contentRect: {
      x: contentX,
      y: safeRect.y,
      width: contentWidth,
      height: usableBottom - safeRect.y
    },
    songInfoRect: showSongInfo
      ? {
          x: contentX,
          y: safeRect.y,
          width: contentWidth,
          height: songInfoHeight
        }
      : undefined,
    lyricsRect: {
      x: contentX,
      y: lyricsY,
      width: contentWidth,
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

export function getCurrentCardLayout(style: CardStyle, source: SongSource = "unknown") {
  const size = getCardSize(style);
  return (style.layoutMode ?? "portrait") === "landscape"
    ? getLandscapeLayout(size, style, source)
    : getPortraitLayout(size, style, source);
}

function hasVisibleFooter(style: CardStyle, source: SongSource) {
  return Boolean(
    (style.showPlatformBadge && source !== "unknown") ||
      (style.showSharedBy && style.sharedByText.trim()) ||
      (style.showGeneratedWatermark ?? style.showWatermark)
  );
}

function isFrameEnabled(style: CardStyle) {
  return Boolean(style.frameStyleEnabled && style.frameVariant !== "fullBleed");
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
