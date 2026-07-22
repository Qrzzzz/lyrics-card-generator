"use client";

import { AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

export function MotionPresence({
  children,
  custom,
  initial = false,
  mode = "wait"
}: {
  children: ReactNode;
  custom?: unknown;
  initial?: boolean;
  mode?: "sync" | "popLayout" | "wait";
}) {
  return (
    <AnimatePresence custom={custom} initial={initial} mode={mode}>
      {children}
    </AnimatePresence>
  );
}
