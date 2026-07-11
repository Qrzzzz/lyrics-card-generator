"use client";

import { Info } from "lucide-react";
import { motion } from "framer-motion";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { motionDurations, motionEasings, reducedMotionTransition } from "@/lib/motion/tokens";

export type ToastNotice = {
  id: number;
  message: string;
};

export function AppToast({ notice, accentColor }: { notice: ToastNotice | null; accentColor: string }) {
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
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            transition={
              reduceMotion
                ? reducedMotionTransition
                : { duration: motionDurations.normal, ease: motionEasings.emphasized }
            }
            className="status-info relative flex min-w-0 max-w-[min(34rem,calc(100vw-2rem))] items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 pr-5 text-sm font-medium shadow-[0_18px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-xl border"
              style={{
                borderColor: `color-mix(in srgb, ${accentColor} 34%, rgb(var(--status-info-border)))`,
                backgroundColor: `color-mix(in srgb, ${accentColor} 14%, transparent)`,
                color: accentColor
              }}
            >
              <Info className="size-4" strokeWidth={2.1} />
            </span>
            <span className="min-w-0 leading-5">{notice.message}</span>
            <motion.span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left"
              style={{ backgroundColor: accentColor }}
              initial={{ scaleX: 1 }}
              animate={reduceMotion ? { scaleX: 1 } : { scaleX: 0 }}
              transition={reduceMotion ? reducedMotionTransition : { duration: 3.6, ease: "linear" }}
            />
          </motion.div>
        ) : null}
      </MotionPresence>
    </div>
  );
}
