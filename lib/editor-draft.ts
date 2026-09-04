import type { ImportHistoryManualSnapshot } from "@/lib/import-history";
import type { AppState, CardSizeSnapshot, CardStyle, SongInfo } from "@/lib/types";
import type { ExportFormatId, ExportQualityId } from "@/lib/settings/types";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { withLyricDocument } from "@/lib/lyrics-document-state";
import { proxiedImageUrl } from "@/lib/image-utils";

export type AutosaveStatus = "loading" | "idle" | "pending" | "saving" | "saved" | "error" | "disabled";
export type EditorDraftView = {
  step: number;
  exportFormat: ExportFormatId;
  exportQuality: ExportQualityId;
  songInfoDraft?: SongInfo;
};
export type EditorDraftSnapshot = {
  version: 1;
  content: ImportHistoryManualSnapshot;
  style: Omit<CardStyle, "extractedPalette" | "landscapePlan" | "translationText" | "translationEnabled">;
  lastPortraitSize?: CardSizeSnapshot;
  lastPortraitCustomSize?: CardSizeSnapshot;
  lastLandscapeSize?: CardSizeSnapshot;
  view: EditorDraftView;
  coverAsset?: string;
  formCoverAsset?: string;
};
export type EditorDraftLease = { recordId: string; token: string };
export type EditorDraftLoad = {
  recordId: string;
  snapshot: EditorDraftSnapshot;
  coverDataUrl?: string;
  formCoverDataUrl?: string;
  recovered?: boolean;
};

/** Measurement/color caches may settle after an edit, but are not new user edits. */
export function editorDraftChangeKey(snapshot: EditorDraftSnapshot): string {
  const style: Partial<EditorDraftSnapshot["style"]> = { ...snapshot.style };
  delete style.resolvedTextColor;
  // Locale changes refresh the inactive default label without editing the card.
  if (style.contentMode !== "instrumental") delete style.instrumentalText;
  if (style.autoWidth) delete style.width;
  if (style.autoHeight) delete style.height;
  return JSON.stringify({ ...snapshot, style });
}

/** Persist authored inputs, not measured geometry, proxy URLs, or analysis caches. */
export function createEditorDraftSnapshot(state: AppState, view: EditorDraftView): EditorDraftSnapshot {
  const style = { ...state.style };
  delete style.extractedPalette;
  delete style.landscapePlan;
  const { translationText: _text, translationEnabled: _enabled, ...authoredStyle } = style;
  void _text;
  void _enabled;
  return {
    version: 1,
    content: {
      source: state.song.source, title: state.song.title, artist: state.song.artist,
      album: state.song.album, explicit: state.song.explicit,
      originalCoverUrl: state.song.originalCoverUrl, coverUrl: state.song.coverUrl,
      originalUrl: state.song.originalUrl, finalUrl: state.song.finalUrl, parseMethod: state.song.parseMethod,
      lyrics: state.lyrics, translationText: state.translationText,
      translationEnabled: state.translationEnabled, lyricDocument: state.lyricDocument
    },
    style: authoredStyle,
    lastPortraitSize: state.lastPortraitSize,
    lastPortraitCustomSize: state.lastPortraitCustomSize,
    lastLandscapeSize: state.lastLandscapeSize,
    view: { ...view, songInfoDraft: view.songInfoDraft ? { ...view.songInfoDraft, proxiedCoverUrl: undefined } : undefined }
  };
}

export function restoreEditorDraft(current: AppState, loaded: EditorDraftLoad): AppState {
  const { snapshot } = loaded;
  const coverUrl = loaded.coverDataUrl || snapshot.content.coverUrl || snapshot.content.originalCoverUrl || "";
  return withLyricDocument({
    ...current,
    url: snapshot.content.finalUrl || snapshot.content.originalUrl || "",
    song: { ...snapshot.content, coverUrl, proxiedCoverUrl: proxiedImageUrl(coverUrl) },
    style: normalizeCardStyle({ ...current.style, ...snapshot.style }),
    lastPortraitSize: snapshot.lastPortraitSize,
    lastPortraitCustomSize: snapshot.lastPortraitCustomSize,
    lastLandscapeSize: snapshot.lastLandscapeSize,
    palette: undefined, paletteWarning: "", coverArtwork: undefined
  }, snapshot.content.lyricDocument!, snapshot.content.translationEnabled);
}

export function draftHasContent(snapshot: EditorDraftSnapshot) {
  const song = snapshot.view.songInfoDraft ?? snapshot.content;
  return Boolean(song.title.trim() || song.artist.trim() || song.album?.trim() || song.coverUrl ||
    snapshot.content.lyrics.length || snapshot.content.translationText.length ||
    snapshot.style.contentMode === "instrumental");
}
