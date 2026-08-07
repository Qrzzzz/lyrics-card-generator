"use client";

import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  resolveResizableSplit,
  resolveSplitKeyboardRatio,
  resolveSplitPointerRatio
} from "@/lib/resizable-split";

type UseResizableSplitInput = {
  enabled?: boolean;
  requestedRatio: number;
  onRequestedRatioChange: (ratio: number) => void;
  defaultRatio: number;
  minRatio: number;
  maxRatio: number;
  minLeadingWidth: number;
  minTrailingWidth: number;
  gap: number;
  desktopQuery: string;
  minimumViewportWidth?: number;
};

export function useResizableSplit({
  enabled = true,
  requestedRatio,
  onRequestedRatioChange,
  defaultRatio,
  minRatio,
  maxRatio,
  minLeadingWidth,
  minTrailingWidth,
  gap,
  desktopQuery,
  minimumViewportWidth = 0
}: UseResizableSplitInput) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [matchesDesktopQuery, setMatchesDesktopQuery] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Geometry may clamp the effective ratio without overwriting the user's requested ratio.
  const geometry = resolveResizableSplit({
    viewportWidth,
    requestedRatio,
    defaultRatio,
    minRatio,
    maxRatio,
    minLeadingWidth,
    minTrailingWidth,
    gap
  });
  const isDesktop = matchesDesktopQuery && viewportWidth >= minimumViewportWidth;

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let frame = 0;
    const mediaQuery = window.matchMedia(desktopQuery);
    const update = () => {
      // Coalesce ResizeObserver and media-query changes into one geometry update per frame.
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewportWidth(viewport.getBoundingClientRect().width);
        setMatchesDesktopQuery(mediaQuery.matches);
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
  }, [desktopQuery, enabled]);

  function updateRatioFromPointer(clientX: number) {
    const viewport = viewportRef.current;
    if (!viewport || !isDesktop) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    onRequestedRatioChange(resolveSplitPointerRatio({
      clientX,
      viewportLeft: rect.left,
      viewportWidth: rect.width,
      gap: geometry.gap,
      minRatio,
      maxRatio
    }));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!isDesktop) {
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    // Pointer capture keeps the drag continuous after the pointer leaves the narrow separator.
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
    const nextRatio = resolveSplitKeyboardRatio({
      key: event.key,
      shiftKey: event.shiftKey,
      currentRatio: geometry.ratio,
      minRatio,
      maxRatio
    });
    if (nextRatio === null) {
      return;
    }

    event.preventDefault();
    onRequestedRatioChange(nextRatio);
  }

  function reset() {
    onRequestedRatioChange(defaultRatio);
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
