import { normalizeLandscapeLayoutSettings } from "@/lib/landscape-plan";
import type { AppState } from "@/lib/types";

/** Semantic identity for the DOM measurements that produced a landscape plan. */
export function createLandscapeMeasurementKey(state: AppState) {
  const style = state.style;
  return JSON.stringify({
    version: 1,
    layoutMode: style.layoutMode ?? "portrait",
    contentMode: style.contentMode,
    lyrics: state.lyrics,
    translationEnabled: style.translationEnabled,
    translationText: style.translationText,
    font: style.font,
    fontScheme: style.fontScheme,
    customFontEnabled: style.customFontEnabled,
    customFontFamily: style.customFontFamily,
    customFontWeight: style.customFontWeight,
    customFontStyle: style.customFontStyle,
    lyricFontSize: style.lyricFontSize,
    translationScale: style.translationScale,
    lineHeight: style.lineHeight,
    align: style.align,
    landscapeLayout: normalizeLandscapeLayoutSettings(style.landscapeLayout, state.lastLandscapeSize),
    song: {
      title: state.song.title,
      artist: state.song.artist,
      album: state.song.album,
      explicit: state.song.explicit,
      source: state.song.source,
      cover: state.song.proxiedCoverUrl || state.song.coverUrl
    },
    coverArtwork: state.coverArtwork,
    showAlbumName: style.showAlbumName,
    showPlatformBadge: style.showPlatformBadge,
    showSharedBy: style.showSharedBy,
    sharedByText: style.sharedByText,
    showGeneratedWatermark: style.showGeneratedWatermark ?? style.showWatermark
  });
}

export function hasCurrentLandscapePlan(state: AppState) {
  return (state.style.layoutMode ?? "portrait") !== "landscape" ||
    state.style.landscapePlan?.measurementKey === createLandscapeMeasurementKey(state);
}
