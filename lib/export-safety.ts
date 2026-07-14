import {
  getExportLyricLineStatus,
  type ExportLyricLineStatus
} from "@/lib/lyrics-document";
import type { AppState } from "@/lib/types";
import { MAX_EXPORT_LYRIC_LINES } from "@/lib/lyrics-document";
import type { createT } from "@/lib/i18n";

export type ExportSafetyBlockingReason =
  | "lyrics-limit"
  | "card-unavailable"
  | "fonts-loading"
  | "card-measuring"
  | "content-overflow";

export type ExportDomSafety = {
  isCardMounted: boolean;
  areFontsReady: boolean;
  isCardSizeStable: boolean;
  isAutoWidthStable: boolean;
  isAutoHeightStable: boolean;
  hasContentOverflow: boolean;
};

export function evaluateMinimumExportSafety(state: AppState, dom: ExportDomSafety) {
  const lineStatus = getExportLyricLineStatus({
    lyrics: state.lyrics,
    translationText: state.style.translationText,
    translationEnabled: state.style.translationEnabled,
    contentMode: state.style.contentMode
  });
  return {
    lineStatus,
    blockingReason: resolveBlockingReason(lineStatus, dom)
  };
}

function resolveBlockingReason(
  lineStatus: ExportLyricLineStatus,
  readiness: ExportDomSafety
): ExportSafetyBlockingReason | null {
  if (!lineStatus.canExport) return "lyrics-limit";
  if (!readiness.isCardMounted) return "card-unavailable";
  if (!readiness.areFontsReady) return "fonts-loading";
  if (!readiness.isCardSizeStable || !readiness.isAutoWidthStable || !readiness.isAutoHeightStable) return "card-measuring";
  if (readiness.hasContentOverflow) return "content-overflow";
  return null;
}

export function resolveExportSafetyMessage(
  reason: ExportSafetyBlockingReason,
  totalLineCount: number,
  t: ReturnType<typeof createT>
) {
  switch (reason) {
    case "lyrics-limit":
      return t("lyricsLineLimitExceeded", { total: totalLineCount, max: MAX_EXPORT_LYRIC_LINES });
    case "fonts-loading":
      return t("exportFontsLoading");
    case "card-measuring":
      return t("exportCardMeasuring");
    case "content-overflow":
      return t("exportContentOverflow");
    case "card-unavailable":
    default:
      return t("exportCardUnavailable");
  }
}
