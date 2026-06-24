import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { AppState } from "@/lib/types";

export function clearLyricContent(current: AppState): AppState {
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
