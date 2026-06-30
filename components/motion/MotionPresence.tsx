"use client";

import { AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

export function MotionPresence({
  children,
  initial = false,
  mode = "wait"
}: {
  children: ReactNode;
  initial?: boolean;
  mode?: "sync" | "popLayout" | "wait";
}) {
  return (
    <AnimatePresence initial={initial} mode={mode}>
      {children}
    </AnimatePresence>
  );
}
