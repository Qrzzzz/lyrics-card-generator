"use client";

import type { RefObject } from "react";
import { LyricCard } from "@/components/preview/LyricCard";
import { getCardSize } from "@/lib/card-size";
import type { CardStyle, CoverArtworkAnalysis, Locale, SongInfo } from "@/lib/types";

export type ExportCardHostProps = {
  song: SongInfo;
  lyrics: string;
  style: CardStyle;
  coverArtwork?: CoverArtworkAnalysis;
  exportCardRef: RefObject<HTMLElement | null>;
  locale?: Locale;
  snapshotId?: string;
};

/**
 * Keeps an unscaled export card mounted even when the visible preview is absent.
 * The off-screen positioning belongs to the outer shell so the referenced node
 * can be cloned by html-to-image without inheriting hiding or transform styles.
 */
export function ExportCardHost({
  song,
  lyrics,
  style,
  coverArtwork,
  exportCardRef,
  locale = "en",
  snapshotId
}: ExportCardHostProps) {
  const size = getCardSize(style);

  return (
    <div
      aria-hidden="true"
      inert
      data-export-card-host
      style={{
        position: "fixed",
        left: "-100000px",
        top: 0,
        width: size.width,
        height: size.height,
        pointerEvents: "none"
      }}
    >
      <div
        ref={exportCardRef as RefObject<HTMLDivElement | null>}
        data-export-card-host-content
        data-export-snapshot-id={snapshotId}
        style={{ width: size.width, height: size.height }}
      >
        <LyricCard song={song} lyrics={lyrics} style={style} coverArtwork={coverArtwork} locale={locale} />
      </div>
    </div>
  );
}
