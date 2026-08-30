"use client";

import { motion } from "framer-motion";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { motionDurations, motionEasings, reducedMotionTransition } from "@/lib/motion/tokens";
import type { ToastAnnouncement, ToastNotice } from "@/components/feedback/toast-queue";

export type { ToastNotice, ToastNotifier, ToastTone } from "@/components/feedback/toast-queue";

export function AppToast({
  notices,
  announcement
}: {
  notices: ToastNotice[];
  announcement: ToastAnnouncement | null;
}) {
  const reduceMotion = useAppReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[130] flex flex-col items-center gap-2 px-4"
      data-testid="app-toast-stack"
    >
      <MotionPresence initial={false} mode="popLayout">
        {notices.map((notice) => (
          <motion.div
            key={notice.id}
            layout={reduceMotion ? false : "position"}
            data-testid="app-toast"
            data-tone={notice.tone}
            data-repeat-revision={notice.revision}
            data-duration-ms={notice.durationMs}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.8 }}
            transition={
              reduceMotion
                ? reducedMotionTransition
                : {
                    duration: motionDurations.slow,
                    ease: motionEasings.emphasized,
                    layout: { duration: motionDurations.normal, ease: motionEasings.standard }
                  }
            }
            className="relative min-w-0 max-w-[min(34rem,calc(100vw-2rem))] origin-center will-change-transform"
          >
            <MotionPresence initial={false} mode="popLayout">
              <motion.div
                key={`${notice.id}:${notice.revision}`}
                data-toast-surface-revision={notice.revision}
                data-tone={notice.tone}
                className="app-toast min-w-0 max-w-full overflow-hidden rounded-2xl border px-4 py-3 text-sm font-medium leading-5 shadow-[0_18px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl will-change-transform"
                initial={
                  notice.revision === 0
                    ? false
                    : reduceMotion
                      ? { opacity: 0 }
                      : { x: -24, opacity: 0 }
                }
                animate={{ x: 0, opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
                transition={
                  reduceMotion
                    ? reducedMotionTransition
                    : { duration: motionDurations.normal, ease: motionEasings.emphasized }
                }
              >
                {notice.message}
              </motion.div>
            </MotionPresence>
          </motion.div>
        ))}
      </MotionPresence>
      {announcement ? (
        <span
          key={announcement.id}
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement.message}
        </span>
      ) : null}
    </div>
  );
}
