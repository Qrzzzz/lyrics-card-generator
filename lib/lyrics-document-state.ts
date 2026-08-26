import {
  createLyricDocumentV2,
  isLyricDocumentV2,
  reconcileLyricDocumentV2,
  serializeLyricDocument,
  type LyricDocumentV2
} from "@/lib/lyrics-document-v2";
import type { AppState } from "@/lib/types";

type LegacyDocumentState = Omit<AppState, "lyricDocument"> & {
  lyricDocument?: unknown;
};

/**
 * Makes the structured document authoritative and refreshes every temporary
 * 5.x compatibility projection in one place.
 */
export function withLyricDocument(
  current: AppState,
  lyricDocument: LyricDocumentV2,
  translationEnabled = current.translationEnabled
): AppState {
  const plainText = serializeLyricDocument(lyricDocument);
  return {
    ...current,
    lyricDocument,
    lyrics: plainText.source,
    translationText: plainText.translation,
    translationEnabled,
    style: {
      ...current.style,
      translationText: plainText.translation,
      translationEnabled
    }
  };
}

export function withLyricPlainText(
  current: AppState,
  source: string,
  translation: string,
  translationEnabled = current.translationEnabled
) {
  const lyricDocument = reconcileLyricDocumentV2(
    current.lyricDocument,
    source,
    translation
  );
  return withLyricDocument(current, lyricDocument, translationEnabled);
}

export function withLyricSource(current: AppState, source: string) {
  return withLyricPlainText(current, source, current.translationText);
}

export function withLyricTranslation(
  current: AppState,
  translation: string,
  translationEnabled = current.translationEnabled
) {
  return withLyricPlainText(current, current.lyrics, translation, translationEnabled);
}

export function withTranslationEnabled(current: AppState, translationEnabled: boolean) {
  return withLyricDocument(current, current.lyricDocument, translationEnabled);
}

/** Migrates persisted 5.x state once, then canonicalizes every projection. */
export function migrateAppStateLyricsDocument(value: LegacyDocumentState): AppState {
  const lyricDocument = isLyricDocumentV2(value.lyricDocument)
    ? value.lyricDocument
    : createLyricDocumentV2(value.lyrics ?? "", value.translationText ?? value.style.translationText ?? "");
  return withLyricDocument(
    { ...value, lyricDocument } as AppState,
    lyricDocument,
    value.translationEnabled ?? value.style.translationEnabled
  );
}
