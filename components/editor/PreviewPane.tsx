"use client";

import { motion } from "framer-motion";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { LyricCardPreview } from "@/components/preview/LyricCardPreview";
import type { createT } from "@/lib/i18n";
import { motionDurations, motionEasings, reducedMotionTransition } from "@/lib/motion/tokens";
import type { CardStyle, FontScheme, Locale, SongInfo } from "@/lib/types";

type PreviewPaneProps = {
  isPreviewVisible: boolean;
  onPreviewVisibleChange: (updater: (visible: boolean) => boolean) => void;
  song: SongInfo;
  lyrics: string;
  style: CardStyle;
  cardRef: RefObject<HTMLElement | null>;
  fontSchemePreview: FontScheme | null;
  clearTransitionKey: number;
  measurementKey?: number;
  pressureEnabled?: boolean;
  locale: Locale;
  t: ReturnType<typeof createT>;
};

export function PreviewPane({
  isPreviewVisible,
  onPreviewVisibleChange,
  song,
  lyrics,
  style,
  cardRef,
  fontSchemePreview,
  clearTransitionKey,
  measurementKey = 0,
  pressureEnabled = true,
  locale,
  t
}: PreviewPaneProps) {
  const reduceMotion = useAppReducedMotion();
  const [isDesktopPreview, setIsDesktopPreview] = useState(false);
  // Desktop forces the preview open without overwriting the user's mobile collapse preference.
  const previewExpanded = isPreviewVisible || isDesktopPreview;
  // Font hover/focus preview never mutates the saved card style.
  const previewStyle = fontSchemePreview ? { ...style, fontScheme: fontSchemePreview } : style;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateDesktopPreview = () => setIsDesktopPreview(mediaQuery.matches);

    updateDesktopPreview();
    mediaQuery.addEventListener("change", updateDesktopPreview);

    return () => mediaQuery.removeEventListener("change", updateDesktopPreview);
  }, []);

  return (
    <MotionPanel
      transition={
        reduceMotion
          ? reducedMotionTransition
          : { duration: motionDurations.slow, delay: 0.05, ease: motionEasings.emphasized }
      }
      className="order-1 min-w-0 lg:sticky lg:top-0 lg:z-20 lg:order-2 lg:self-start"
    >
      <button
        type="button"
        onClick={() => onPreviewVisibleChange((visible) => !visible)}
        aria-controls="lyric-card-preview-content"
        aria-expanded={previewExpanded}
        data-testid="preview-pane-toggle"
        className="app-button mb-3 inline-flex h-10 w-full items-center justify-center rounded-lg px-3 text-sm font-semibold transition lg:hidden"
      >
        {isPreviewVisible ? t("step.hidePreview") : t("step.showPreview")}
      </button>
      <motion.div
        id="lyric-card-preview-content"
        data-testid="preview-pane-content"
        className="min-w-0 overflow-hidden lg:overflow-visible"
        initial={false}
        animate={{ height: previewExpanded ? "auto" : 0, opacity: previewExpanded ? 1 : 0 }}
        transition={
          reduceMotion
            ? reducedMotionTransition
            : { duration: motionDurations.normal, ease: motionEasings.standard }
        }
        aria-hidden={!previewExpanded}
      >
        <div>
          <div className="relative min-w-0" data-testid="preview-clear-transition">
            <MotionPresence mode="popLayout">
              {/* Only the visible preview remounts to animate a clear; export hosts remain stable. */}
              <motion.div
                key={`preview-clear-${clearTransitionKey}`}
                data-clear-transition-key={clearTransitionKey}
                initial={reduceMotion ? false : { opacity: 0, x: 72 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: -72 }}
                transition={
                  reduceMotion
                    ? reducedMotionTransition
                    : { duration: motionDurations.slow, ease: motionEasings.emphasized }
                }
              >
                <LyricCardPreview
                  song={song}
                  lyrics={lyrics}
                  style={previewStyle}
                  cardRef={cardRef}
                  locale={locale}
                  sticky={false}
                  t={t}
                  measurementKey={measurementKey}
                  pressureEnabled={pressureEnabled}
                />
              </motion.div>
            </MotionPresence>
          </div>
        </div>
      </motion.div>
    </MotionPanel>
  );
}
