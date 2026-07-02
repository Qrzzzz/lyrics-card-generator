"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

export type StepperLayoutColumns = 6 | 3 | 2;

export type BalancedStepperLayout = {
  columns: StepperLayoutColumns;
  compact: boolean;
};

type UseBalancedStepperLayoutInput = {
  containerRef: RefObject<HTMLElement | null>;
  measureRef: RefObject<HTMLElement | null>;
  stepCount: number;
  measurementKey?: string;
  gapPx?: number;
  comfortableMinItemWidth?: number;
  compactMinItemWidth?: number;
};

const STEP_LAYOUT_CANDIDATES: StepperLayoutColumns[] = [6, 3, 2];
const DEFAULT_LAYOUT: BalancedStepperLayout = { columns: 3, compact: false };

function getCellWidth(containerWidth: number, columns: number, gapPx: number) {
  return (containerWidth - gapPx * (columns - 1)) / columns;
}

function chooseStepperLayout({
  containerWidth,
  itemWidths,
  stepCount,
  gapPx,
  comfortableMinItemWidth,
  compactMinItemWidth
}: {
  containerWidth: number;
  itemWidths: number[];
  stepCount: number;
  gapPx: number;
  comfortableMinItemWidth: number;
  compactMinItemWidth: number;
}): BalancedStepperLayout {
  if (!containerWidth || !stepCount || itemWidths.length === 0) {
    return DEFAULT_LAYOUT;
  }

  const maxMeasuredItemWidth = Math.ceil(Math.max(...itemWidths));
  const fullLabelMinimum = Math.max(maxMeasuredItemWidth, comfortableMinItemWidth);

  for (const columns of STEP_LAYOUT_CANDIDATES) {
    if (columns > stepCount) {
      continue;
    }

    const cellWidth = getCellWidth(containerWidth, columns, gapPx);

    if (cellWidth >= fullLabelMinimum) {
      return { columns, compact: false };
    }
  }

  for (const columns of STEP_LAYOUT_CANDIDATES.slice(2)) {
    if (columns > stepCount) {
      continue;
    }

    const cellWidth = getCellWidth(containerWidth, columns, gapPx);

    if (cellWidth >= compactMinItemWidth) {
      return { columns, compact: true };
    }
  }

  return { columns: 2, compact: true };
}

export function useBalancedStepperLayout({
  containerRef,
  measureRef,
  stepCount,
  measurementKey = "",
  gapPx = 8,
  comfortableMinItemWidth = 96,
  compactMinItemWidth = 76
}: UseBalancedStepperLayoutInput): BalancedStepperLayout {
  const [layout, setLayout] = useState<BalancedStepperLayout>(DEFAULT_LAYOUT);

  useLayoutEffect(() => {
    const containerEl = containerRef.current;
    const measureEl = measureRef.current;

    if (!containerEl || !measureEl) {
      return;
    }

    let frame = 0;

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const containerWidth = Math.floor(containerEl.getBoundingClientRect().width);
        const itemWidths = Array.from(measureEl.children).map((child) =>
          Math.ceil(child.getBoundingClientRect().width)
        );

        const nextLayout = chooseStepperLayout({
          containerWidth,
          itemWidths,
          stepCount,
          gapPx,
          comfortableMinItemWidth,
          compactMinItemWidth
        });

        setLayout((current) =>
          current.columns === nextLayout.columns && current.compact === nextLayout.compact
            ? current
            : nextLayout
        );
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(containerEl);
    observer.observe(measureEl);

    document.fonts?.ready.then(update).catch(() => undefined);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    compactMinItemWidth,
    comfortableMinItemWidth,
    containerRef,
    gapPx,
    measureRef,
    measurementKey,
    stepCount
  ]);

  return layout;
}

export const __internalStepperLayout = {
  chooseStepperLayout
};
