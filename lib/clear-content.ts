import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { AppState } from "@/lib/types";

export function hasClearableLyricContent(current: AppState) {
  const song = current.song;

  return Boolean(
    current.url.trim() ||
      current.lyrics.trim() ||
      current.translationText.trim() ||
      current.translationEnabled ||
      current.paletteWarning?.trim() ||
      current.style.translationText.trim() ||
      current.style.translationEnabled ||
      song.source !== "unknown" ||
      song.explicit ||
      song.title.trim() ||
      song.artist.trim() ||
      song.album?.trim() ||
      song.originalCoverUrl?.trim() ||
      song.coverUrl?.trim() ||
      song.proxiedCoverUrl?.trim() ||
      song.originalUrl?.trim() ||
      song.finalUrl?.trim() ||
      song.parseMethod?.trim()
  );
}

export function clearLyricContent(current: AppState): AppState {
  // Song content is duplicated in top-level and style fields; reset both in one
  // state transition while leaving layout and user preferences intact.
  return {
    ...current,
    url: "",
    song: {
      source: "unknown",
      title: "",
      artist: "",
      album: "",
      originalCoverUrl: "",
      coverUrl: "",
      proxiedCoverUrl: "",
      originalUrl: ""
    },
    lyrics: "",
    translationText: "",
    translationEnabled: false,
    palette: DEFAULT_PALETTE,
    paletteWarning: "",
    style: {
      ...current.style,
      extractedPalette: DEFAULT_PALETTE,
      translationEnabled: false,
      translationText: ""
    }
  };
}
