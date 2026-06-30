"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  panelTransition,
  panelVariants,
  reducedMotionTransition
} from "@/lib/motion/tokens";

type MotionPanelProps = ComponentPropsWithoutRef<typeof motion.div> & {
  children: ReactNode;
};

export function MotionPanel({
  children,
  variants,
  transition,
  initial = "initial",
  animate = "animate",
  exit,
  ...props
}: MotionPanelProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={initial}
      animate={animate}
      exit={exit}
      variants={variants ?? panelVariants(reducedMotion)}
      transition={transition ?? (reducedMotion ? reducedMotionTransition : panelTransition)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
