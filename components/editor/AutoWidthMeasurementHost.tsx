"use client";

import type { RefObject } from "react";
import { LyricsBlock } from "@/components/preview/LyricsBlock";
import { getPortraitLayout } from "@/lib/card-layout-engine";
import { getAutoWidthCandidates, isAutoWidthMeasurementEnabled } from "@/lib/auto-width";
import { cardFontStyle, fontClassName } from "@/lib/fonts";
import type { AppState } from "@/lib/types";

export function AutoWidthMeasurementHost({
  state,
  hostRef
}: {
  state: AppState;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  if (!isAutoWidthMeasurementEnabled(state)) {
    return null;
  }

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      inert
      data-auto-width-measurement-host
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
      {getAutoWidthCandidates().map((canvasWidth) => {
        const candidateStyle = { ...state.style, width: canvasWidth };
        const layout = getPortraitLayout(
          { width: canvasWidth, height: state.style.height },
          candidateStyle,
          state.song
        );

        return (
          <div
            key={canvasWidth}
            data-auto-width-candidate={canvasWidth}
            className={fontClassName(state.style.font)}
            style={{
              ...cardFontStyle(state.style),
              width: layout.lyricsRect.width
            }}
          >
            <LyricsBlock
              lyrics={state.lyrics}
              translationText={state.style.translationText}
              translationEnabled={state.style.translationEnabled}
              lyricFontSize={state.style.lyricFontSize}
              translationScale={state.style.translationScale}
              lineHeight={state.style.lineHeight}
              textColor={state.style.resolvedTextColor || "#FFFFFF"}
              align={state.style.align}
              isDarkText={false}
              autoWidth
            />
          </div>
        );
      })}
    </div>
  );
}
