"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

type UseMeasuredStepperPanelHeightInput = {
  titleRef: RefObject<HTMLElement | null>;
  stepsRef: RefObject<HTMLElement | null>;
  paddingYPx?: number;
  gapPx?: number;
  minimumHeightPx?: number;
};

export function useMeasuredStepperPanelHeight({
  titleRef,
  stepsRef,
  paddingYPx = 32,
  gapPx = 16,
  minimumHeightPx = 180
}: UseMeasuredStepperPanelHeightInput) {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const titleEl = titleRef.current;
    const stepsEl = stepsRef.current;

    if (!titleEl || !stepsEl) {
      return;
    }

    let frame = 0;

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const titleHeight = Math.ceil(titleEl.getBoundingClientRect().height);
        const stepsHeight = Math.ceil(stepsEl.getBoundingClientRect().height);
        const nextHeight = Math.max(
          minimumHeightPx,
          paddingYPx + titleHeight + gapPx + stepsHeight
        );

        setHeight((current) => (current === nextHeight ? current : nextHeight));
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(titleEl);
    observer.observe(stepsEl);

    document.fonts?.ready.then(update).catch(() => undefined);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [gapPx, minimumHeightPx, paddingYPx, stepsRef, titleRef]);

  return height;
}
