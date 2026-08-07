"use client";

import { MotionConfig, useReducedMotion } from "framer-motion";
import { createContext, useContext, useMemo, type ReactNode } from "react";

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
  const systemPreference = useReducedMotion() ?? false;
  // Either preference may reduce motion, so an app setting never overrides platform accessibility.
  return appPreference || systemPreference;
}

export function useAppMotionReady() {
  return useContext(AppMotionContext).ready;
}
