"use client";

import {
  type ChangeEvent,
  type FocusEvent,
  type MutableRefObject,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  formatLyricsWorkspaceCopy,
  type LyricsWorkspaceCopy
} from "@/components/editor/lyrics-workspace-copy";
import type { LyricsEditorKey } from "@/components/editor/hooks/useLyricsViewportSession";
import {
  cleanPastedLyrics,
  cleanSynchronizedBlankRows,
  collapseConsecutiveBlankLines,
  createLyricsOperationHistory,
  getLyricsLineSelection,
  mergeSelectedLyricsLines,
  recordLyricsOperation,
  redoLyricsOperation,
  removeAllBlankLines,
  removeParagraphTags,
  resolveLyricsTextScope,
  snapshotsEqual,
  stripLrcTimeline,
  swapLyricsColumns,
  trimBoundaryBlankLines,
  undoLyricsOperation,
  type LyricsBlankMode,
  type LyricsDocumentSnapshot,
  type LyricsHistoryEntry,
  type LyricsScopedTransform,
  type LyricsSelectionSnapshot,
  type LyricsTextSelection,
  type LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";

type UseLyricsWorkspaceDocumentControllerOptions = {
  copy: LyricsWorkspaceCopy;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  showTranslation: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  activeEditorRef: MutableRefObject<LyricsWorkbenchEditor>;
  getEditor: (editor: LyricsEditorKey) => HTMLTextAreaElement | null;
  captureViewportAnchor: (preferredEditor?: LyricsEditorKey) => void;
  restoreViewportAnchor: (selectionOverride?: LyricsSelectionSnapshot) => void;
  onLyricsChange: (lyrics: string) => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translation: string) => void;
  onLyricsDocumentChange: (snapshot: LyricsDocumentSnapshot) => void;
};

type CursorPosition = {
  editor: LyricsWorkbenchEditor;
  line: number;
  totalLines: number;
};

type OperationFeedback = {
  message: string;
  canUndo: boolean;
};

