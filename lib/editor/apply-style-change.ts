import { PRESET_CARD_SIZES } from "@/lib/card-size";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { sizeSnapshot } from "@/lib/editor/size-snapshot";
import type { AppState, CardLayoutMode, CardRatio, CardSizeSnapshot, CardStyle } from "@/lib/types";

export const DEFAULT_PORTRAIT_SIZE: Required<CardSizeSnapshot> = {
  ratio: "custom",
  width: 1040,
  height: 1080,
  autoHeight: true
};

export const DEFAULT_LANDSCAPE_SIZE: Required<CardSizeSnapshot> = {
  ratio: "16:9",
  width: PRESET_CARD_SIZES["16:9"].width,
  height: PRESET_CARD_SIZES["16:9"].height,
  autoHeight: false
};

export function isDocumentSemanticStyleChange(currentStyle: CardStyle, nextStyle: CardStyle) {
  return currentStyle.contentMode !== nextStyle.contentMode ||
    currentStyle.translationEnabled !== nextStyle.translationEnabled ||
    currentStyle.translationText !== nextStyle.translationText;
}

function applyCanonicalStyleState(current: AppState, style: CardStyle, fields: Partial<AppState> = {}): AppState {
  return {
    ...current,
    ...fields,
    translationText: style.translationText,
    translationEnabled: style.translationEnabled,
    style
  };
}

const validRatiosByMode: Record<CardLayoutMode, ReadonlySet<CardRatio>> = {
  portrait: new Set<CardRatio>(["1:1", "custom"]),
  landscape: new Set<CardRatio>(["16:9", "21:9", "3:2", "custom"])
};

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
    autoHeight: restored.ratio === "custom" ? (restored.autoHeight ?? true) : false
  };
}

export function applyEditorStyleChange(current: AppState, nextStyle: CardStyle): AppState {
  const normalizedNextStyle = normalizeCardStyle(nextStyle);
  const currentMode = current.style.layoutMode ?? "portrait";
  const nextMode = normalizedNextStyle.layoutMode ?? "portrait";

  if (normalizedNextStyle.contentMode === "instrumental") {
    return applyCanonicalStyleState(current, normalizedNextStyle, {
      lastLandscapeSize: currentMode === "landscape" ? sizeSnapshot(current.style) : current.lastLandscapeSize,
      lastPortraitSize: sizeSnapshot(normalizedNextStyle)
    });
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
      autoHeight: restored.autoHeight
    };
    return applyCanonicalStyleState(current, canonicalStyle, {
      lastPortraitSize: currentMode === "portrait" ? sizeSnapshot(current.style) : current.lastPortraitSize,
      lastLandscapeSize: currentMode === "landscape" ? sizeSnapshot(current.style) : current.lastLandscapeSize
    });
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
      autoHeight: restored.autoHeight
    };

    return applyCanonicalStyleState(current, canonicalStyle, {
      lastPortraitSize: nextMode === "portrait" ? sizeSnapshot(canonicalStyle) : current.lastPortraitSize,
      lastLandscapeSize: nextMode === "landscape" ? sizeSnapshot(canonicalStyle) : current.lastLandscapeSize
    });
  }

  return applyCanonicalStyleState(current, normalizedNextStyle, {
    lastPortraitSize: nextMode === "portrait" ? sizeSnapshot(normalizedNextStyle) : current.lastPortraitSize,
    lastLandscapeSize: nextMode === "landscape" ? sizeSnapshot(normalizedNextStyle) : current.lastLandscapeSize
  });
}
