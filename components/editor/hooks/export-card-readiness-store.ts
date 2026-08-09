"use client";

import { useSyncExternalStore } from "react";
import type { ExportSafetyBlockingReason } from "@/lib/export-safety";
import {
  getExportLyricLineStatus,
  type ExportLyricLineStatus
} from "@/lib/lyrics-document";

export type ExportCardReadiness = {
  isReady: boolean;
  blockingReason: ExportSafetyBlockingReason | null;
  lineStatus: ExportLyricLineStatus;
  isCardMounted: boolean;
  areFontsReady: boolean;
  isCardSizeStable: boolean;
  isAutoWidthStable: boolean;
  isAutoHeightStable: boolean;
  measuredAutoHeight: number | null;
  hasContentOverflow: boolean;
};

export const INITIAL_EXPORT_CARD_READINESS: ExportCardReadiness = {
  isReady: false,
  blockingReason: "card-unavailable",
  lineStatus: getExportLyricLineStatus({
    lyrics: "",
    translationEnabled: false
  }),
  isCardMounted: false,
  areFontsReady: false,
  isCardSizeStable: false,
  isAutoWidthStable: false,
  isAutoHeightStable: false,
  measuredAutoHeight: null,
  hasContentOverflow: false
};

type StoreListener = () => void;

/**
 * Keeps asynchronous export readiness below LyricEditor. Input invalidation is
 * prepared during the existing document render; settled DOM publications only
 * notify the focused CTA/panel consumers.
 */
export class ExportCardReadinessStore {
  private desiredSignature = "";
  private snapshot: ExportCardReadiness;
  private readonly listeners = new Set<StoreListener>();

  constructor(initialSnapshot = INITIAL_EXPORT_CARD_READINESS) {
    this.snapshot = initialSnapshot;
  }

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.snapshot;

  subscribe = (listener: StoreListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Called while LyricEditor is already rendering a semantic document change.
   * Subscribers render in that same tree pass, so notifying here would create a
   * redundant follow-up root update.
   */
  prepareInput(
    signature: string,
    staleSnapshot: ExportCardReadiness | (() => ExportCardReadiness)
  ) {
    if (this.desiredSignature === signature) {
      return false;
    }

    this.desiredSignature = signature;
    this.snapshot = typeof staleSnapshot === "function" ? staleSnapshot() : staleSnapshot;
    return true;
  }

  publish(signature: string, nextSnapshot: ExportCardReadiness) {
    if (this.desiredSignature !== signature || sameExportCardReadiness(this.snapshot, nextSnapshot)) {
      return false;
    }

    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) {
      listener();
    }
    return true;
  }

  dispose() {
    this.listeners.clear();
  }
}

export function useExportCardReadinessSnapshot(store: ExportCardReadinessStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

const subscribeToNothing = () => () => {};
const getNoReadinessSnapshot = () => null;

export function useOptionalExportCardReadinessSnapshot(store?: ExportCardReadinessStore) {
  return useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    store?.getSnapshot ?? getNoReadinessSnapshot,
    store?.getServerSnapshot ?? getNoReadinessSnapshot
  );
}

function sameExportCardReadiness(left: ExportCardReadiness, right: ExportCardReadiness) {
  return (
    left.isReady === right.isReady &&
    left.blockingReason === right.blockingReason &&
    sameLineStatus(left.lineStatus, right.lineStatus) &&
    left.isCardMounted === right.isCardMounted &&
    left.areFontsReady === right.areFontsReady &&
    left.isCardSizeStable === right.isCardSizeStable &&
    left.isAutoWidthStable === right.isAutoWidthStable &&
    left.isAutoHeightStable === right.isAutoHeightStable &&
    left.measuredAutoHeight === right.measuredAutoHeight &&
    left.hasContentOverflow === right.hasContentOverflow
  );
}

function sameLineStatus(left: ExportLyricLineStatus, right: ExportLyricLineStatus) {
  return (
    left.originalLineCount === right.originalLineCount &&
    left.translationLineCount === right.translationLineCount &&
    left.totalLineCount === right.totalLineCount &&
    left.maxLineCount === right.maxLineCount &&
    left.remainingLineCount === right.remainingLineCount &&
    left.exceededLineCount === right.exceededLineCount &&
    left.isExempt === right.isExempt &&
    left.isOverLimit === right.isOverLimit &&
    left.canExport === right.canExport
  );
}
