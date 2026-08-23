"use client";

import type { RefObject } from "react";
import { LandscapeAccessories, hasLandscapeAccessories } from "@/components/preview/LandscapeAccessories";
import { LandscapeLyricsContent } from "@/components/preview/LandscapeLyricsContent";
import { LandscapeSongMetadata } from "@/components/preview/LandscapeSongMetadata";
import { getArtworkAspectRatio, resolveAdaptiveArtworkSize } from "@/lib/artwork-geometry";
import { cardFontStyle, fontClassName } from "@/lib/fonts";
import {
  getLandscapeLyricsWidthCandidates,
  normalizeLandscapeLayoutSettings
} from "@/lib/landscape-plan";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { AppState } from "@/lib/types";

const LEFT_BASE_WIDTH = 480;

export function LandscapeLayoutMeasurementHost({
  state,
  hostRef
}: {
  state: AppState;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  if ((state.style.layoutMode ?? "portrait") !== "landscape" || state.style.contentMode !== "lyrics") {
    return null;
  }

  const settings = normalizeLandscapeLayoutSettings(state.style.landscapeLayout, state.lastLandscapeSize);
  const widths = getLandscapeLyricsWidthCandidates(settings);
  const activeCover = state.song.proxiedCoverUrl || proxiedImageUrl(state.song.coverUrl);
  const coverSize = resolveAdaptiveArtworkSize({
    baseSize: LEFT_BASE_WIDTH,
    aspectRatio: getArtworkAspectRatio(activeCover, state.coverArtwork),
    maxWidth: LEFT_BASE_WIDTH,
    maxHeight: LEFT_BASE_WIDTH
  });
  const showGeneratedWatermark = state.style.showGeneratedWatermark ?? state.style.showWatermark;
  const hasAccessories = hasLandscapeAccessories({
    showPlatformBadge: state.style.showPlatformBadge,
    source: state.song.source,
    showSharedBy: state.style.showSharedBy,
    sharedByText: state.style.sharedByText,
    showGeneratedWatermark
  });

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      inert
      data-landscape-measurement-host
      data-landscape-measurement-widths={JSON.stringify(widths)}
      data-landscape-cover-size={JSON.stringify({ width: coverSize.width, height: coverSize.height })}
      style={{
        position: "fixed",
        left: "-100000px",
        top: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none"
      }}
    >
      <div
        data-landscape-lyrics-candidate
        className={fontClassName(state.style.font)}
        style={{ ...cardFontStyle(state.style), width: widths[0] }}
      >
        <LandscapeLyricsContent
          lyrics={state.lyrics}
          translationText={state.style.translationText}
          translationEnabled={state.style.translationEnabled}
          lyricFontSize={state.style.lyricFontSize}
          translationScale={state.style.translationScale}
          lineHeight={state.style.lineHeight}
          textColor={state.style.resolvedTextColor || "#FFFFFF"}
          align={state.style.align}
          isDarkText={false}
          measurement
        />
      </div>
      <div
        data-landscape-left-metadata-measure
        className={fontClassName(state.style.font)}
        style={{ ...cardFontStyle(state.style), width: LEFT_BASE_WIDTH }}
      >
        <LandscapeSongMetadata
          song={state.song}
          textColor={state.style.resolvedTextColor || "#FFFFFF"}
          showAlbumName={state.style.showAlbumName}
          measurement
        />
      </div>
      {hasAccessories ? (
        <div data-landscape-left-accessories-measure style={{ width: LEFT_BASE_WIDTH }}>
          <LandscapeAccessories
            source={state.song.source}
            showPlatformBadge={state.style.showPlatformBadge}
            showSharedBy={state.style.showSharedBy}
            sharedByText={state.style.sharedByText}
            showGeneratedWatermark={showGeneratedWatermark}
            textColor={state.style.resolvedTextColor || "#FFFFFF"}
          />
        </div>
      ) : null}
    </div>
  );
}
