"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { estimateCardHeight } from "@/lib/card-size";
import { TEXT_COLOR_PRESETS } from "@/lib/color-analysis";
import { proxiedImageUrl } from "@/lib/image-utils";
import { extractPaletteFromImage } from "@/lib/palette-extraction";
import { resolveAutoTextColor } from "@/lib/palette-background";
import type { AppState } from "@/lib/types";

type AppStateSetter = Dispatch<SetStateAction<AppState>>;

export function useSyncedCoverProxy(state: AppState, setState: AppStateSetter) {
  useEffect(() => {
    const nextProxiedCoverUrl = proxiedImageUrl(state.song.coverUrl);
    if (nextProxiedCoverUrl === state.song.proxiedCoverUrl) {
      return;
    }

    setState((current) => ({
      ...current,
      song: {
        ...current.song,
        proxiedCoverUrl: nextProxiedCoverUrl
      }
    }));
  }, [setState, state.song.coverUrl, state.song.proxiedCoverUrl]);
}

export function useCoverPalette(coverForPalette: string, setState: AppStateSetter) {
  useEffect(() => {
    let active = true;

    extractPaletteFromImage(coverForPalette).then((palette) => {
      if (!active) {
        return;
      }

      setState((current) => ({
        ...current,
        palette,
        paletteWarning: "",
        style: {
          ...current.style,
          extractedPalette: palette
        }
      }));
    });

    return () => {
      active = false;
    };
  }, [coverForPalette, setState]);
}

export function useResolvedTextColor(state: AppState, setState: AppStateSetter) {
  useEffect(() => {
    const style = state.style;
    const nextColor =
      style.textColorMode === "auto"
        ? resolveAutoTextColor()
        : style.textColorMode === "preset"
          ? TEXT_COLOR_PRESETS[style.textColorPreset].value
          : style.customTextColor;

    if (nextColor.toLowerCase() === style.resolvedTextColor.toLowerCase()) {
      return;
    }

    setState((current) => ({
      ...current,
      style: {
        ...current.style,
        resolvedTextColor: nextColor
      }
    }));
  }, [
    setState,
    state.palette,
    state.style.customTextColor,
    state.style.resolvedTextColor,
    state.style.textColorMode,
    state.style.textColorPreset
  ]);
}

export function useAutoCanvasHeight(state: AppState, setState: AppStateSetter) {
  useEffect(() => {
    if ((state.style.layoutMode ?? "portrait") === "landscape" || state.style.ratio !== "custom" || !state.style.autoHeight) {
      return;
    }

    const nextHeight = estimateCardHeight({
      width: state.style.width,
      lyrics: state.lyrics,
      translationText: state.style.translationText,
      translationEnabled: state.style.translationEnabled && state.style.contentMode === "lyrics",
      translationScale: state.style.translationScale,
      lyricFontSize: state.style.lyricFontSize,
      lineHeight: state.style.lineHeight,
      contentMode: state.style.contentMode,
      showCover: state.style.showCover,
      showSongInfo: state.style.showSongInfo,
      hasAlbumName: state.style.showAlbumName && Boolean(state.song.album?.trim()),
      allowTwoLineTitle: state.style.allowTwoLineTitle,
      showGeneratedWatermark: state.style.showGeneratedWatermark,
      showPlatformBadge: state.style.showPlatformBadge && state.song.source !== "unknown",
      showSharedBy: state.style.showSharedBy && state.style.sharedByText.trim().length > 0,
      sharedByText: state.style.sharedByText,
      frameStyleEnabled: state.style.frameStyleEnabled,
      frameVariant: state.style.frameVariant
    });

    if (nextHeight === state.style.height) {
      return;
    }

    setState((current) => ({
      ...current,
      style: {
        ...current.style,
        height: nextHeight
      }
    }));
  }, [
    setState,
    state.lyrics,
    state.song.album,
    state.song.source,
    state.style.allowTwoLineTitle,
    state.style.autoHeight,
    state.style.frameStyleEnabled,
    state.style.frameVariant,
    state.style.height,
    state.style.layoutMode,
    state.style.lineHeight,
    state.style.lyricFontSize,
    state.style.ratio,
    state.style.contentMode,
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