export function useLyricsWorkspaceDocumentController({
  copy,
  lyrics,
  translationText,
  translationEnabled,
  showTranslation,
  scrollRef,
  activeEditorRef,
  getEditor,
  captureViewportAnchor,
  restoreViewportAnchor,
  onLyricsChange,
  onTranslationEnabledChange,
  onTranslationTextChange,
  onLyricsDocumentChange
}: UseLyricsWorkspaceDocumentControllerOptions) {
  const lyricsStats = useMemo(() => getTextStats(lyrics), [lyrics]);
  const translationStats = useMemo(() => getTextStats(translationText), [translationText]);
  const documentSnapshot = useMemo<LyricsDocumentSnapshot>(() => ({
    lyrics,
    translationText,
    translationEnabled
  }), [lyrics, translationEnabled, translationText]);
  const [cursor, setCursor] = useState<CursorPosition>({
    editor: "lyrics",
    line: 1,
    totalLines: Math.max(1, lyricsStats.lines)
  });
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const [selections, setSelections] = useState<Record<LyricsWorkbenchEditor, LyricsTextSelection>>({
    lyrics: { start: 0, end: 0 },
    translation: { start: 0, end: 0 }
  });
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;
  const [feedback, setFeedback] = useState<OperationFeedback | null>(null);
  // History lives in a ref; this revision exists only to expose ref mutations to rendering.
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyRef = useRef(createLyricsOperationHistory());
  // Expected snapshots distinguish controller commits from unrelated controlled-value updates.
  const expectedSnapshotRef = useRef<LyricsDocumentSnapshot | null>(null);
  const previousSnapshotRef = useRef(documentSnapshot);
  const pendingSelectionRef = useRef<LyricsSelectionSnapshot | null>(null);
  const activeText = cursor.editor === "translation" ? translationText : lyrics;
  const activeSelection = clampSelection(selections[cursor.editor], activeText.length);
  const activeScope = resolveLyricsTextScope(activeText, activeSelection);
  const currentLabel = cursor.editor === "translation" ? copy.translation : copy.original;
  const currentTotalLines = Math.max(
    1,
    cursor.editor === "translation" ? translationStats.lines : lyricsStats.lines
  );
  const currentPosition = formatLyricsWorkspaceCopy(copy.currentPosition, {
    label: currentLabel,
    line: Math.min(cursor.line, currentTotalLines),
    total: currentTotalLines
  });
  const scopeLabel = formatLyricsWorkspaceCopy(
    activeScope.hasSelection ? copy.selectedLinesScope : copy.activeColumnScope,
    {
      label: currentLabel,
      start: activeScope.startLine,
      end: activeScope.endLine
    }
  );

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    const editor = getEditor(pending.editor);
    if (!editor) return;
    const selection = clampSelection(pending, editor.value.length);
    const selectionChanged = !textSelectionsEqual(selectionsRef.current[pending.editor], selection);
    const nextSelections = selectionChanged
      ? { ...selectionsRef.current, [pending.editor]: selection }
      : selectionsRef.current;
    const nextCursor = cursorForSelection(pending.editor, editor.value, selection.start);
    const cursorChanged = !cursorPositionsEqual(cursorRef.current, nextCursor);
    // Publish refs before native selection/focus events fire so those notifications
    // observe the restored state instead of capturing a stale intermediate anchor.
    selectionsRef.current = nextSelections;
    cursorRef.current = nextCursor;
    activeEditorRef.current = pending.editor;
    // Restore selection after React updates the textarea value, then restore its semantic viewport anchor.
    editor.setSelectionRange(selection.start, selection.end);
    editor.focus({ preventScroll: true });
    if (selectionChanged) setSelections(nextSelections);
    if (cursorChanged) setCursor(nextCursor);
    pendingSelectionRef.current = null;
    restoreViewportAnchor(pending);
  }, [activeEditorRef, getEditor, lyrics, restoreViewportAnchor, translationEnabled, translationText]);

  useEffect(() => {
    const previous = previousSnapshotRef.current;
    previousSnapshotRef.current = documentSnapshot;
    if (snapshotsEqual(previous, documentSnapshot)) return;
    if (expectedSnapshotRef.current && snapshotsEqual(expectedSnapshotRef.current, documentSnapshot)) {
      expectedSnapshotRef.current = null;
      return;
    }
    // Manual typing and external imports start a new local operation-history branch.
    if (historyRef.current.past.length > 0 || historyRef.current.future.length > 0) {
      historyRef.current = createLyricsOperationHistory();
      setHistoryRevision((value) => value + 1);
    }
    setFeedback((current) => current === null ? current : null);
  }, [documentSnapshot]);

  function clearOperationHistory() {
    if (historyRef.current.past.length === 0 && historyRef.current.future.length === 0 && !feedback) return;
    historyRef.current = createLyricsOperationHistory();
    setHistoryRevision((value) => value + 1);
    setFeedback(null);
  }

  function updateCursor(
    event: SyntheticEvent<HTMLTextAreaElement>,
    editor: LyricsWorkbenchEditor,
    forceAnchorCapture = false
  ) {
    const node = event.currentTarget;
    const selection = {
      start: node.selectionStart ?? 0,
      end: node.selectionEnd ?? node.selectionStart ?? 0
    };
    const previousSelection = selectionsRef.current[editor];
    const selectionChanged = !textSelectionsEqual(previousSelection, selection);
    const activeEditorChanged = activeEditorRef.current !== editor;
    if (forceAnchorCapture || selectionChanged || activeEditorChanged) {
      captureViewportAnchor(editor);
    }
    activeEditorRef.current = editor;
    if (selectionChanged) {
      const nextSelections = { ...selectionsRef.current, [editor]: selection };
      selectionsRef.current = nextSelections;
      setSelections(nextSelections);
    }
    const nextCursor = cursorForSelection(editor, node.value, selection.start);
    if (!cursorPositionsEqual(cursorRef.current, nextCursor)) {
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
    }
  }

  function onEditorFocus(event: FocusEvent<HTMLTextAreaElement>, editor: LyricsWorkbenchEditor) {
    updateCursor(event, editor);
  }

  function onLyricsEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    clearOperationHistory();
    updateCursor(event, "lyrics", true);
    onLyricsChange(event.currentTarget.value);
  }

  function onTranslationEditorChange(event: ChangeEvent<HTMLTextAreaElement>) {
    clearOperationHistory();
    updateCursor(event, "translation", true);
    onTranslationTextChange(event.currentTarget.value);
  }

  function captureCurrentSelection(editor = activeEditorRef.current): LyricsSelectionSnapshot {
    const node = getEditor(editor);
    const valueLength = editor === "translation" ? translationText.length : lyrics.length;
    const selection = node
      ? { start: node.selectionStart ?? 0, end: node.selectionEnd ?? node.selectionStart ?? 0 }
      : selectionsRef.current[editor];
    return { editor, ...clampSelection(selection, valueLength) };
  }

  function commitOperation(params: {
    label: string;
    next: LyricsDocumentSnapshot;
    afterSelection: LyricsSelectionSnapshot;
    message: string;
  }) {
    if (snapshotsEqual(documentSnapshot, params.next)) {
      setFeedback({ message: copy.noChanges, canUndo: false });
      return false;
    }
    captureViewportAnchor(params.afterSelection.editor);
    // Store document, selection, and viewport intent together so undo restores the editing context.
    const entry: LyricsHistoryEntry = {
      label: params.label,
      before: documentSnapshot,
      after: params.next,
      beforeSelection: captureCurrentSelection(),
      afterSelection: params.afterSelection
    };
    historyRef.current = recordLyricsOperation(historyRef.current, entry);
    expectedSnapshotRef.current = params.next;
    pendingSelectionRef.current = params.afterSelection;
    setHistoryRevision((value) => value + 1);
    setFeedback({ message: params.message, canUndo: true });
    onLyricsDocumentChange(params.next);
    return true;
  }

  function applyActiveTransform(
    label: string,
    result: LyricsScopedTransform,
    message: string
  ) {
    if (!result.changed) {
      setFeedback({ message: copy.noChanges, canUndo: false });
      return;
    }
    const editor = activeEditorRef.current;
    commitOperation({
      label,
      next: editor === "translation"
        ? { ...documentSnapshot, translationText: result.text, translationEnabled: true }
        : { ...documentSnapshot, lyrics: result.text },
      afterSelection: { editor, ...result.selection },
      message
    });
  }

  function blankCleanup(mode: LyricsBlankMode, synchronized: boolean) {
    const label = mode === "trim"
      ? copy.trimBlankLines
      : mode === "collapse"
        ? copy.collapseBlankLines
        : copy.removeBlankLines;
    if (synchronized && showTranslation) {
      const result = cleanSynchronizedBlankRows({
        lyrics,
        translationText,
        mode,
        lineRange: activeScope.hasSelection
          ? { startLine: activeScope.startLine, endLine: activeScope.endLine }
          : undefined
      });
      if (!result.changed) {
        setFeedback({ message: copy.noChanges, canUndo: false });
        return;
      }
      const selection = captureCurrentSelection();
      commitOperation({
        label,
        next: {
          lyrics: result.lyrics,
          translationText: result.translationText,
          translationEnabled: true
        },
        afterSelection: {
          ...selection,
          start: Math.min(selection.start, selection.editor === "lyrics" ? result.lyrics.length : result.translationText.length),
          end: Math.min(selection.end, selection.editor === "lyrics" ? result.lyrics.length : result.translationText.length)
        },
        message: formatLyricsWorkspaceCopy(copy.synchronizedResult, { count: result.removedRows })
      });
      return;
    }

    const transform = mode === "trim"
      ? trimBoundaryBlankLines
      : mode === "collapse"
        ? collapseConsecutiveBlankLines
        : removeAllBlankLines;
    const result = transform(activeText, activeSelection);
    applyActiveTransform(
      label,
      result,
      formatLyricsWorkspaceCopy(copy.removedLinesResult, {
        scope: scopeLabel,
        count: result.stats.removedLines ?? 0
      })
    );
  }

  function cleanPaste() {
    const result = cleanPastedLyrics(activeText, activeSelection);
    const count = (result.stats.trailingWhitespaceLines ?? 0) +
      (result.stats.whitespaceOnlyLines ?? 0) +
      (result.stats.invisibleCharacters ?? 0) +
      (result.stats.newlineChanges ?? 0);
    applyActiveTransform(
      copy.cleanPaste,
      result,
      formatLyricsWorkspaceCopy(copy.cleanedPasteResult, { count })
    );
  }

  function cleanLrc() {
    const result = stripLrcTimeline(activeText, activeSelection);
    applyActiveTransform(
      copy.lrcHeading,
      result,
      formatLyricsWorkspaceCopy(copy.cleanedLrcResult, {
        timestamps: result.stats.timestamps ?? 0,
        metadata: result.stats.metadata ?? 0
      })
    );
  }

  function mergeLines() {
    const result = mergeSelectedLyricsLines(activeText, activeSelection);
    applyActiveTransform(
      copy.mergeHeading,
      result,
      formatLyricsWorkspaceCopy(copy.mergedResult, {
        count: (result.stats.mergedLines ?? 0) + 1
      })
    );
  }

  function cleanParagraphTags() {
    const result = removeParagraphTags(activeText, activeSelection);
    applyActiveTransform(
      copy.tagsHeading,
      result,
      formatLyricsWorkspaceCopy(copy.tagsRemovedResult, {
        scope: scopeLabel,
        count: result.stats.tags?.length ?? 0
      })
    );
  }

  function formatTranslation(nextTranslation: string) {
    const selection = captureCurrentSelection("translation");
    commitOperation({
      label: copy.formatTranslation,
      next: { ...documentSnapshot, translationText: nextTranslation, translationEnabled: true },
      afterSelection: {
        ...selection,
        start: Math.min(selection.start, nextTranslation.length),
        end: Math.min(selection.end, nextTranslation.length)
      },
      message: copy.formattedResult
    });
  }

  function splitAlternating(nextLyrics: string, nextTranslation: string) {
    commitOperation({
      label: copy.splitApply,
      next: { lyrics: nextLyrics, translationText: nextTranslation, translationEnabled: true },
      afterSelection: { editor: "lyrics", start: 0, end: 0 },
      message: copy.splitResult
    });
  }

  function swapColumns() {
    commitOperation({
      label: copy.swapApply,
      next: swapLyricsColumns(documentSnapshot),
      afterSelection: { editor: "lyrics", start: 0, end: 0 },
      message: copy.swappedResult
    });
  }

  function undoOperation() {
    const result = undoLyricsOperation(historyRef.current);
    if (!result.entry || !result.snapshot || !result.selection) return;
    historyRef.current = result.history;
    expectedSnapshotRef.current = result.snapshot;
    pendingSelectionRef.current = result.selection;
    captureViewportAnchor(result.selection.editor);
    setHistoryRevision((value) => value + 1);
    setFeedback({
      message: formatLyricsWorkspaceCopy(copy.undoneResult, { label: result.entry.label }),
      canUndo: result.history.past.length > 0
    });
    onLyricsDocumentChange(result.snapshot);
  }

  function redoOperation() {
    const result = redoLyricsOperation(historyRef.current);
    if (!result.entry || !result.snapshot || !result.selection) return;
    historyRef.current = result.history;
    expectedSnapshotRef.current = result.snapshot;
    pendingSelectionRef.current = result.selection;
    captureViewportAnchor(result.selection.editor);
    setHistoryRevision((value) => value + 1);
    setFeedback({
      message: formatLyricsWorkspaceCopy(copy.redoneResult, { label: result.entry.label }),
      canUndo: true
    });
    onLyricsDocumentChange(result.snapshot);
  }

  function handleTranslationEnabledChange(enabled: boolean) {
    clearOperationHistory();
    if (!enabled && activeEditorRef.current === "translation") {
      captureViewportAnchor("translation");
      activeEditorRef.current = "lyrics";
      const selection = clampSelection(selectionsRef.current.lyrics, lyrics.length);
      setCursor(cursorForSelection("lyrics", lyrics, selection.start));
    } else {
      captureViewportAnchor(enabled ? "translation" : activeEditorRef.current);
    }
    onTranslationEnabledChange(enabled);
  }

  function locateIssue(editor: LyricsWorkbenchEditor, line: number) {
    const node = getEditor(editor);
    if (!node) return;
    const selection = getLyricsLineSelection(node.value, line);
    activeEditorRef.current = editor;
    node.focus({ preventScroll: true });
    node.setSelectionRange(selection.start, selection.end);
    setSelections((current) => ({ ...current, [editor]: selection }));
    setCursor(cursorForSelection(editor, node.value, selection.start));
    const scroll = scrollRef.current;
    if (scroll) {
      const total = Math.max(1, node.value.split(/\r?\n/u).length);
      const ratio = total > 1 ? (Math.max(1, line) - 1) / (total - 1) : 0;
      scroll.scrollTop = ratio * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    }
  }

  void historyRevision;

  return {
    activeEditor: cursor.editor,
    activeSelection,
    activeText,
    blankCleanup,
    canRedo: historyRef.current.future.length > 0,
    canUndo: historyRef.current.past.length > 0,
    cleanLrc,
    cleanParagraphTags,
    cleanPaste,
    currentPosition,
    feedback,
    formatTranslation,
    handleTranslationEnabledChange,
    locateIssue,
    mergeLines,
    onEditorFocus,
    onLyricsEditorChange,
    onTranslationEditorChange,
    redoOperation,
    scopeLabel,
    splitAlternating,
    swapColumns,
    undoOperation,
    updateCursor
  };
}

function cursorForSelection(
  editor: LyricsWorkbenchEditor,
  value: string,
  selectionStart: number
): CursorPosition {
  const totalLines = Math.max(1, value ? value.split(/\r?\n/u).length : 1);
  const line = value.slice(0, selectionStart).split(/\r?\n/u).length;
  return { editor, line, totalLines };
}

function getTextStats(text: string) {
  const lines = text ? text.split(/\r?\n/u).length : 0;
  return { lines, characters: text.length };
}

function clampSelection(
  selection: LyricsTextSelection,
  textLength: number
): LyricsTextSelection {
  const start = Math.min(textLength, Math.max(0, selection.start));
  const end = Math.min(textLength, Math.max(start, selection.end));
  return { start, end };
}

function textSelectionsEqual(left: LyricsTextSelection, right: LyricsTextSelection) {
  return left.start === right.start && left.end === right.end;
}

function cursorPositionsEqual(left: CursorPosition, right: CursorPosition) {
  return left.editor === right.editor && left.line === right.line && left.totalLines === right.totalLines;
}
