import { getCardSize } from "@/lib/card-size";
import { EXPORT_FORMAT_OPTIONS, type ExportFormatId } from "@/lib/settings/types";
import type { AppState, CardStyle, CoverArtworkAnalysis, Locale, SongInfo } from "@/lib/types";
import { sanitizeFilePart } from "@/lib/utils";
import { createLandscapeMeasurementKey } from "@/lib/landscape-measurement-key";

export type ExportSnapshot = Readonly<{
  id: string;
  revision: number;
  song: Readonly<SongInfo>;
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
    song,
    lyrics: state.lyrics,
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
  return {
    ...fallback,
    locale: snapshot.locale,
    song: snapshot.song as SongInfo,
    lyrics: snapshot.lyrics,
    translationText: snapshot.style.translationText,
    translationEnabled: snapshot.style.translationEnabled,
    style: snapshot.style as CardStyle,
    coverArtwork: snapshot.coverArtwork as CoverArtworkAnalysis | undefined
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  // The snapshot is cloned before reaching this helper, so recursive freezing
  // cannot mutate live editor state; already-frozen nodes also terminate cycles.
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
