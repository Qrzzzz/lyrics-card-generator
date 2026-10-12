"use client";

import { MotionConfig } from "framer-motion";
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

const AppMotionContext = createContext({ reduceMotion: false, ready: true });

export function AppMotionProvider({
  reduceMotion,
  ready = true,
  children
}: {
  reduceMotion: boolean;
  ready?: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ reduceMotion, ready }), [ready, reduceMotion]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <AppMotionContext.Provider value={value}>
        {children}
      </AppMotionContext.Provider>
    </MotionConfig>
  );
}

export function useAppReducedMotion() {
  const appPreference = useContext(AppMotionContext).reduceMotion;
  const systemPreference = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  // Either preference may reduce motion, so an app setting never overrides platform accessibility.
  return appPreference || systemPreference;
}

function readReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useAppMotionReady() {
  return useContext(AppMotionContext).ready;
}
