"use client";

import { motion } from "framer-motion";
import { Music2, Save } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { AdaptiveAlbumArtwork } from "@/components/preview/AdaptiveAlbumArtwork";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { createT } from "@/lib/i18n";
import {
  motionDurations,
  motionEasings,
  reducedMotionTransition
} from "@/lib/motion/tokens";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale, SongInfo } from "@/lib/types";

export type SongImportAsideProps = {
  song: SongInfo;
  locale: Locale;
  manualForm: ReactNode;
  manualExpanded: boolean;
  manualRegionId: string;
  t: ReturnType<typeof createT>;
  manualSavePending?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * Companion column for the focused song-search step. The metadata summary and
 * manual editor occupy the same panel so switching modes never appends a second
 * section below the preview.
 */
export function SongImportAside({
  song,
  locale,
  manualForm,
  manualExpanded,
  manualRegionId,
  t,
  manualSavePending = false,
  onSave,
  onCancel
}: SongImportAsideProps) {
  const reduceMotion = useAppReducedMotion();
  const manualEditorRef = useRef<HTMLFormElement | null>(null);
  const coverPreviewHostRef = useRef<HTMLDivElement | null>(null);
  const [coverPreviewBaseSize, setCoverPreviewBaseSize] = useState(320);
  const copy = settingsCopy[locale];
  const coverUrl = song.proxiedCoverUrl || (song.coverUrl ? proxiedImageUrl(song.coverUrl) : "");
  const transition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.slow, ease: motionEasings.emphasized };

  useEffect(() => {
    if (!manualExpanded) return;
    const frame = window.requestAnimationFrame(() => {
      manualEditorRef.current
        ?.querySelector<HTMLInputElement>('input:not([type="file"])')
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [manualExpanded]);

  useEffect(() => {
    const host = coverPreviewHostRef.current;
    if (!host) return;
    const measure = () => setCoverPreviewBaseSize(Math.max(1, Math.round(host.clientWidth)));
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      className="song-import-aside grid h-full min-w-0 content-start gap-4"
      data-testid="song-import-aside"
      aria-label={t("songInfo")}
    >
      <section
        id={manualRegionId}
        role="region"
        className="glass-panel relative h-full min-w-0 overflow-hidden rounded-lg"
        data-song-import-panel="true"
        data-song-info-view={manualExpanded ? "editor" : "summary"}
        aria-label={manualExpanded ? t("manualOverride") : t("songInfo")}
      >
        <MotionPresence initial={false} mode="popLayout">
          {manualExpanded ? (
            <motion.form
              key="song-info-editor"
              ref={manualEditorRef}
              data-testid="song-info-editor"
              className="grid h-full min-w-0 content-start p-4 [&>section]:border-0 [&>section]:pt-0"
              initial={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: 72 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: 72 }}
              transition={transition}
              onSubmit={(event) => {
                event.preventDefault();
                if (!manualSavePending) onSave();
              }}
            >
              {manualForm}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(var(--panel-border))] pt-4">
                <button
                  type="button"
                  data-testid="song-info-cancel"
                  className="app-button control-focus inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold"
                  disabled={manualSavePending}
                  onClick={onCancel}
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  data-testid="song-info-save"
                  disabled={manualSavePending}
                  className="control-variant-primary control-focus control-disabled inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {copy.save}
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.div
              key="song-info-summary"
              data-testid="song-info-summary"
              className="grid h-full min-w-0 content-start p-4"
              initial={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: -72 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: -72 }}
              transition={transition}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="app-text-subtle text-[10px] font-semibold uppercase tracking-[0.16em]">
                    {t("metadata")}
                  </p>
                  <h2 className="app-text-primary mt-1 text-sm font-bold">
                    {t("songInfo")}
                  </h2>
                </div>
              </div>

              <div
                ref={coverPreviewHostRef}
                className="mx-auto flex w-full max-w-80 items-center justify-center min-[960px]:max-w-none"
              >
                {coverUrl ? (
                  <AdaptiveAlbumArtwork
                    sourceUrl={coverUrl}
                    baseSize={coverPreviewBaseSize}
                    maxWidth={coverPreviewBaseSize}
                    maxHeight={coverPreviewBaseSize}
                    borderRadius={8}
                    className="control-surface"
                    testId="song-import-cover"
                  />
                ) : (
                  <div
                    className="control-surface flex items-center justify-center rounded-lg"
                    data-testid="song-import-cover"
                    style={{ width: coverPreviewBaseSize, height: coverPreviewBaseSize }}
                  >
                  <Music2 className="app-text-subtle size-10" aria-hidden="true" />
                  </div>
                )}
              </div>

              <dl className="mt-4 grid min-w-0 gap-3 border-t border-[rgb(var(--panel-border))] pt-4">
                <div className="min-w-0">
                  <dt className="app-text-subtle text-[10px] font-semibold uppercase tracking-[0.14em]">{t("title")}</dt>
                  <dd className="app-text-primary mt-1 truncate text-base font-semibold" title={song.title || t("untitled")}>
                    {song.title || t("untitled")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="app-text-subtle text-[10px] font-semibold uppercase tracking-[0.14em]">{t("artist")}</dt>
                  <dd
                    className="app-text-primary mt-1 truncate text-sm"
                    title={song.artist || t("unknownArtist")}
                  >
                    {song.artist || t("unknownArtist")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="app-text-subtle text-[10px] font-semibold uppercase tracking-[0.14em]">{t("album")}</dt>
                  <dd className="app-text-primary mt-1 truncate text-sm" title={song.album || "—"}>
                    {song.album || "—"}
                  </dd>
                </div>
              </dl>
            </motion.div>
          )}
        </MotionPresence>
      </section>
    </aside>
  );
}
