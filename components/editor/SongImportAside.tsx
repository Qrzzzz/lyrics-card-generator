"use client";

import { ChevronDown, Music2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { createT } from "@/lib/i18n";
import type { SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SongImportAsideProps = {
  song: SongInfo;
  manualForm: ReactNode;
  manualExpanded: boolean;
  onManualExpandedChange: (expanded: boolean) => void;
  t: ReturnType<typeof createT>;
};

/**
 * Companion column for the focused song-search step. It keeps the selected
 * song artwork and metadata separate from the import methods in the main
 * column while preserving the existing manual editor.
 */
export function SongImportAside({
  song,
  manualForm,
  manualExpanded,
  onManualExpandedChange,
  t
}: SongImportAsideProps) {
  const manualRegionId = useId();
  const coverUrl = song.proxiedCoverUrl || (song.coverUrl ? proxiedImageUrl(song.coverUrl) : "");

  return (
    <aside
      className="song-import-aside grid h-full min-w-0 content-start gap-4"
      data-testid="song-import-aside"
      aria-label={t("songInfo")}
    >
      <section
        className="glass-panel grid h-full min-w-0 content-start rounded-lg p-4"
        data-song-import-panel="true"
        aria-labelledby={`${manualRegionId}-summary-title`}
      >
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

        <div
          className="control-surface relative mx-auto flex aspect-square w-full max-w-80 items-center justify-center overflow-hidden rounded-lg min-[960px]:max-w-none"
          data-testid="song-import-cover"
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <Music2 className="app-text-subtle size-10" aria-hidden="true" />
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

        {manualForm ? (
          <div className="mt-4 border-t border-[rgb(var(--panel-border))] pt-4">
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
