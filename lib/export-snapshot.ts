import { getCardSize } from "@/lib/card-size";
import { EXPORT_FORMAT_OPTIONS, type ExportFormatId } from "@/lib/settings/types";
import type { AppState, CardStyle, CoverArtworkAnalysis, Locale, SongInfo } from "@/lib/types";
import {
  cloneLyricDocument,
  serializeLyricDocumentSource,
  type LyricDocumentV2
} from "@/lib/lyrics-document-v2";
import { withLyricDocument } from "@/lib/lyrics-document-state";
import { sanitizeFilePart } from "@/lib/utils";
import { createLandscapeMeasurementKey } from "@/lib/landscape-measurement-key";

export type ExportSnapshot = Readonly<{
  id: string;
  revision: number;
  documentRevision: number;
  song: Readonly<SongInfo>;
  lyricDocument: Readonly<LyricDocumentV2>;
  /** @deprecated Compatibility projection; renderers consume lyricDocument. */
  lyrics: string;
  style: Readonly<CardStyle>;
  coverArtwork?: Readonly<CoverArtworkAnalysis>;
  locale: Locale;
  pixelRatio: number;
  format: ExportFormatId;
  width: number;
  height: number;
  fileName: string;
  landscapeMeasurementKey?: string;
}>;

let nextSnapshotId = 0;

/**
 * Clones and freezes all render inputs so edits made while an asynchronous
 * export is mounting cannot change the pixels or filename mid-transaction.
 */
export function createExportSnapshot(
  state: AppState,
  pixelRatio: number,
  revision: number,
  format: ExportFormatId = "png"
): ExportSnapshot {
  const song = structuredClone(state.song);
  const lyricDocument = cloneLyricDocument(state.lyricDocument);
  const style = structuredClone(state.style);
  const coverArtwork = state.coverArtwork ? structuredClone(state.coverArtwork) : undefined;
  const landscapeMeasurementKey = (style.layoutMode ?? "portrait") === "landscape"
    ? createLandscapeMeasurementKey(state)
    : undefined;
  if (landscapeMeasurementKey && style.landscapePlan?.measurementKey !== landscapeMeasurementKey) {
    throw new Error("Landscape layout measurement is stale.");
  }
  const size = getCardSize(style);
  const extension = EXPORT_FORMAT_OPTIONS.find((option) => option.id === format)?.extension ?? "png";
  return deepFreeze({
    id: `export-${++nextSnapshotId}`,
    revision,
    documentRevision: lyricDocument.revision,
    song,
    lyricDocument,
    lyrics: serializeLyricDocumentSource(lyricDocument),
    style,
    coverArtwork,
    locale: state.locale,
    pixelRatio,
    format,
    width: size.width,
    height: size.height,
    fileName: `lyric-card-${sanitizeFilePart(song.title)}.${extension}`,
    landscapeMeasurementKey
  });
}

export function snapshotAsAppState(snapshot: ExportSnapshot, fallback: AppState): AppState {
  return withLyricDocument({
    ...fallback,
    locale: snapshot.locale,
    song: snapshot.song as SongInfo,
    style: snapshot.style as CardStyle,
    coverArtwork: snapshot.coverArtwork as CoverArtworkAnalysis | undefined
  }, snapshot.lyricDocument as LyricDocumentV2, snapshot.style.translationEnabled);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  // The snapshot is cloned before reaching this helper, so recursive freezing
  // cannot mutate live editor state; already-frozen nodes also terminate cycles.
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
