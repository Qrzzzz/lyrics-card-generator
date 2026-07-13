"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import {
  AUTO_HEIGHT_SETTLE_TOLERANCE,
  findExportCard,
  isPortraitCustomAutoHeight,
  measureAutoCanvasHeight
} from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";
import { getCardSize } from "@/lib/card-size";
import {
  evaluateMinimumExportSafety,
  type ExportSafetyBlockingReason
} from "@/lib/export-safety";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import type { AppState } from "@/lib/types";

export type ExportCardBlockingReason = ExportSafetyBlockingReason;

// Fractional line heights can make Chromium report a 2-3px scroll delta even
// when the intrinsic lyrics block is fully contained by its viewport.
export const EXPORT_CARD_OVERFLOW_TOLERANCE = 4;

export type ExportCardReadiness = {
  isReady: boolean;
  blockingReason: ExportCardBlockingReason | null;
  lineStatus: ExportLyricLineStatus;
  isCardMounted: boolean;
  areFontsReady: boolean;
  isCardSizeStable: boolean;
  isAutoWidthStable: boolean;
  isAutoHeightStable: boolean;
  measuredAutoHeight: number | null;
  hasContentOverflow: boolean;
};

export type UseExportCardReadinessInput = {
  state: AppState;
  exportCardRef: RefObject<HTMLElement | null>;
  isAutoWidthStable?: boolean;
};

export type LiveExportCardValidation = {
  blockingReason: ExportCardBlockingReason | null;
  lineStatus: ExportLyricLineStatus;
};

type DomReadiness = Omit<ExportCardReadiness, "isReady" | "blockingReason" | "lineStatus"> & {
  evaluatedState: AppState | null;
};

const initialDomReadiness: DomReadiness = {
  evaluatedState: null,
  isCardMounted: false,
  areFontsReady: false,
  isCardSizeStable: false,
  isAutoWidthStable: false,
  isAutoHeightStable: false,
  measuredAutoHeight: null,
  hasContentOverflow: false
};

/**
 * Reports whether the independent export DOM is safe to capture. Callers can
 * use `blockingReason` for localized UI and must still enforce `isReady` in the
 * export action itself.
 */
export function useExportCardReadiness({
  state,
  exportCardRef,
  isAutoWidthStable = true
}: UseExportCardReadinessInput): ExportCardReadiness {
  const [domReadiness, setDomReadiness] = useState<DomReadiness>(initialDomReadiness);
  useEffect(() => {
    let active = true;
    let frame = 0;
    const resizeObservers: ResizeObserver[] = [];
    let mutationObserver: MutationObserver | undefined;
    const fonts = document.fonts;

    const evaluate = () => {
      if (!active) {
        return;
      }

      const next = evaluateExportCardDom(state, exportCardRef.current, isAutoWidthStable);

      setDomReadiness((current) => sameDomReadiness(current, next) ? current : next);
    };

    const scheduleEvaluate = () => {
      if (!active) {
        return;
      }

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(evaluate);
    };

    const root = findExportCard(exportCardRef.current);
    if (root) {
      const targets = [
        root,
        root.querySelector<HTMLElement>("[data-card-lyrics-viewport]"),
        root.querySelector<HTMLElement>("[data-card-lyrics]")
      ].filter(Boolean) as HTMLElement[];

      for (const target of targets) {
        const observer = new ResizeObserver(scheduleEvaluate);
        observer.observe(target);
        resizeObservers.push(observer);
      }

      mutationObserver = new MutationObserver(scheduleEvaluate);
      mutationObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style"],
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    if (fonts.status !== "loaded") {
      void fonts.ready.then(scheduleEvaluate);
    }
    scheduleEvaluate();

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      resizeObservers.forEach((observer) => observer.disconnect());
      mutationObserver?.disconnect();
    };
  }, [exportCardRef, isAutoWidthStable, state]);

  const isCurrentState = domReadiness.evaluatedState === state;
  const currentDomReadiness = isCurrentState
    ? domReadiness
    : initialDomReadiness;
  const { lineStatus, blockingReason } = evaluateMinimumExportSafety(state, currentDomReadiness);

  return {
    isReady: blockingReason === null,
    blockingReason,
    lineStatus,
    isCardMounted: currentDomReadiness.isCardMounted,
    areFontsReady: currentDomReadiness.areFontsReady,
    isCardSizeStable: currentDomReadiness.isCardSizeStable,
    isAutoWidthStable: currentDomReadiness.isAutoWidthStable,
    isAutoHeightStable: currentDomReadiness.isAutoHeightStable,
    measuredAutoHeight: currentDomReadiness.measuredAutoHeight,
    hasContentOverflow: currentDomReadiness.hasContentOverflow
  };
}

/** Re-evaluates the DOM immediately at export time instead of trusting hook state. */
export function getLiveExportCardValidation(
  state: AppState,
  container: HTMLElement | null,
  isAutoWidthStable = true
): LiveExportCardValidation {
  const readiness = evaluateExportCardDom(state, container, isAutoWidthStable);
  const { lineStatus, blockingReason } = evaluateMinimumExportSafety(state, readiness);

  return {
    blockingReason,
    lineStatus
  };
}

function evaluateExportCardDom(
  state: AppState,
  container: HTMLElement | null,
  isAutoWidthStable: boolean
): DomReadiness {
  const root = findExportCard(container);
  const isCardMounted = Boolean(root);
  const areFontsReady = typeof document !== "undefined" && document.fonts.status === "loaded";
  const expectedSize = getCardSize(state.style);
  const isCardSizeStable = Boolean(
    root &&
    Math.abs(root.offsetWidth - expectedSize.width) <= 1 &&
    Math.abs(root.offsetHeight - expectedSize.height) <= 1
  );
  const measuredAutoHeight = root ? measureAutoCanvasHeight(state, container) : null;
  const isAutoHeightStable = !isPortraitCustomAutoHeight(state) || Boolean(
    measuredAutoHeight !== null &&
    Math.abs(measuredAutoHeight - expectedSize.height) <= AUTO_HEIGHT_SETTLE_TOLERANCE
  );

  return {
    evaluatedState: state,
    isCardMounted,
    areFontsReady,
    isCardSizeStable,
    isAutoWidthStable,
    isAutoHeightStable,
    measuredAutoHeight,
    hasContentOverflow: root ? detectExportCardOverflow(root) : false
  };
}

export function detectExportCardOverflow(root: HTMLElement, tolerance = EXPORT_CARD_OVERFLOW_TOLERANCE) {
  const lyrics = root.querySelector<HTMLElement>("[data-card-lyrics]");
  const viewport = root.querySelector<HTMLElement>("[data-card-lyrics-viewport]");

  return Boolean(
    (lyrics && (
      lyrics.scrollHeight > lyrics.clientHeight + tolerance ||
      lyrics.scrollWidth > lyrics.clientWidth + tolerance
    )) ||
    (viewport && (
      viewport.scrollHeight > viewport.clientHeight + tolerance ||
      viewport.scrollWidth > viewport.clientWidth + tolerance
    ))
  );
}

function sameDomReadiness(left: DomReadiness, right: DomReadiness) {
  return (
    left.evaluatedState === right.evaluatedState &&
    left.isCardMounted === right.isCardMounted &&
    left.areFontsReady === right.areFontsReady &&
    left.isCardSizeStable === right.isCardSizeStable &&
    left.isAutoWidthStable === right.isAutoWidthStable &&
    left.isAutoHeightStable === right.isAutoHeightStable &&
    left.measuredAutoHeight === right.measuredAutoHeight &&
    left.hasContentOverflow === right.hasContentOverflow
  );
}
