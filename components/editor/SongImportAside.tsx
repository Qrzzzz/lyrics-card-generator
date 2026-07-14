"use client";

import { Music2 } from "lucide-react";
import type { ReactNode } from "react";
import { proxiedImageUrl } from "@/lib/image-utils";
import type { createT } from "@/lib/i18n";
import type { SongInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SongImportAsideProps = {
  song: SongInfo;
  manualForm: ReactNode;
  manualExpanded: boolean;
  manualRegionId: string;
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
  manualRegionId,
  t
}: SongImportAsideProps) {
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
          <div
            id={manualRegionId}
            role="region"
            aria-label={t("manualOverride")}
            hidden={!manualExpanded}
            className={cn(
              "mt-4 gap-3 border-t border-[rgb(var(--panel-border))] pt-4 [&>section]:border-0 [&>section]:pt-0",
              manualExpanded ? "grid" : "hidden"
            )}
          >
            {manualForm}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
