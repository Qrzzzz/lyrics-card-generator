import {
  serializeLyricDocument,
  swapLyricDocumentColumns,
  type LyricDocumentV2
} from "@/lib/lyrics-document-v2";

export type LyricsWorkbenchEditor = "lyrics" | "translation";
export type LyricsSidebarTab = "cleanup" | "translation";

export type LyricsTextSelection = {
  start: number;
  end: number;
};

export type LyricsTextScope = {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  hasSelection: boolean;
  text: string;
};

export type LyricsTransformStats = {
  removedLines?: number;
  removedCharacters?: number;
  replacements?: number;
  timestamps?: number;
  metadata?: number;
  trailingWhitespaceLines?: number;
  whitespaceOnlyLines?: number;
  newlineChanges?: number;
  invisibleCharacters?: number;
  mergedLines?: number;
  tags?: Array<{ line: number; text: string }>;
};

export type LyricsScopedTransform = {
  text: string;
  changed: boolean;
  selection: LyricsTextSelection;
  scope: LyricsTextScope;
  stats: LyricsTransformStats;
};

export type LyricsBlankMode = "trim" | "collapse" | "all";

export type LyricsDocumentSnapshot = {
  lyricDocument: LyricDocumentV2;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
};

export type LyricsSelectionSnapshot = LyricsTextSelection & {
  editor: LyricsWorkbenchEditor;
};

export type LyricsHistoryEntry = {
  label: string;
  before: LyricsDocumentSnapshot;
  after: LyricsDocumentSnapshot;
  beforeSelection: LyricsSelectionSnapshot;
  afterSelection: LyricsSelectionSnapshot;
};

export type LyricsOperationHistory = {
  past: LyricsHistoryEntry[];
  future: LyricsHistoryEntry[];
};

export type LyricsIssueKind = "long-line" | "duplicate-line" | "invisible-character";

export type LyricsIssue = {
  id: string;
  kind: LyricsIssueKind;
  editor: LyricsWorkbenchEditor;
  line: number;
  excerpt: string;
  count: number;
};

export type LyricsDocumentAnalysis = {
  originalLineCount: number;
  translationLineCount: number;
  lineDifference: number;
  firstUnpairedLine: number | null;
  issues: LyricsIssue[];
};

