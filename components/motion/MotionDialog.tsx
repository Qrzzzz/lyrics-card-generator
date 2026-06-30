"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  dialogOverlayVariants,
  dialogPanelVariants,
  motionDurations,
  motionEasings,
  motionSprings,
  opacityTransition,
  reducedMotionTransition
} from "@/lib/motion/tokens";

type MotionDialogOverlayProps = ComponentPropsWithoutRef<typeof motion.div> & {
  children: ReactNode;
};

type MotionDialogPanelProps = ComponentPropsWithoutRef<typeof motion.div> & {
  children: ReactNode;
};

export function MotionDialogOverlay({
  children,
  variants,
  transition,
  initial = "initial",
  animate = "animate",
  exit = "exit",
  ...props
}: MotionDialogOverlayProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={initial}
      animate={animate}
      exit={exit}
      variants={variants ?? dialogOverlayVariants()}
      transition={transition ?? (reducedMotion ? reducedMotionTransition : opacityTransition)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionDialogPanel({
  children,
  variants,
  transition,
  initial = "initial",
  animate = "animate",
  exit = "exit",
  ...props
}: MotionDialogPanelProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={initial}
      animate={animate}
      exit={exit}
      variants={variants ?? dialogPanelVariants(reducedMotion)}
      transition={
        transition ??
        (reducedMotion
          ? reducedMotionTransition
          : { ...motionSprings.dialog, duration: motionDurations.slow, ease: motionEasings.emphasized })
      }
      {...props}
    >
      {children}
    </motion.div>
  );
}
