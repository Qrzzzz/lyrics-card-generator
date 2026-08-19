"use client";

import { AUTO_HEIGHT_MAX, AUTO_HEIGHT_MIN, getCardSize } from "@/lib/card-size";
import { getPortraitLayout } from "@/lib/card-layout-engine";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { AppState } from "@/lib/types";

export const AUTO_HEIGHT_SETTLE_TOLERANCE = 2;

export function isPortraitCustomAutoHeight(state: AppState) {
  return (
    (state.style.layoutMode ?? "portrait") === "portrait" &&
    state.style.ratio === "custom" &&
    state.style.autoHeight
  );
}

/** Guards auto-height writes against measurements from superseded content. */
export function autoCanvasHeightMeasurementSignature(state: AppState) {
  return JSON.stringify({
    lyrics: state.lyrics,
    locale: state.locale,
    song: {
      album: state.song.album,
      artist: state.song.artist,
      explicit: state.song.explicit,
      coverUrl: state.song.coverUrl,
      proxiedCoverUrl: state.song.proxiedCoverUrl,
      source: state.song.source,
      title: state.song.title
    },
    coverArtwork: state.coverArtwork,
    translationEnabled: state.translationEnabled,
    translationText: state.translationText,
    style: {
      align: state.style.align,
      allowTwoLineTitle: state.style.allowTwoLineTitle,
      autoHeight: state.style.autoHeight,
      contentMode: state.style.contentMode,
      customFontEnabled: state.style.customFontEnabled,
      customFontFamily: state.style.customFontFamily,
      customFontWeight: state.style.customFontWeight,
      customFontStyle: state.style.customFontStyle,
      font: state.style.font,
      fontScheme: state.style.fontScheme,
      height: state.style.height,
      layoutMode: state.style.layoutMode,
      lineHeight: state.style.lineHeight,
      lyricFontSize: state.style.lyricFontSize,
      ratio: state.style.ratio,
      sharedByText: state.style.sharedByText,
      showCover: state.style.showCover,
      showGeneratedWatermark: state.style.showGeneratedWatermark,
      showAlbumName: state.style.showAlbumName,
      showPlatformBadge: state.style.showPlatformBadge,
      showSharedBy: state.style.showSharedBy,
      showSongInfo: state.style.showSongInfo,
      translationEnabled: state.style.translationEnabled,
      translationScale: state.style.translationScale,
      translationText: state.style.translationText,
      width: state.style.width
    }
  });
}

export function findExportCard(container: HTMLElement | null) {
  if (!container) {
    return null;
  }

  return container.matches("[data-export-card]")
    ? container
    : container.querySelector<HTMLElement>("[data-export-card]");
}

export function measureAutoCanvasHeight(
  currentState: AppState,
  container: HTMLElement | null
) {
  if (!isPortraitCustomAutoHeight(currentState)) {
    return null;
  }

  const root = findExportCard(container);
  const content = root?.querySelector<HTMLElement>("[data-card-content]");
  const lyrics = root?.querySelector<HTMLElement>("[data-card-lyrics]");
  if (!root || !content || !lyrics) {
    return null;
  }

  const size = getCardSize(currentState.style);
  const coverSourceUrl = currentState.song.proxiedCoverUrl || proxiedImageUrl(currentState.song.coverUrl);
  const layout = getPortraitLayout(size, currentState.style, currentState.song, {
    sourceUrl: coverSourceUrl,
    analysis: currentState.coverArtwork
  });
  const contentStyle = window.getComputedStyle(content);
  const viewport = root.querySelector<HTMLElement>("[data-card-lyrics-viewport]");
  const viewportStyle = viewport ? window.getComputedStyle(viewport) : null;
  const header = root.querySelector<HTMLElement>("[data-card-header]");
  const footer = root.querySelector<HTMLElement>("[data-card-footer]");
  const contentPadding =
    toPixels(contentStyle.paddingTop) +
    toPixels(contentStyle.paddingBottom);
  const viewportPadding = viewportStyle
    ? toPixels(viewportStyle.paddingTop) + toPixels(viewportStyle.paddingBottom)
    : 0;
  const headerHeight = header?.scrollHeight ?? 0;
  const footerHeight = footer?.scrollHeight ?? 0;
  const lyricsHeight = lyrics.scrollHeight;
  const headerGap = headerHeight > 0 ? Math.max(24, Math.round(size.height * 0.022)) : 0;
  const footerGap = footerHeight > 0 ? Math.max(18, Math.round(size.height * 0.014)) : 0;
  // Reconstruct the safe content height, then add the layout engine's non-content chrome.
  const requiredSafeHeight =
    contentPadding + headerHeight + headerGap + viewportPadding + lyricsHeight + footerGap + footerHeight;
  const chromeHeight = size.height - layout.safeRect.height;
  const nextHeight = Math.ceil(chromeHeight + requiredSafeHeight);

  return Math.min(AUTO_HEIGHT_MAX, Math.max(AUTO_HEIGHT_MIN, nextHeight));
}

function toPixels(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
