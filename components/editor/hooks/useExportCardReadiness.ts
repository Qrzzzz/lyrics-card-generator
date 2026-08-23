"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { ExportCardDomCoordinator } from "@/components/editor/hooks/export-card-dom-coordinator";
import {
  ExportCardReadinessStore,
  type ExportCardReadiness
} from "@/components/editor/hooks/export-card-readiness-store";
import {
  AUTO_HEIGHT_SETTLE_TOLERANCE,
  autoCanvasHeightMeasurementSignature,
  findExportCard,
  isPortraitCustomAutoHeight,
  measureAutoCanvasHeight
} from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";
import { getCardSize } from "@/lib/card-size";
import { isArtworkAnalysisSettled } from "@/lib/artwork-geometry";
import {
  evaluateMinimumExportSafety,
  type ExportSafetyBlockingReason
} from "@/lib/export-safety";
import {
  getExportLyricLineStatus,
  type ExportLyricLineStatus
} from "@/lib/lyrics-document";
import type { AppState } from "@/lib/types";
import { proxiedImageUrl } from "@/lib/image-utils";

export type { ExportCardReadiness } from "@/components/editor/hooks/export-card-readiness-store";
export { ExportCardReadinessStore } from "@/components/editor/hooks/export-card-readiness-store";

export type ExportCardBlockingReason = ExportSafetyBlockingReason;

// Fractional line heights can make Chromium report a 2-3px scroll delta even
// when the intrinsic lyrics block is fully contained by its viewport.
export const EXPORT_CARD_OVERFLOW_TOLERANCE = 4;

export type UseExportCardReadinessInput = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  exportCardRef: RefObject<HTMLElement | null>;
  isAutoWidthStable?: boolean;
};

export type UseExportCardReadinessResult = {
  store: ExportCardReadinessStore;
  lineStatus: ExportLyricLineStatus;
};

export type LiveExportCardValidation = {
  blockingReason: ExportCardBlockingReason | null;
  lineStatus: ExportLyricLineStatus;
};

type DomReadiness = Omit<ExportCardReadiness, "isReady" | "blockingReason" | "lineStatus">;

type CurrentMeasurementInput = {
  state: AppState;
  signature: string;
  autoHeightSignature: string;
  isAutoWidthStable: boolean;
};

const initialDomReadiness: DomReadiness = {
  isCardMounted: false,
  areFontsReady: false,
  isCardSizeStable: false,
  isArtworkReady: false,
  isAutoWidthStable: false,
  isAutoHeightStable: false,
  measuredAutoHeight: null,
  hasContentOverflow: false
};

/**
 * Coordinates the independent export DOM without subscribing LyricEditor to
 * every settled readiness publication. Existing child CTA/panel consumers use
 * the returned store, while logical-line status stays in the document render.
 */
export function useExportCardReadiness({
  state,
  setState,
  exportCardRef,
  isAutoWidthStable = true
}: UseExportCardReadinessInput): UseExportCardReadinessResult {
  const signature = createExportCardMeasurementSignature(state, isAutoWidthStable);
  const autoHeightSignature = autoCanvasHeightMeasurementSignature(state);
  const lineStatus = useMemo(() => getExportLyricLineStatus({
    lyrics: state.lyrics,
    translationText: state.style.translationText,
    translationEnabled: state.style.translationEnabled,
    contentMode: state.style.contentMode,
    layoutMode: state.style.layoutMode
  }), [
    state.lyrics,
    state.style.contentMode,
    state.style.layoutMode,
    state.style.translationEnabled,
    state.style.translationText
  ]);
  const storeRef = useRef<ExportCardReadinessStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new ExportCardReadinessStore(
      createExportCardReadiness(state, initialDomReadiness)
    );
  }
  const store = storeRef.current;
  // This invalidation rides the document/style render already in progress. It
  // changes the CTA timing immediately without scheduling another root render.
  store.prepareInput(
    signature,
    () => createExportCardReadiness(state, initialDomReadiness)
  );

  const inputRef = useRef<CurrentMeasurementInput>({
    state,
    signature,
    autoHeightSignature,
    isAutoWidthStable
  });
  inputRef.current = {
    state,
    signature,
    autoHeightSignature,
    isAutoWidthStable
  };
  const coordinatorRef = useRef<ExportCardDomCoordinator | null>(null);

  useEffect(() => {
    const coordinator = new ExportCardDomCoordinator({
      getContainer: () => exportCardRef.current,
      evaluate: (container) => {
        const input = inputRef.current;
        const domReadiness = evaluateExportCardDom(
          input.state,
          container,
          input.isAutoWidthStable
        );
        applyMeasuredAutoCanvasHeight(setState, input, domReadiness.measuredAutoHeight);
        store.publish(
          input.signature,
          createExportCardReadiness(input.state, domReadiness)
        );
      }
    });
    coordinatorRef.current = coordinator;
    coordinator.start();

    return () => {
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
      coordinator.stop();
    };
  }, [exportCardRef, setState, store]);

  useEffect(() => {
    coordinatorRef.current?.requestEvaluation();
  }, [signature]);

  return { store, lineStatus };
}

