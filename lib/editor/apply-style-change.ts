import { PRESET_CARD_SIZES } from "@/lib/card-size";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { sizeSnapshot } from "@/lib/editor/size-snapshot";
import { normalizeLandscapeLayoutSettings } from "@/lib/landscape-plan";
import { withLyricDocument, withLyricPlainText } from "@/lib/lyrics-document-state";
import type { AppState, CardLayoutMode, CardRatio, CardSizeSnapshot, CardStyle } from "@/lib/types";

export const DEFAULT_PORTRAIT_SIZE: Required<CardSizeSnapshot> = {
  ratio: "custom",
  width: 1040,
  height: 1080,
  autoWidth: true,
  autoHeight: true
};

export const DEFAULT_LANDSCAPE_SIZE: Required<CardSizeSnapshot> = {
  ratio: "custom",
  width: PRESET_CARD_SIZES["16:9"].width,
  height: PRESET_CARD_SIZES["16:9"].height,
  autoWidth: false,
  autoHeight: true
};

export function isDocumentSemanticStyleChange(currentStyle: CardStyle, nextStyle: CardStyle) {
  return currentStyle.contentMode !== nextStyle.contentMode ||
    currentStyle.translationEnabled !== nextStyle.translationEnabled ||
    currentStyle.translationText !== nextStyle.translationText;
}

function applyCanonicalStyleState(current: AppState, style: CardStyle, fields: Partial<AppState> = {}): AppState {
  const next = {
    ...current,
    ...fields,
    style
  };
  return style.translationText === current.translationText
    ? withLyricDocument(next, current.lyricDocument, style.translationEnabled)
    : withLyricPlainText(next, current.lyrics, style.translationText, style.translationEnabled);
}

const validRatiosByMode: Record<CardLayoutMode, ReadonlySet<CardRatio>> = {
  portrait: new Set<CardRatio>(["1:1", "custom"]),
  landscape: new Set<CardRatio>(["custom"])
};

// Persisted size snapshots are mode-specific; invalid cross-mode ratios fall
// back before automatic-sizing flags are restored.
function restoreSize(
  layoutMode: CardLayoutMode,
  savedSize: CardSizeSnapshot | undefined
): Required<CardSizeSnapshot> {
  const fallback = layoutMode === "portrait" ? DEFAULT_PORTRAIT_SIZE : DEFAULT_LANDSCAPE_SIZE;
  const restored = savedSize && validRatiosByMode[layoutMode].has(savedSize.ratio) ? savedSize : fallback;

  return {
    ratio: restored.ratio,
    width: restored.width,
    height: restored.height,
    autoWidth: layoutMode === "portrait" && restored.ratio === "custom" ? (restored.autoWidth ?? false) : false,
    autoHeight: restored.ratio === "custom" ? (restored.autoHeight ?? true) : false
  };
}

export function applyEditorStyleChange(current: AppState, nextStyle: CardStyle): AppState {
  const normalizedNextStyle = normalizeCardStyle({
    ...nextStyle,
    landscapeLayout: normalizeLandscapeLayoutSettings(nextStyle.landscapeLayout, current.lastLandscapeSize)
  });
  const currentMode = current.style.layoutMode ?? "portrait";
  const nextMode = normalizedNextStyle.layoutMode ?? "portrait";

  // Entering instrumental mode saves the lyric layout that will be restored
  // when the user returns to an authored lyric document.
  if (normalizedNextStyle.contentMode === "instrumental") {
    return applyCanonicalStyleState(current, normalizedNextStyle, {
      lastLandscapeSize: currentMode === "landscape" ? sizeSnapshot(current.style) : current.lastLandscapeSize,
      lastPortraitSize: currentMode === "portrait" && current.style.contentMode !== "instrumental"
        ? sizeSnapshot(current.style)
        : current.lastPortraitSize,
      lastPortraitCustomSize: currentMode === "portrait" && current.style.ratio === "custom"
        ? sizeSnapshot(current.style)
        : current.lastPortraitCustomSize
    });
  }

  // Instrumental mode is always square portrait, so leaving it restores the
  // last valid portrait snapshot before applying the remaining style changes.
  if (current.style.contentMode === "instrumental") {
    const restored = restoreSize("portrait", current.lastPortraitSize);
    const canonicalStyle: CardStyle = {
      ...normalizedNextStyle,
      layoutMode: "portrait",
      ratio: restored.ratio,
      width: restored.width,
      height: restored.height,
      autoWidth: restored.autoWidth,
      autoHeight: restored.autoHeight
    };
    return applyCanonicalStyleState(current, canonicalStyle, sizeHistoryFields(current, canonicalStyle));
  }

  if (currentMode !== nextMode) {
    const restored = restoreSize(
      nextMode,
      nextMode === "portrait" ? current.lastPortraitSize : current.lastLandscapeSize
    );

    const canonicalStyle: CardStyle = {
      ...normalizedNextStyle,
      layoutMode: nextMode,
      ratio: restored.ratio,
      width: restored.width,
      height: restored.height,
      autoWidth: restored.autoWidth,
      autoHeight: restored.autoHeight
    };
    return applyCanonicalStyleState(current, canonicalStyle, sizeHistoryFields(current, canonicalStyle));
  }

  if (
    nextMode === "portrait" &&
    current.style.ratio !== "custom" &&
    normalizedNextStyle.ratio === "custom"
  ) {
    const restored = restoreSize("portrait", current.lastPortraitCustomSize);
    const canonicalStyle: CardStyle = {
      ...normalizedNextStyle,
      ratio: "custom",
      width: restored.width,
      height: restored.height,
      autoWidth: restored.autoWidth,
      autoHeight: restored.autoHeight
    };
    return applyCanonicalStyleState(current, canonicalStyle, sizeHistoryFields(current, canonicalStyle));
  }

  if (!validRatiosByMode[nextMode].has(normalizedNextStyle.ratio)) {
    const restored = restoreSize(
      nextMode,
      nextMode === "portrait" ? current.lastPortraitSize : current.lastLandscapeSize
    );
    const canonicalStyle: CardStyle = {
      ...normalizedNextStyle,
      ratio: restored.ratio,
      width: restored.width,
      height: restored.height,
      autoWidth: restored.autoWidth,
      autoHeight: restored.autoHeight
    };

    return applyCanonicalStyleState(current, canonicalStyle, sizeHistoryFields(current, canonicalStyle));
  }

  return applyCanonicalStyleState(current, normalizedNextStyle, sizeHistoryFields(current, normalizedNextStyle));
}

function sizeHistoryFields(current: AppState, canonicalStyle: CardStyle): Partial<AppState> {
  const currentMode = current.style.layoutMode ?? "portrait";
  const nextMode = canonicalStyle.layoutMode ?? "portrait";
  const previousPortraitCustom = currentMode === "portrait" && current.style.ratio === "custom"
    ? sizeSnapshot(current.style)
    : current.lastPortraitCustomSize;

  return {
    lastPortraitSize: nextMode === "portrait"
      ? sizeSnapshot(canonicalStyle)
      : currentMode === "portrait"
        ? sizeSnapshot(current.style)
        : current.lastPortraitSize,
    lastPortraitCustomSize: nextMode === "portrait" && canonicalStyle.ratio === "custom"
      ? sizeSnapshot(canonicalStyle)
      : previousPortraitCustom,
    lastLandscapeSize: nextMode === "landscape"
      ? sizeSnapshot(canonicalStyle)
      : currentMode === "landscape"
        ? sizeSnapshot(current.style)
        : current.lastLandscapeSize
  };
}