const INVISIBLE_CHARACTER_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/gu;
const PARAGRAPH_TAG_PATTERN = /^\s*[\[(（【]\s*(?:(?:pre[-\s]?)?chorus|verse|bridge|intro|outro|hook|refrain|interlude|instrumental|solo|break|repeat|couplet|pont|estribillo|verso|coro|puente|introducci[oó]n|主歌|副歌|预副歌|導歌|导歌|前奏|间奏|間奏|桥段|橋段|尾奏|独奏|獨奏|合唱|ヴァース|コーラス|ブリッジ|イントロ|アウトロ|サビ|[ABCＡＢＣ]メロ)(?:\s*(?:\d+|[一二三四五六七八九十]+))?(?:\s*[:：-]\s*[^)\]）】]{1,40})?\s*[\])）】]\s*$/iu;
const LRC_METADATA_PATTERN = /^\s*\[(?:ar|ti|al|by|offset|re|ve|length|tool|au):[^\]]*\]\s*$/iu;
const LRC_TIMESTAMP_PREFIX_PATTERN = /^(?:\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+/u;
const HISTORY_LIMIT = 20;

/**
 * Expands a non-empty selection to complete logical lines. With no selection,
 * workbench commands intentionally target the entire editor document.
 */
export function resolveLyricsTextScope(
  text: string,
  selection: LyricsTextSelection
): LyricsTextScope {
  const start = clamp(Math.min(selection.start, selection.end), 0, text.length);
  const end = clamp(Math.max(selection.start, selection.end), start, text.length);
  const hasSelection = end > start;

  if (!hasSelection) {
    return {
      start: 0,
      end: text.length,
      startLine: 1,
      endLine: Math.max(1, countEditorLines(text)),
      hasSelection: false,
      text
    };
  }

  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const inclusiveEnd = Math.max(start, end - 1);
  const nextBreak = text.indexOf("\n", inclusiveEnd);
  const rawLineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lineEnd = rawLineEnd > lineStart && text[rawLineEnd - 1] === "\r"
    ? rawLineEnd - 1
    : rawLineEnd;

  return {
    start: lineStart,
    end: lineEnd,
    startLine: lineNumberAt(text, lineStart),
    endLine: lineNumberAt(text, inclusiveEnd),
    hasSelection: true,
    text: text.slice(lineStart, lineEnd)
  };
}

/** Keeps the exact browser selection and removes everything outside it. */
export function keepSelectedLyricsText(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  const start = clamp(Math.min(selection.start, selection.end), 0, text.length);
  const end = clamp(Math.max(selection.start, selection.end), start, text.length);
  const hasSelection = end > start;
  if (!hasSelection) {
    const scope = resolveLyricsTextScope(text, { start, end });
    return unchangedScopedTransform(text, { start, end }, scope, { removedCharacters: 0 });
  }

  const selectedText = text.slice(start, end);
  const scope: LyricsTextScope = {
    start,
    end,
    startLine: lineNumberAt(text, start),
    endLine: lineNumberAt(text, Math.max(start, end - 1)),
    hasSelection: true,
    text: selectedText
  };
  return {
    text: selectedText,
    changed: start > 0 || end < text.length,
    selection: { start: 0, end: selectedText.length },
    scope,
    stats: { removedCharacters: text.length - selectedText.length }
  };
}

export function trimBoundaryBlankLines(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  return applyScopedTransform(text, selection, (source) => {
    const lines = normalizeNewlines(source).split("\n");
    let start = 0;
    let end = lines.length;
    while (start < end && isBlank(lines[start])) start += 1;
    while (end > start && isBlank(lines[end - 1])) end -= 1;
    return {
      text: lines.slice(start, end).join("\n"),
      stats: { removedLines: start + (lines.length - end) }
    };
  });
}

export function collapseConsecutiveBlankLines(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  return applyScopedTransform(text, selection, (source) => {
    const lines = normalizeNewlines(source).split("\n");
    const next: string[] = [];
    let previousWasBlank = false;
    let removedLines = 0;

    for (const line of lines) {
      const blank = isBlank(line);
      if (blank && previousWasBlank) {
        removedLines += 1;
        continue;
      }
      next.push(blank ? "" : line);
      previousWasBlank = blank;
    }

    return { text: next.join("\n"), stats: { removedLines } };
  });
}

export function removeAllBlankLines(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  return applyScopedTransform(text, selection, (source) => {
    const lines = normalizeNewlines(source).split("\n");
    const next = lines.filter((line) => !isBlank(line));
    return {
      text: next.join("\n"),
      stats: { removedLines: lines.length - next.length }
    };
  });
}

export function cleanPastedLyrics(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  return applyScopedTransform(text, selection, (source) => {
    const newlineChanges = source.match(/\r/gu)?.length ?? 0;
    const normalized = normalizeNewlines(source);
    const lines = normalized.split("\n");
    let trailingWhitespaceLines = 0;
    let whitespaceOnlyLines = 0;
    let invisibleCharacters = 0;

    const next = lines.map((line) => {
      const invisibleMatches = line.match(INVISIBLE_CHARACTER_PATTERN);
      invisibleCharacters += invisibleMatches?.length ?? 0;
      let cleaned = line.replace(INVISIBLE_CHARACTER_PATTERN, "");
      if (cleaned.trim().length === 0 && cleaned.length > 0) {
        whitespaceOnlyLines += 1;
        cleaned = "";
      } else if (/[ \t\u00A0]+$/u.test(cleaned)) {
        trailingWhitespaceLines += 1;
        cleaned = cleaned.replace(/[ \t\u00A0]+$/u, "");
      }
      return cleaned;
    });

    return {
      text: next.join("\n"),
      stats: {
        newlineChanges,
        trailingWhitespaceLines,
        whitespaceOnlyLines,
        invisibleCharacters,
        removedCharacters: source.length - next.join("\n").length
      }
    };
  });
}

export function stripLrcTimeline(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  return applyScopedTransform(text, selection, (source) => {
    const lines = normalizeNewlines(source).split("\n");
    let timestamps = 0;
    let metadata = 0;
    const next = lines.map((line) => {
      if (LRC_METADATA_PATTERN.test(line)) {
        metadata += 1;
        return "";
      }
      const prefix = line.match(LRC_TIMESTAMP_PREFIX_PATTERN)?.[0] ?? "";
      if (!prefix) return line;
      timestamps += prefix.match(/\[/gu)?.length ?? 1;
      return line.slice(prefix.length).replace(/^[ \t]+/u, "");
    });

    return { text: next.join("\n"), stats: { timestamps, metadata } };
  });
}

export function mergeSelectedLyricsLines(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  const scope = resolveLyricsTextScope(text, selection);
  if (!scope.hasSelection) {
    return unchangedScopedTransform(text, selection, scope, { mergedLines: 0 });
  }
  return applyScopedTransform(text, selection, (source) => {
    const lines = normalizeNewlines(source).split("\n");
    if (lines.length < 2) return { text: source, stats: { mergedLines: 0 } };
    const merged = lines.map((line) => line.trim()).filter(Boolean).join(" ");
    return {
      text: merged,
      stats: { mergedLines: Math.max(0, lines.length - 1), removedLines: Math.max(0, lines.length - 1) }
    };
  });
}

export function previewParagraphTags(
  text: string,
  selection: LyricsTextSelection
) {
  const scope = resolveLyricsTextScope(text, selection);
  return normalizeNewlines(scope.text)
    .split("\n")
    .flatMap((line, index) => (
      PARAGRAPH_TAG_PATTERN.test(line)
        ? [{ line: scope.startLine + index, text: line.trim() }]
        : []
    ));
}

export function removeParagraphTags(
  text: string,
  selection: LyricsTextSelection
): LyricsScopedTransform {
  return applyScopedTransform(text, selection, (source, scope) => {
    const lines = normalizeNewlines(source).split("\n");
    const tags: Array<{ line: number; text: string }> = [];
    const next = lines.filter((line, index) => {
      if (!PARAGRAPH_TAG_PATTERN.test(line)) return true;
      tags.push({ line: scope.startLine + index, text: line.trim() });
      return false;
    });
    return {
      text: next.join("\n"),
      stats: { removedLines: tags.length, tags }
    };
  });
}

export function cleanSynchronizedBlankRows(params: {
  lyrics: string;
  translationText: string;
  mode: LyricsBlankMode;
  lineRange?: { startLine: number; endLine: number };
}) {
  const originalLines = normalizeNewlines(params.lyrics).split("\n");
  const translationLines = normalizeNewlines(params.translationText).split("\n");
  // Only the paired prefix is eligible: an unpaired tail in either column must
  // never shift because the other column has no corresponding row.
  const pairedCount = Math.min(originalLines.length, translationLines.length);
  const startIndex = clamp((params.lineRange?.startLine ?? 1) - 1, 0, pairedCount);
  const endIndex = clamp(params.lineRange?.endLine ?? pairedCount, startIndex, pairedCount);
  const removable = new Set<number>();

  if (params.mode === "trim") {
    let start = startIndex;
    let end = endIndex;
    while (start < end && isMutualBlank(originalLines, translationLines, start)) {
      removable.add(start);
      start += 1;
    }
    while (end > start && isMutualBlank(originalLines, translationLines, end - 1)) {
      removable.add(end - 1);
      end -= 1;
    }
  } else if (params.mode === "collapse") {
    let previousWasMutualBlank = false;
    for (let index = startIndex; index < endIndex; index += 1) {
      const mutualBlank = isMutualBlank(originalLines, translationLines, index);
      if (mutualBlank && previousWasMutualBlank) removable.add(index);
      previousWasMutualBlank = mutualBlank;
    }
  } else {
    for (let index = startIndex; index < endIndex; index += 1) {
      if (isMutualBlank(originalLines, translationLines, index)) removable.add(index);
    }
  }

  const filterRows = (lines: string[]) => lines.filter((_, index) => !removable.has(index));
  const lyrics = filterRows(originalLines).join("\n");
  const translationText = filterRows(translationLines).join("\n");
  return {
    lyrics,
    translationText,
    removedRows: removable.size,
    changed: removable.size > 0
  };
}

export function swapLyricsColumns(snapshot: LyricsDocumentSnapshot): LyricsDocumentSnapshot {
  const lyricDocument = swapLyricDocumentColumns(snapshot.lyricDocument);
  const text = serializeLyricDocument(lyricDocument);
  return {
    lyricDocument,
    lyrics: text.source,
    translationText: text.translation,
    translationEnabled: true
  };
}

export function analyzeLyricsDocument(params: {
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  longLineThreshold?: number;
}): LyricsDocumentAnalysis {
  const longLineThreshold = params.longLineThreshold ?? 80;
  const originalLines = editorLines(params.lyrics);
  const translationLines = params.translationEnabled ? editorLines(params.translationText) : [];
  const issues = [
    ...analyzeLyricsText(params.lyrics, "lyrics", longLineThreshold),
    ...(params.translationEnabled
      ? analyzeLyricsText(params.translationText, "translation", longLineThreshold)
      : [])
  ];
  const lineDifference = params.translationEnabled
    ? originalLines.length - translationLines.length
    : 0;

  return {
    originalLineCount: originalLines.length,
    translationLineCount: translationLines.length,
    lineDifference,
    firstUnpairedLine: lineDifference === 0
      ? null
      : Math.min(originalLines.length, translationLines.length) + 1,
    issues
  };
}

export function getLyricsLineSelection(text: string, line: number): LyricsTextSelection {
  const normalizedLine = Math.max(1, line);
  let currentLine = 1;
  let start = 0;
  while (currentLine < normalizedLine) {
    const nextBreak = text.indexOf("\n", start);
    if (nextBreak === -1) return { start: text.length, end: text.length };
    start = nextBreak + 1;
    currentLine += 1;
  }
  const endBreak = text.indexOf("\n", start);
  return { start, end: endBreak === -1 ? text.length : endBreak };
}

export function createLyricsOperationHistory(): LyricsOperationHistory {
  return { past: [], future: [] };
}

export function recordLyricsOperation(
  history: LyricsOperationHistory,
  entry: LyricsHistoryEntry
): LyricsOperationHistory {
  // A new edit invalidates redo history and retains only the newest bounded
  // snapshots to keep large lyric documents from growing memory without limit.
  return {
    past: [...history.past, entry].slice(-HISTORY_LIMIT),
    future: []
  };
}

export function undoLyricsOperation(history: LyricsOperationHistory) {
  const entry = history.past.at(-1);
  if (!entry) return { history, entry: null, snapshot: null, selection: null };
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [entry, ...history.future].slice(0, HISTORY_LIMIT)
    },
    entry,
    snapshot: entry.before,
    selection: entry.beforeSelection
  };
}

