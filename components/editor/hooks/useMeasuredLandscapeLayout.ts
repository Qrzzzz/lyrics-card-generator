"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { createLandscapeLayoutPlan, normalizeLandscapeLayoutSettings } from "@/lib/landscape-plan";
import { measureLandscapeLayoutHost } from "@/lib/landscape-plan-dom";
import { createLandscapeMeasurementKey } from "@/lib/landscape-measurement-key";
import type { AppState, LandscapeLayoutPlan } from "@/lib/types";

export type LandscapeLayoutReadiness = {
  isEnabled: boolean;
  isStable: boolean;
  isMeasuring: boolean;
  plan: LandscapeLayoutPlan | null;
};

export function useMeasuredLandscapeLayout(
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>,
  hostRef: RefObject<HTMLElement | null>
): LandscapeLayoutReadiness {
  const enabled = (state.style.layoutMode ?? "portrait") === "landscape" && state.style.contentMode === "lyrics";
  const signature = useMemo(() => createLandscapeMeasurementKey(state), [state]);
  const [evaluatedKey, setEvaluatedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let frame = 0;
    const run = async () => {
      if (document.fonts) await document.fonts.ready;
      await nextFrame();
      await nextFrame();
      if (!active) return;
      const host = hostRef.current;
      const measurement = host ? measureLandscapeLayoutHost(host) : null;
      if (!measurement) return;
      const plan = createLandscapeLayoutPlan({
        measurementKey: signature,
        settings: normalizeLandscapeLayoutSettings(state.style.landscapeLayout, state.lastLandscapeSize),
        ...measurement
      });
      if (!plan || !active) return;
      setEvaluatedKey(signature);
      setState((current) => {
        if (createLandscapeMeasurementKey(current) !== signature) return current;
        if (samePlan(current.style.landscapePlan, plan)) return current;
        return { ...current, style: { ...current.style, landscapePlan: plan } };
      });
    };
    frame = requestAnimationFrame(() => void run());
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [enabled, hostRef, setState, signature, state.lastLandscapeSize, state.style.landscapeLayout]);

  if (!enabled) return { isEnabled: false, isStable: true, isMeasuring: false, plan: null };
  const plan = state.style.landscapePlan?.measurementKey === signature ? state.style.landscapePlan : null;
  const isStable = Boolean(plan && evaluatedKey === signature);
  return { isEnabled: true, isStable, isMeasuring: !isStable, plan };
}

function samePlan(left: LandscapeLayoutPlan | undefined, right: LandscapeLayoutPlan) {
  return Boolean(left && JSON.stringify(left) === JSON.stringify(right));
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
