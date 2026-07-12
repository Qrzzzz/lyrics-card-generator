"use client";

import { ChevronDown, Music2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { createT } from "@/lib/i18n";
import type { SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SongImportAsideProps = {
  song: SongInfo;
  linkParser: ReactNode;
  localAudioParser: ReactNode;
  manualForm: ReactNode;
  manualExpanded: boolean;
  onManualExpandedChange: (expanded: boolean) => void;
  t: ReturnType<typeof createT>;
};

/**
 * Compact companion column for the focused song-search step.
 *
 * Parser nodes are injected so their existing state, handlers and mount
 * behaviour stay owned by the editor step that creates them.
 */
export function SongImportAside({
  song,
  linkParser,
  localAudioParser,
  manualForm,
  manualExpanded,
  onManualExpandedChange,
  t
}: SongImportAsideProps) {
  const manualRegionId = useId();
  const coverUrl = song.proxiedCoverUrl || (song.coverUrl ? proxiedImageUrl(song.coverUrl) : "");

  return (
    <aside
      className="song-import-aside grid min-w-0 content-start gap-4"
      data-testid="song-import-aside"
      aria-label={t("songSearchOtherMethods")}
    >
      <section className="glass-panel rounded-lg p-4" aria-labelledby={`${manualRegionId}-summary-title`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="app-text-subtle text-[10px] font-semibold uppercase tracking-[0.16em]">
              {t("metadata")}
            </p>
            <h2 id={`${manualRegionId}-summary-title`} className="app-text-primary mt-1 text-sm font-bold">
              {t("songInfo")}
            </h2>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <div className="control-surface relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt=""
                className="absolute inset-0 size-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <Music2 className="app-text-subtle size-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="app-text-primary truncate text-sm font-semibold" title={song.title || t("untitled")}>
              {song.title || t("untitled")}
            </p>
            <p
              className="app-text-subtle mt-0.5 truncate text-xs"
              title={song.artist || t("unknownArtist")}
            >
              {song.artist || t("unknownArtist")}
            </p>
            {song.album ? (
              <p className="app-text-subtle mt-0.5 truncate text-[11px]" title={song.album}>
                {song.album}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-lg p-4" aria-labelledby={`${manualRegionId}-methods-title`}>
        <div className="mb-4">
          <p className="app-text-subtle text-[10px] font-semibold uppercase tracking-[0.16em]">
            {t("metadata")}
          </p>
          <h2 id={`${manualRegionId}-methods-title`} className="app-text-primary mt-1 text-sm font-bold">
            {t("songSearchOtherMethods")}
          </h2>
        </div>

        <div className="song-import-aside__methods grid gap-4 [&>section]:border-0 [&>section]:pt-0">
          {linkParser}
          {localAudioParser}
        </div>

        {manualForm ? (
          <div className="mt-4 border-t border-[rgb(var(--panel-border))] pt-3">
            <button
              type="button"
              onClick={() => onManualExpandedChange(!manualExpanded)}
              aria-expanded={manualExpanded}
              aria-controls={manualRegionId}
              className="control-focus app-button flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-semibold"
            >
              <span>{t("manualOverride")}</span>
              <ChevronDown
                className={cn("size-4 shrink-0 transition-transform", manualExpanded && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {manualExpanded ? (
              <div
                id={manualRegionId}
                className="mt-4 grid gap-3 [&>section]:border-0 [&>section]:pt-0"
              >
                {manualForm}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
