"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  AUTO_WIDTH_DEBOUNCE_MS,
  AUTO_WIDTH_SETTLE_TOLERANCE,
  chooseAutoWidth,
  isAutoWidthMeasurementEnabled
} from "@/lib/auto-width";
import { measureAutoWidthCandidates } from "@/lib/auto-width-dom";
import { applyEditorStyleChange } from "@/lib/editor/apply-style-change";
import type { AppState } from "@/lib/types";

type AppStateSetter = Dispatch<SetStateAction<AppState>>;

type AutoWidthEvaluation = {
  signature: string;
  recommendedWidth: number;
  confidence: "high" | "low";
};

export type AutoWidthReadiness = {
  isEnabled: boolean;
  isStable: boolean;
  isMeasuring: boolean;
  recommendedWidth: number | null;
  confidence: "high" | "low" | null;
};

export function useMeasuredAutoCanvasWidth(
  state: AppState,
  setState: AppStateSetter,
  hostRef: RefObject<HTMLElement | null>
): AutoWidthReadiness {
  const enabled = isAutoWidthMeasurementEnabled(state);
  const signature = useMemo(() => autoWidthMeasurementSignature(state), [state]);
  const [evaluation, setEvaluation] = useState<AutoWidthEvaluation | null>(null);
  // Anchor the input width per semantic signature to prevent measurement feedback loops.
  const anchorRef = useRef({ signature, width: state.style.width });
  if (anchorRef.current.signature !== signature) {
    anchorRef.current = { signature, width: state.style.width };
  }
  const anchorWidth = anchorRef.current.width;

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let timeout = 0;
    let frame = 0;

    const runMeasurement = async () => {
      try {
        if (typeof document !== "undefined" && document.fonts) {
          await document.fonts.ready;
        }
        // Two frames allow font metrics and the hidden measurement host to finish layout.
        await nextAnimationFrame();
        await nextAnimationFrame();
        if (!active) return;

        const host = hostRef.current;
        if (!host) {
          setEvaluation({ signature, recommendedWidth: anchorWidth, confidence: "low" });
          return;
        }

        const decision = chooseAutoWidth(measureAutoWidthCandidates(host), anchorWidth);
        // Low-confidence candidates are reported but never mutate the canvas width.
        const shouldApply = decision.confidence === "high" &&
          Math.abs(decision.width - anchorWidth) > AUTO_WIDTH_SETTLE_TOLERANCE;
        const recommendedWidth = shouldApply ? decision.width : anchorWidth;
        setEvaluation({ signature, recommendedWidth, confidence: decision.confidence });

        if (!shouldApply) return;
        setState((current) => {
          if (!isAutoWidthMeasurementEnabled(current) || autoWidthMeasurementSignature(current) !== signature) {
            return current;
          }
          if (Math.abs(current.style.width - recommendedWidth) <= AUTO_WIDTH_SETTLE_TOLERANCE) {
            return current;
          }
          return applyEditorStyleChange(current, {
            ...current.style,
            width: recommendedWidth
          });
        });
      } catch {
        if (active) {
          setEvaluation({ signature, recommendedWidth: anchorWidth, confidence: "low" });
        }
      }
    };

    timeout = window.setTimeout(() => {
      frame = requestAnimationFrame(() => void runMeasurement());
    }, AUTO_WIDTH_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [anchorWidth, enabled, hostRef, setState, signature]);

  if (!enabled) {
    return {
      isEnabled: false,
      isStable: true,
      isMeasuring: false,
      recommendedWidth: null,
      confidence: null
    };
  }

  // A completed measurement is ready only for the exact document/style signature it evaluated.
  const isCurrentEvaluation = evaluation?.signature === signature;
  const isStable = Boolean(
    isCurrentEvaluation &&
    evaluation &&
    Math.abs(evaluation.recommendedWidth - state.style.width) <= AUTO_WIDTH_SETTLE_TOLERANCE
  );
  return {
    isEnabled: true,
    isStable,
    isMeasuring: !isStable,
    recommendedWidth: isCurrentEvaluation ? evaluation?.recommendedWidth ?? null : null,
    confidence: isCurrentEvaluation ? evaluation?.confidence ?? null : null
  };
}

export function autoWidthMeasurementSignature(state: AppState) {
  const style = state.style;
  return JSON.stringify({
    enabled: style.autoWidth === true,
    layoutMode: style.layoutMode ?? "portrait",
    ratio: style.ratio,
    contentMode: style.contentMode,
    lyricDocument: {
      id: state.lyricDocument.id,
      revision: state.lyricDocument.revision
    },
    translationEnabled: style.translationEnabled,
    font: style.font,
    fontScheme: style.fontScheme,
    customFontEnabled: style.customFontEnabled,
    customFontFamily: style.customFontFamily,
    customFontWeight: style.customFontWeight,
    customFontStyle: style.customFontStyle,
    lyricFontSize: style.lyricFontSize,
    translationScale: style.translationScale,
    lineHeight: style.lineHeight,
    align: style.align
  });
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
