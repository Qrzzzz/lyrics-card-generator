import { getCardSize } from "@/lib/card-size";
import type { AppState, CardStyle, Locale, SongInfo } from "@/lib/types";
import { sanitizeFilePart } from "@/lib/utils";

export type ExportSnapshot = Readonly<{
  id: string;
  revision: number;
  song: Readonly<SongInfo>;
  lyrics: string;
  style: Readonly<CardStyle>;
  locale: Locale;
  pixelRatio: number;
  width: number;
  height: number;
  fileName: string;
}>;

let nextSnapshotId = 0;

export function createExportSnapshot(
  state: AppState,
  pixelRatio: number,
  revision: number
): ExportSnapshot {
  const song = structuredClone(state.song);
  const style = structuredClone(state.style);
  const size = getCardSize(style);
  return deepFreeze({
    id: `export-${++nextSnapshotId}`,
    revision,
    song,
    lyrics: state.lyrics,
    style,
    locale: state.locale,
    pixelRatio,
    width: size.width,
    height: size.height,
    fileName: `lyric-card-${sanitizeFilePart(song.title)}.png`
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
    style: snapshot.style as CardStyle
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
