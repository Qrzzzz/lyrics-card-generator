"use client";

import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useAppMotionReady, useAppReducedMotion } from "@/components/motion/AppMotionProvider";
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
  const reducedMotion = useAppReducedMotion();
  const motionReady = useAppMotionReady();

  // Hold the initial state until persisted motion preferences load to avoid a startup animation flash.
  return (
    <motion.div
      initial={motionReady ? initial : false}
      animate={motionReady ? animate : "initial"}
      exit={exit}
      variants={variants ?? panelVariants(motionReady ? reducedMotion : false)}
      transition={!motionReady ? reducedMotionTransition : transition ?? (reducedMotion ? reducedMotionTransition : panelTransition)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