export function redoLyricsOperation(history: LyricsOperationHistory) {
  const entry = history.future[0];
  if (!entry) return { history, entry: null, snapshot: null, selection: null };
  return {
    history: {
      past: [...history.past, entry].slice(-HISTORY_LIMIT),
      future: history.future.slice(1)
    },
    entry,
    snapshot: entry.after,
    selection: entry.afterSelection
  };
}

export function snapshotsEqual(
  left: LyricsDocumentSnapshot,
  right: LyricsDocumentSnapshot
) {
  return left.lyrics === right.lyrics &&
    left.translationText === right.translationText &&
    left.translationEnabled === right.translationEnabled &&
    left.lyricDocument.id === right.lyricDocument.id &&
    left.lyricDocument.revision === right.lyricDocument.revision;
}

function applyScopedTransform(
  text: string,
  selection: LyricsTextSelection,
  transform: (
    source: string,
    scope: LyricsTextScope
  ) => { text: string; stats: LyricsTransformStats }
): LyricsScopedTransform {
  const scope = resolveLyricsTextScope(text, selection);
  const result = transform(scope.text, scope);
  const nextText = `${text.slice(0, scope.start)}${result.text}${text.slice(scope.end)}`;
  // Preserve transformed range selection for scoped commands; whole-document
  // commands collapse the caret at its original bounded start position.
  const nextSelection = scope.hasSelection
    ? { start: scope.start, end: scope.start + result.text.length }
    : {
        start: clamp(selection.start, 0, nextText.length),
        end: clamp(selection.start, 0, nextText.length)
      };
  return {
    text: nextText,
    changed: nextText !== text,
    selection: nextSelection,
    scope,
    stats: result.stats
  };
}

