"use client";

import { motion } from "framer-motion";
import type { RefObject } from "react";
import { FontSchemePreviewPanel } from "@/components/editor/font-scheme/FontSchemePreviewPanel";
import { LyricCardPreview } from "@/components/preview/LyricCardPreview";
import { getEffectiveFontScheme } from "@/lib/fonts";
import type { createT } from "@/lib/i18n";
import type { CardStyle, FontScheme, Locale, SongInfo } from "@/lib/types";

type PreviewPaneProps = {
  isPreviewVisible: boolean;
  onPreviewVisibleChange: (updater: (visible: boolean) => boolean) => void;
  song: SongInfo;
  lyrics: string;
  style: CardStyle;
  cardRef: RefObject<HTMLElement | null>;
  fontSchemePreview: FontScheme | null;
  showFontSchemePreview: boolean;
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
  showFontSchemePreview,
  locale,
  t
}: PreviewPaneProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="order-1 min-w-0 lg:order-2"
    >
      <button
        type="button"
        onClick={() => onPreviewVisibleChange((visible) => !visible)}
        className="app-button mb-3 inline-flex h-10 w-full items-center justify-center rounded-lg px-3 text-sm font-semibold transition lg:hidden"
      >
        {isPreviewVisible ? t("step.hidePreview") : t("step.showPreview")}
      </button>
      <div className={`min-w-0 overflow-hidden transition-all duration-300 lg:max-h-none lg:overflow-visible ${isPreviewVisible ? "max-h-[3000px]" : "max-h-0"}`}>
        <div className="grid gap-5">
          <LyricCardPreview
            song={song}
            lyrics={lyrics}
            style={style}
            cardRef={cardRef}
            locale={locale}
            sticky={!showFontSchemePreview}
            t={t}
          />
          {showFontSchemePreview ? (
            <FontSchemePreviewPanel scheme={fontSchemePreview ?? getEffectiveFontScheme(style)} t={t} />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
