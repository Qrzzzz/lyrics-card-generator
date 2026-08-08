"use client";

import { motion } from "framer-motion";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { motionDurations, motionEasings, reducedMotionTransition } from "@/lib/motion/tokens";

export type ToastTone = "success" | "warning" | "error";

export type ToastNotice = {
  id: number;
  message: string;
  tone: ToastTone;
};

export type ToastNotifier = (message: string, tone: ToastTone) => void;

export function AppToast({ notice }: { notice: ToastNotice | null }) {
  const reduceMotion = useAppReducedMotion();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[130] flex justify-center px-4">
      <MotionPresence>
        {notice ? (
          <motion.div
            key={notice.id}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="app-toast"
            data-tone={notice.tone}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.8 }}
            transition={
              reduceMotion
                ? reducedMotionTransition
                : { duration: motionDurations.slow, ease: motionEasings.emphasized }
            }
            className="app-toast min-w-0 max-w-[min(34rem,calc(100vw-2rem))] origin-center rounded-2xl border px-4 py-3 text-sm font-medium leading-5 shadow-[0_18px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl will-change-transform"
          >
            {notice.message}
          </motion.div>
        ) : null}
      </MotionPresence>
    </div>
  );
}
