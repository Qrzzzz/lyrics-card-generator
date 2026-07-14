"use client";

import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { AUTO_HEIGHT_MAX, AUTO_HEIGHT_MIN, getCardSize } from "@/lib/card-size";
import { getPortraitLayout } from "@/lib/card-layout-engine";
import type { AppState } from "@/lib/types";

type AppStateSetter = Dispatch<SetStateAction<AppState>>;

export const AUTO_HEIGHT_SETTLE_TOLERANCE = 2;

export function useMeasuredAutoCanvasHeight(
  state: AppState,
  setState: AppStateSetter,
  cardRef: RefObject<HTMLElement | null>,
  isAutoWidthStable = true
) {
  useEffect(() => {
    if (!isPortraitCustomAutoHeight(state) || !isAutoWidthStable) {
      return;
    }

    let active = true;
    let frame = 0;
    const observers: ResizeObserver[] = [];
    let contentObserver: MutationObserver | undefined;

    const scheduleMeasure = () => {
      if (!active) {
        return;
      }

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextHeight = measureAutoCanvasHeight(state, cardRef.current);
        if (nextHeight === null) {
          return;
        }

        setState((current) => {
          if (!isPortraitCustomAutoHeight(current) || !isAutoWidthStable) {
            return current;
          }

          if (Math.abs(current.style.height - nextHeight) <= AUTO_HEIGHT_SETTLE_TOLERANCE) {
            return current;
          }

          return {
            ...current,
            style: {
              ...current.style,
              height: nextHeight
            }
          };
        });
      });
    };

    const attachObservers = () => {
      const root = findExportCard(cardRef.current);
      if (!root) {
        scheduleMeasure();
        return;
      }

      const targets = [
        root,
        root.querySelector<HTMLElement>("[data-card-content]"),
        root.querySelector<HTMLElement>("[data-card-header]"),
        root.querySelector<HTMLElement>("[data-card-lyrics]"),
        root.querySelector<HTMLElement>("[data-card-footer]")
      ].filter(Boolean) as HTMLElement[];

      for (const target of targets) {
        const observer = new ResizeObserver(scheduleMeasure);
        observer.observe(target);
        observers.push(observer);
      }

      contentObserver = new MutationObserver(scheduleMeasure);
      contentObserver.observe(root, {
        childList: true,
        characterData: true,
        subtree: true
      });

      scheduleMeasure();
    };

    void document.fonts?.ready.then(scheduleMeasure);
    attachObservers();

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observers.forEach((observer) => observer.disconnect());
      contentObserver?.disconnect();
    };
  }, [
    cardRef,
    isAutoWidthStable,
    setState,
    state.lyrics,
    state.locale,
    state.song.album,
    state.song.artist,
    state.song.explicit,
    state.song.source,
    state.song.title,
    state.translationEnabled,
    state.translationText,
    state.style.align,
    state.style.allowTwoLineTitle,
    state.style.autoHeight,
    state.style.contentMode,
    state.style.customFontEnabled,
    state.style.customFontFamily,
    state.style.customFontWeight,
    state.style.customFontStyle,
    state.style.font,
    state.style.height,
    state.style.layoutMode,
    state.style.lineHeight,
    state.style.lyricFontSize,
    state.style.ratio,
    state.style.sharedByText,
    state.style.showCover,
    state.style.showGeneratedWatermark,
    state.style.showAlbumName,
    state.style.showPlatformBadge,
    state.style.showSharedBy,
    state.style.showSongInfo,
    state.style.translationEnabled,
    state.style.translationScale,
    state.style.translationText,
    state.style.width
  ]);
}

export function isPortraitCustomAutoHeight(state: AppState) {
  return (
    (state.style.layoutMode ?? "portrait") === "portrait" &&
    state.style.ratio === "custom" &&
    state.style.autoHeight
  );
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
  const layout = getPortraitLayout(size, currentState.style, currentState.song);
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
