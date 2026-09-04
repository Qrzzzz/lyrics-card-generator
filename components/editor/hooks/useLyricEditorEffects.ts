"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { FIXED_WHITE_TEXT_COLOR } from "@/lib/card-style-normalize";
import { proxiedImageUrl } from "@/lib/image-utils";
import {
  createBlobUrlRetirementState,
  reconcileBlobUrlRetirement
} from "@/lib/object-url-lifecycle";
import { analyzeCoverImage } from "@/lib/palette-extraction";
import type { AppState } from "@/lib/types";

type AppStateSetter = Dispatch<SetStateAction<AppState>>;

export function useSongCoverObjectUrlLifecycle(coverUrl?: string, preservedCoverUrl?: string) {
  // A retired live cover remains valid while an active export snapshot still references it.
  const retirementStateRef = useRef<ReturnType<typeof createBlobUrlRetirementState> | null>(null);
  if (!retirementStateRef.current) {
    retirementStateRef.current = createBlobUrlRetirementState(coverUrl);
  }

  useEffect(() => {
    reconcileBlobUrlRetirement(
      retirementStateRef.current!,
      coverUrl,
      preservedCoverUrl
    );
  }, [coverUrl, preservedCoverUrl]);
}

export function useSyncedCoverProxy(state: AppState, setState: AppStateSetter) {
  useEffect(() => {
    // Keep the derived proxy URL synchronized without making it editable document input.
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

    analyzeCoverImage(coverForPalette).then(({ palette, artwork }) => {
      // Ignore analysis that resolves after the cover dependency changes.
      if (!active) {
        return;
      }

      setState((current) => ({
        ...current,
        palette,
        paletteWarning: "",
        coverArtwork: artwork,
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
      style.textColorMode === "custom" ? style.customTextColor : FIXED_WHITE_TEXT_COLOR;

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
    state.style.customTextColor,
    state.style.resolvedTextColor,
    state.style.textColorMode
  ]);
}