/** Re-evaluates the DOM immediately at export time instead of trusting store state. */
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

/** Any value rendered by ExportCardHost participates; unrelated AppState does not. */
export function createExportCardMeasurementSignature(
  state: AppState,
  isAutoWidthStable = true
) {
  return JSON.stringify({
    lyrics: state.lyrics,
    locale: state.locale,
    song: state.song,
    coverArtwork: state.coverArtwork,
    style: state.style,
    isAutoWidthStable
  });
}

export function evaluateExportCardDom(
  state: AppState,
  container: HTMLElement | null,
  isAutoWidthStable: boolean
): DomReadiness {
  const root = findExportCard(container);
  const isCardMounted = Boolean(root);
  const areFontsReady = typeof document !== "undefined" && document.fonts.status === "loaded";
  // Semantic safety and physical DOM readiness form separate export gates.
  const expectedSize = getCardSize(state.style);
  const isCardSizeStable = Boolean(
    root &&
    Math.abs(root.offsetWidth - expectedSize.width) <= 1 &&
    Math.abs(root.offsetHeight - expectedSize.height) <= 1
  );
  const coverSourceUrl = state.song.proxiedCoverUrl || proxiedImageUrl(state.song.coverUrl);
  const artworkParticipates = Boolean(
    coverSourceUrl &&
    ((state.style.contentMode ?? "lyrics") === "instrumental" || state.style.showCover)
  );
  const isArtworkReady = !artworkParticipates || isArtworkAnalysisSettled(coverSourceUrl, state.coverArtwork);
  // This one measurement is shared by auto-height convergence and readiness.
  const measuredAutoHeight = root ? measureAutoCanvasHeight(state, container) : null;
  const isAutoHeightStable = !isPortraitCustomAutoHeight(state) || Boolean(
    measuredAutoHeight !== null &&
    Math.abs(measuredAutoHeight - expectedSize.height) <= AUTO_HEIGHT_SETTLE_TOLERANCE
  );

  return {
    isCardMounted,
    areFontsReady,
    isCardSizeStable,
    isArtworkReady,
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

function createExportCardReadiness(state: AppState, dom: DomReadiness): ExportCardReadiness {
  const { lineStatus, blockingReason } = evaluateMinimumExportSafety(state, dom);
  return {
    isReady: blockingReason === null,
    blockingReason,
    lineStatus,
    ...dom
  };
}

function applyMeasuredAutoCanvasHeight(
  setState: Dispatch<SetStateAction<AppState>>,
  input: CurrentMeasurementInput,
  nextHeight: number | null
) {
  // Width must settle first because wrapping couples the two automatic dimensions.
  if (
    nextHeight === null ||
    !input.isAutoWidthStable ||
    !isPortraitCustomAutoHeight(input.state) ||
    Math.abs(input.state.style.height - nextHeight) <= AUTO_HEIGHT_SETTLE_TOLERANCE
  ) {
    return;
  }

  setState((current) => {
    if (
      !isPortraitCustomAutoHeight(current) ||
      autoCanvasHeightMeasurementSignature(current) !== input.autoHeightSignature ||
      Math.abs(current.style.height - nextHeight) <= AUTO_HEIGHT_SETTLE_TOLERANCE
    ) {
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
}