function unchangedScopedTransform(
  text: string,
  selection: LyricsTextSelection,
  scope: LyricsTextScope,
  stats: LyricsTransformStats
): LyricsScopedTransform {
  return {
    text,
    changed: false,
    selection: {
      start: clamp(selection.start, 0, text.length),
      end: clamp(selection.end, 0, text.length)
    },
    scope,
    stats
  };
}

function analyzeLyricsText(
  text: string,
  editor: LyricsWorkbenchEditor,
  longLineThreshold: number
) {
  const lines = editorLines(text);
  const issues: LyricsIssue[] = [];
  let previous = "";

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const length = Array.from(trimmed).length;
    if (length > longLineThreshold) {
      issues.push({
        id: `${editor}-long-${lineNumber}`,
        kind: "long-line",
        editor,
        line: lineNumber,
        excerpt: excerpt(line),
        count: length
      });
    }

    if (trimmed && previous && trimmed === previous) {
      issues.push({
        id: `${editor}-duplicate-${lineNumber}`,
        kind: "duplicate-line",
        editor,
        line: lineNumber,
        excerpt: excerpt(line),
        count: 1
      });
    }

    const invisibleCount = line.match(INVISIBLE_CHARACTER_PATTERN)?.length ?? 0;
    if (invisibleCount > 0) {
      issues.push({
        id: `${editor}-invisible-${lineNumber}`,
        kind: "invisible-character",
        editor,
        line: lineNumber,
        excerpt: excerpt(line.replace(INVISIBLE_CHARACTER_PATTERN, "·")),
        count: invisibleCount
      });
    }
    previous = trimmed;
  });

  return issues;
}

function normalizeNewlines(text: string) {
  return text.replace(/\r\n?|\n/gu, "\n");
}

function lineNumberAt(text: string, index: number) {
  return text.slice(0, clamp(index, 0, text.length)).split("\n").length;
}

function countEditorLines(text: string) {
  return text ? normalizeNewlines(text).split("\n").length : 0;
}

function editorLines(text: string) {
  return text ? normalizeNewlines(text).split("\n") : [];
}

function isBlank(line: string) {
  return line.trim().length === 0;
}

function isMutualBlank(original: string[], translation: string[], index: number) {
  return index < original.length &&
    index < translation.length &&
    isBlank(original[index]) &&
    isBlank(translation[index]);
}

function excerpt(text: string) {
  const trimmed = text.trim();
  return Array.from(trimmed).slice(0, 48).join("");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
