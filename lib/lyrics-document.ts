import type { CardLayoutMode, ContentMode } from "@/lib/types";
import { countLyricDocumentLines, type LyricDocumentV2 } from "@/lib/lyrics-document-v2";

export const MAX_EXPORT_LYRIC_LINES = 36;
export const MAX_LANDSCAPE_LYRIC_LINES = 12;

export type ExportLyricLineStatus = {
  originalLineCount: number;
  translationLineCount: number;
  totalLineCount: number;
  maxLineCount: number;
  remainingLineCount: number;
  exceededLineCount: number;
  isExempt: boolean;
  isOverLimit: boolean;
  canExport: boolean;
};

export type ExportLyricLineStatusInput = {
  lyricDocument?: LyricDocumentV2;
  lyrics?: string;
  translationText?: string;
  translationEnabled: boolean;
  contentMode?: ContentMode;
  layoutMode?: CardLayoutMode;
};

/**
 * Counts authored, non-empty lines. Browser wrapping is deliberately irrelevant:
 * only newline-delimited logical lines consume the export allowance.
 */
export function countNonEmptyLogicalLines(text: string) {
  return text
    .split(/\r\n?|\n/)
    .filter((line) => line.trim().length > 0)
    .length;
}

export function getExportLyricLineStatus({
  lyricDocument,
  lyrics = "",
  translationText = "",
  translationEnabled,
  contentMode = "lyrics",
  layoutMode = "portrait"
}: ExportLyricLineStatusInput): ExportLyricLineStatus {
  const documentCounts = lyricDocument
    ? countLyricDocumentLines(lyricDocument, translationEnabled)
    : null;
  const originalLineCount = documentCounts?.source ?? countNonEmptyLogicalLines(lyrics);
  const translationLineCount = documentCounts?.translation ?? (translationEnabled
    ? countNonEmptyLogicalLines(translationText)
    : 0);
  const totalLineCount = originalLineCount + translationLineCount;
  const isExempt = contentMode === "instrumental";
  const maxLineCount = layoutMode === "landscape"
    ? MAX_LANDSCAPE_LYRIC_LINES
    : MAX_EXPORT_LYRIC_LINES;
  const exceededLineCount = isExempt
    ? 0
    : Math.max(0, totalLineCount - maxLineCount);
  const isOverLimit = exceededLineCount > 0;

  return {
    originalLineCount,
    translationLineCount,
    totalLineCount,
    maxLineCount,
    remainingLineCount: isExempt
      ? maxLineCount
      : Math.max(0, maxLineCount - totalLineCount),
    exceededLineCount,
    isExempt,
    isOverLimit,
    canExport: !isOverLimit
  };
}
