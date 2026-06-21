"use client";

import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { getCardSize } from "@/lib/card-size";
import { getPortraitLayout } from "@/lib/card-layout-engine";
import { portraitLayoutConfig } from "@/lib/card-layout-config";
import type { AppState } from "@/lib/types";

type AppStateSetter = Dispatch<SetStateAction<AppState>>;

export function useMeasuredAutoCanvasHeight(
  state: AppState,
  setState: AppStateSetter,
  cardRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if ((state.style.layoutMode ?? "portrait") !== "portrait" || state.style.ratio !== "custom" || !state.style.autoHeight) {
      return;
    }

    let active = true;
    let frame = 0;
    const observers: ResizeObserver[] = [];

    const scheduleMeasure = () => {
      if (!active) {
        return;
      }

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextHeight = measureHeight(state);
        if (nextHeight === null) {
          return;
        }

        setState((current) => {
          if ((current.style.layoutMode ?? "portrait") !== "portrait" || current.style.ratio !== "custom" || !current.style.autoHeight) {
            return current;
          }

          if (Math.abs(current.style.height - nextHeight) < 4) {
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
      const root = cardRef.current?.querySelector<HTMLElement>("[data-export-card]");
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

      scheduleMeasure();
    };

    void document.fonts?.ready.then(scheduleMeasure);
    attachObservers();

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [
    cardRef,
    setState,
    state.lyrics,
    state.song.source,
    state.style.align,
    state.style.allowTwoLineTitle,
    state.style.autoHeight,
    state.style.contentMode,
    state.style.customFontEnabled,
    state.style.customFontFamily,
    state.style.customFontWeight,
    state.style.customFontStyle,
    state.style.font,
    state.style.frameStyleEnabled,
    state.style.frameVariant,
    state.style.height,
    state.style.layoutMode,
    state.style.lineHeight,
    state.style.lyricFontSize,
    state.style.ratio,
    state.style.sharedByText,
    state.style.showCover,
    state.style.showGeneratedWatermark,
    state.style.showPlatformBadge,
    state.style.showSharedBy,
    state.style.showSongInfo,
    state.style.translationEnabled,
    state.style.translationScale,
    state.style.translationText,
    state.style.width
  ]);

  function measureHeight(currentState: AppState) {
    const root = cardRef.current?.querySelector<HTMLElement>("[data-export-card]");
    const content = root?.querySelector<HTMLElement>("[data-card-content]");
    const lyrics = root?.querySelector<HTMLElement>("[data-card-lyrics]");
    if (!root || !content || !lyrics) {
      return null;
    }

    const size = getCardSize(currentState.style);
    const layout = getPortraitLayout(size, currentState.style, currentState.song.source);
    const contentStyle = window.getComputedStyle(content);
    const viewport = root.querySelector<HTMLElement>("[data-card-lyrics-viewport]");
    const viewportStyle = viewport ? window.getComputedStyle(viewport) : null;
    const header = root.querySelector<HTMLElement>("[data-card-header]");
    const footer = root.querySelector<HTMLElement>("[data-card-footer]");
    const contentPadding =
      toPixels(contentStyle.paddingTop) +
      toPixels(contentStyle.paddingBottom);
    const viewportPadding =
      (viewportStyle ? toPixels(viewportStyle.paddingTop) + toPixels(viewportStyle.paddingBottom) : 0);
    const headerHeight = header?.scrollHeight ?? 0;
    const footerHeight = footer?.scrollHeight ?? 0;
    const lyricsHeight = lyrics.scrollHeight;
    const headerGap = headerHeight > 0 ? Math.max(24, Math.round(size.height * 0.022)) : 0;
    const footerGap = footerHeight > 0 ? Math.max(18, Math.round(size.height * 0.014)) : 0;
    const requiredSafeHeight =
      contentPadding + headerHeight + headerGap + viewportPadding + lyricsHeight + footerGap + footerHeight;
    const chromeHeight = size.height - layout.safeRect.height;
    const nextHeight = Math.ceil(chromeHeight + requiredSafeHeight);

    return Math.min(
      portraitLayoutConfig.canvas.maxHeight,
      Math.max(portraitLayoutConfig.canvas.minHeight, nextHeight)
    );
  }
}

function toPixels(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
