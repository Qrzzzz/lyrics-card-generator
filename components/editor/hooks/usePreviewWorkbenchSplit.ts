"use client";

import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

const DESKTOP_WORKBENCH_QUERY = "(min-width: 1024px)";
const DEFAULT_SETTINGS_RATIO = 0.5;
const MIN_SETTINGS_RATIO = 0.5;
const MAX_SETTINGS_RATIO = 2 / 3;
const MIN_SETTINGS_WIDTH = 440;
const MIN_PREVIEW_WIDTH = 360;
const WORKBENCH_GAP = 20;

type ResolvePreviewWorkbenchSplitInput = {
  viewportWidth: number;
  requestedRatio: number;
  gap?: number;
  minSettingsRatio?: number;
  maxSettingsRatio?: number;
  minSettingsWidth?: number;
  minPreviewWidth?: number;
};

export type PreviewWorkbenchSplitGeometry = {
  viewportWidth: number;
  usableWidth: number;
  settingsWidth: number;
  previewWidth: number;
  ratio: number;
  minRatio: number;
  maxRatio: number;
  gap: number;
};

export type PreviewWorkbenchTrackGeometry = {
  editorWidth: number;
  previewWidth: number;
  exportWidth: number;
  offset: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function resolvePreviewWorkbenchSplit({
  viewportWidth,
  requestedRatio,
  gap = WORKBENCH_GAP,
  minSettingsRatio = MIN_SETTINGS_RATIO,
  maxSettingsRatio = MAX_SETTINGS_RATIO,
  minSettingsWidth = MIN_SETTINGS_WIDTH,
  minPreviewWidth = MIN_PREVIEW_WIDTH
}: ResolvePreviewWorkbenchSplitInput): PreviewWorkbenchSplitGeometry {
  const resolvedViewportWidth = Math.max(0, viewportWidth);
  const usableWidth = Math.max(0, resolvedViewportWidth - gap);

  if (usableWidth <= 0) {
    return {
      viewportWidth: resolvedViewportWidth,
      usableWidth,
      settingsWidth: 0,
      previewWidth: 0,
      ratio: DEFAULT_SETTINGS_RATIO,
      minRatio: minSettingsRatio,
      maxRatio: maxSettingsRatio,
      gap
    };
  }

  const widthConstrainedMinimum = minSettingsWidth / usableWidth;
  const widthConstrainedMaximum = 1 - minPreviewWidth / usableWidth;
  const resolvedMinimum = Math.max(minSettingsRatio, widthConstrainedMinimum);
  const resolvedMaximum = Math.min(maxSettingsRatio, widthConstrainedMaximum);
  const constraintsFit = resolvedMinimum <= resolvedMaximum;
  const effectiveMinimum = constraintsFit ? resolvedMinimum : minSettingsRatio;
  const effectiveMaximum = constraintsFit ? resolvedMaximum : minSettingsRatio;
  const ratio = clamp(requestedRatio, effectiveMinimum, effectiveMaximum);
  const settingsWidth = usableWidth * ratio;

  return {
    viewportWidth: resolvedViewportWidth,
    usableWidth,
    settingsWidth,
    previewWidth: usableWidth - settingsWidth,
    ratio,
    minRatio: effectiveMinimum,
    maxRatio: effectiveMaximum,
    gap
  };
}

export function resolvePreviewWorkbenchTrack(
  split: PreviewWorkbenchSplitGeometry,
  exportActive: boolean
): PreviewWorkbenchTrackGeometry {
  if (!exportActive) {
    return {
      editorWidth: split.settingsWidth,
      previewWidth: split.previewWidth,
      exportWidth: split.settingsWidth,
      offset: 0
    };
  }

  const balancedPanelWidth = split.usableWidth / 2;
  return {
    editorWidth: balancedPanelWidth,
    previewWidth: balancedPanelWidth,
    exportWidth: balancedPanelWidth,
    offset: split.viewportWidth > 0 ? -(balancedPanelWidth + split.gap) : 0
  };
}

export function usePreviewWorkbenchSplit(enabled = true) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [requestedRatio, setRequestedRatio] = useState(DEFAULT_SETTINGS_RATIO);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const geometry = resolvePreviewWorkbenchSplit({ viewportWidth, requestedRatio });

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let frame = 0;
    const mediaQuery = window.matchMedia(DESKTOP_WORKBENCH_QUERY);
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewportWidth(viewport.getBoundingClientRect().width);
        setIsDesktop(mediaQuery.matches);
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    mediaQuery.addEventListener("change", update);
    update();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      mediaQuery.removeEventListener("change", update);
    };
  }, [enabled]);

  function updateRatioFromPointer(clientX: number) {
    const viewport = viewportRef.current;
    if (!viewport || !isDesktop) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const nextRatio = (clientX - rect.left - geometry.gap / 2) / Math.max(1, rect.width - geometry.gap);
    setRequestedRatio(clamp(nextRatio, MIN_SETTINGS_RATIO, MAX_SETTINGS_RATIO));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!isDesktop) {
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    updateRatioFromPointer(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    updateRatioFromPointer(event.clientX);
  }

  function finishPointerInteraction(event: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    updateRatioFromPointer(event.clientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerIdRef.current = null;
    setIsDragging(false);
  }

  function handleLostPointerCapture() {
    activePointerIdRef.current = null;
    setIsDragging(false);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerIdRef.current = null;
    setIsDragging(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.05 : 0.02;
    let nextRatio: number | null = null;

    if (event.key === "ArrowLeft") {
      nextRatio = geometry.ratio - step;
    } else if (event.key === "ArrowRight") {
      nextRatio = geometry.ratio + step;
    } else if (event.key === "Home") {
      nextRatio = MIN_SETTINGS_RATIO;
    } else if (event.key === "End") {
      nextRatio = MAX_SETTINGS_RATIO;
    }

    if (nextRatio === null) {
      return;
    }

    event.preventDefault();
    setRequestedRatio(clamp(nextRatio, MIN_SETTINGS_RATIO, MAX_SETTINGS_RATIO));
  }

  function reset() {
    setRequestedRatio(DEFAULT_SETTINGS_RATIO);
  }

  return {
    viewportRef: viewportRef as RefObject<HTMLDivElement | null>,
    geometry,
    isDesktop,
    isDragging,
    reset,
    separatorProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointerInteraction,
      onPointerCancel: handlePointerCancel,
      onLostPointerCapture: handleLostPointerCapture,
      onKeyDown: handleKeyDown,
      onDoubleClick: reset
    }
  };
}

export const __internalPreviewWorkbenchSplit = {
  DEFAULT_SETTINGS_RATIO,
  MIN_SETTINGS_RATIO,
  MAX_SETTINGS_RATIO,
  MIN_SETTINGS_WIDTH,
  MIN_PREVIEW_WIDTH,
  WORKBENCH_GAP
};
