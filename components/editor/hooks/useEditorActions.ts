"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ToastNotifier } from "@/components/feedback/AppToast";
import { createAppRequestHeaders } from "@/lib/app-request";
import { getLyricsCardDesktopApi, type LyricsCardDesktopApi } from "@/lib/desktop-api";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { clearLyricContent, hasClearableLyricContent } from "@/lib/clear-content";
import {
  applyEditorStyleChange,
  isDocumentSemanticStyleChange
} from "@/lib/editor/apply-style-change";
import { createExportSnapshot, type ExportSnapshot } from "@/lib/export-snapshot";
import { getExportRasterSizeIssue } from "@/lib/export-dimensions";
import {
  ExportTransactionMutex,
  runExportTransaction,
  waitForExportSnapshotNode
} from "@/lib/export-transaction";
import {
  canApplyLyricsCandidate,
  canonicalSongInfo,
  DocumentTransactionController,
  replaceSongDocument,
  requestDocumentImport,
  type DocumentImportIntent,
  type DocumentImportKind
} from "@/lib/editor/document-transactions";
import {
  EditorDocumentStateAdapter,
  type EditorDocumentStateMutation,
  type TranslationValue
} from "@/lib/editor/editor-document-state-adapter";
import type { LyricsDocumentSnapshot } from "@/lib/lyrics-workbench";
import {
  withLyricDocument,
  withLyricPlainText,
  withLyricSource,
  withLyricTranslation,
  withTranslationEnabled
} from "@/lib/lyrics-document-state";
import { migrateLyricDocumentV2 } from "@/lib/lyrics-document-v2";
import type { ExampleLoadPayload } from "@/lib/examples";
import {
  type ImportHistoryDisplayInput,
  type ImportHistoryManualSnapshot,
  type ImportHistoryManualSaveInput,
  type ImportHistoryReplayAudioFile,
  type ImportHistoryReplayCommitResult,
  type ImportHistoryReplayResult,
  type ImportHistoryReplayUiResult,
  type ImportHistoryWriteCandidate,
  type LinkImportHistoryContext,
  type LocalAudioImportHistoryContext,
  type ManualCoverImportHistoryContext,
  type ManualSaveButtonState,
  type SearchImportHistoryContext,
  serializeImportHistoryManualSave
} from "@/lib/import-history";
import { importHistoryCopy } from "@/lib/import-history-copy";
import { MAX_LOCAL_AUDIO_BYTES } from "@/lib/local-audio-limits";
import type {
  AppState,
  CardStyle,
  ParsedSongData,
  SongInfo
} from "@/lib/types";
import type { ExportFormatId } from "@/lib/settings/types";

type UseEditorActionsInput = {
  parsedState: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  cardRef: React.RefObject<HTMLElement | null>;
  exportPixelRatio: number;
  exportFormat: ExportFormatId;
  exportBlockMessage?: string;
  getExportBlockMessage?: (snapshot?: ExportSnapshot) => string | undefined;
  exportBusyMessage: string;
  exportFailedMessage: string;
  exportImageTooLargeMessage: string;
  exampleLoadedMessage: string;
  clearAlreadyEmptyMessage: string;
  confirmReplaceDocument: () => boolean;
  onNotify: ToastNotifier;
  onCloseExamples: () => void;
  onCloseHistory: () => void;
  onClearTransientState: () => void;
  onInvalidateDocument: (reason?: "document" | "ai-start") => TranslationValue | undefined;
  isManualSaveBlocked: () => boolean;
};

type ManualSaveBinding = {
  recordId: string;
  savedRevision: number;
};

type ManualReplayProvenance = {
  kind: "manual-save";
  recordId: string;
  replayUrl: string;
};

export type SongLinkAutoParseVisitIntent = Readonly<{
  id: number;
  allowAutoParse: boolean;
}>;

type HistorySongParseResponse =
  | { ok: true; data: ParsedSongData }
  | { ok: false; error?: string };

type HistorySearchResolveResponse =
  | { ok: true; data: { song: ParsedSongData; lyrics?: string } }
  | { ok: false; error?: string };

type HistoryLocalAudioResponse =
  | { ok: true; data: ParsedSongData; status: "success" | "no-lyrics" }
  | { ok: false; error?: string };

export function useEditorActions({
  parsedState,
  setState,
  cardRef,
  exportPixelRatio,
  exportFormat,
  exportBlockMessage,
  getExportBlockMessage,
  exportBusyMessage,
  exportFailedMessage,
  exportImageTooLargeMessage,
  exampleLoadedMessage,
  clearAlreadyEmptyMessage,
  confirmReplaceDocument,
  onNotify,
  onCloseExamples,
  onCloseHistory,
  onClearTransientState,
  onInvalidateDocument,
  isManualSaveBlocked
}: UseEditorActionsInput) {
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [isCompleteExporting, setIsCompleteExporting] = useState(false);
  const [clearTransitionKey, setClearTransitionKey] = useState(0);
  const clearVersionRef = useRef(0);
  const documentControllerRef = useRef(new DocumentTransactionController());
  const [documentRevision, setDocumentRevision] = useState(0);
  const [isDocumentTransactionPending, setIsDocumentTransactionPending] = useState(false);
  const trackedDocumentIntentRef = useRef<number | null>(null);
  const [manualSaveBinding, setManualSaveBinding] = useState<ManualSaveBinding | null>(null);
  const manualSaveBindingRef = useRef<ManualSaveBinding | null>(null);
  const manualReplayProvenanceRef = useRef<ManualReplayProvenance | null>(null);
  const songLinkAutoParseVisitRef = useRef(0);
  const manualSaveSessionRef = useRef(0);
  const manualSavePendingRef = useRef(false);
  const [isManualSaveSaving, setIsManualSaveSaving] = useState(false);
  const currentDocumentRef = useRef(parsedState);
  currentDocumentRef.current = parsedState;
  // The adapter is stable for the editor lifetime and always reads the latest controlled document.
  const documentStateAdapterRef = useRef<EditorDocumentStateAdapter | null>(null);
  if (!documentStateAdapterRef.current) {
    documentStateAdapterRef.current = new EditorDocumentStateAdapter(
      documentControllerRef.current,
      (updater) => setState(updater),
      (updater) => flushSync(() => setState(updater)),
      () => currentDocumentRef.current
    );
  }
  const documentStateAdapter = documentStateAdapterRef.current;
  const [activeExportSnapshot, setActiveExportSnapshot] = useState<ExportSnapshot | null>(null);
  const exportMutexRef = useRef(new ExportTransactionMutex());
  const exportRevisionRef = useRef(0);
  const previousExportStateRef = useRef(parsedState);
  if (previousExportStateRef.current !== parsedState) {
    previousExportStateRef.current = parsedState;
    exportRevisionRef.current += 1;
  }

  function trackDocumentIntent(intent: DocumentImportIntent): DocumentImportIntent {
    // Wrap cancellation so pending UI state settles for both success and abort paths.
    trackedDocumentIntentRef.current = intent.id;
    setIsDocumentTransactionPending(true);
    const cancel = intent.cancel;
    return {
      ...intent,
      cancel: () => {
        cancel();
        settleTrackedDocumentIntent(intent.id);
      }
    };
  }

  function settleTrackedDocumentIntent(intentId?: number) {
    if (intentId !== undefined && trackedDocumentIntentRef.current !== intentId) return;
    if (trackedDocumentIntentRef.current === null) return;
    trackedDocumentIntentRef.current = null;
    setIsDocumentTransactionPending(false);
  }

  function replaceManualSaveBinding(binding: ManualSaveBinding | null) {
    manualSaveBindingRef.current = binding;
    setManualSaveBinding(binding);
  }

  function replaceManualReplayProvenance(provenance: ManualReplayProvenance | null) {
    manualReplayProvenanceRef.current = provenance;
  }

  function startNewManualSaveSession() {
    manualSaveSessionRef.current += 1;
    if (manualSaveBindingRef.current) replaceManualSaveBinding(null);
    if (manualReplayProvenanceRef.current) replaceManualReplayProvenance(null);
  }

  function bindLoadedManualSave(recordId: string, savedRevision: number, replayUrl: string) {
    manualSaveSessionRef.current += 1;
    replaceManualSaveBinding({ recordId, savedRevision });
    replaceManualReplayProvenance({ kind: "manual-save", recordId, replayUrl });
  }

  function createSongLinkAutoParseVisitIntent(): SongLinkAutoParseVisitIntent {
    const replayProvenance = manualReplayProvenanceRef.current;
    const binding = manualSaveBindingRef.current;
    const replayStillOwnsCurrentUrl = Boolean(
      replayProvenance &&
      binding &&
      replayProvenance.recordId === binding.recordId &&
      replayProvenance.replayUrl === currentDocumentRef.current.url
    );
    songLinkAutoParseVisitRef.current += 1;
    return {
      id: songLinkAutoParseVisitRef.current,
      allowAutoParse: !replayStillOwnsCurrentUrl
    };
  }

  function applyDocumentMutation(mutation: EditorDocumentStateMutation) {
    // Every document mutation invalidates stale AI work and advances the shared revision gate.
    settleTrackedDocumentIntent();
    const rollback = onInvalidateDocument();
    const projected = documentStateAdapter.projectDocumentMutation(rollback, mutation);
    setDocumentRevision(documentStateAdapter.queueDocumentMutation(rollback, mutation));
    return projected;
  }

  function beginSongImport(kind: DocumentImportKind) {
    const intent = requestDocumentImport(
      documentControllerRef.current,
      parsedState,
      kind,
      confirmReplaceDocument
    );
    if (intent && kind !== "history-replay") {
      documentStateAdapter.queueRollback(onInvalidateDocument());
    }
    return intent ? trackDocumentIntent(intent) : null;
  }

  function commitSongImport(
    intent: DocumentImportIntent,
    song: ParsedSongData,
    lyrics = "",
    invalidateAIOnCommit = false
  ) {
    const revision = documentControllerRef.current.tryCommit(intent);
    settleTrackedDocumentIntent(intent.id);
    if (revision === null) {
      intent.cancel();
      return false;
    }
    if (invalidateAIOnCommit) onInvalidateDocument();
    setDocumentRevision(revision);
    startNewManualSaveSession();
    setState((current) => replaceSongDocument(current, song, lyrics));
    return true;
  }

  function queueImportHistoryRecord(candidate: ImportHistoryWriteCandidate) {
    const desktop = getLyricsCardDesktopApi();
    if (!desktop) return;
    // History persistence is best effort and must not roll back an already committed import.
    void desktop.recordImportHistory(candidate)
      .then((result) => {
        if (!result.ok) {
          onNotify(importHistoryCopy[currentDocumentRef.current.locale].historySaveFailed, "warning");
        }
      })
      .catch(() => {
        onNotify(importHistoryCopy[currentDocumentRef.current.locale].historySaveFailed, "warning");
      });
  }

  function historyDisplay(song: ParsedSongData | SongInfo): ImportHistoryDisplayInput {
    const remoteCoverUrl = [song.originalCoverUrl, song.coverUrl]
      .find((value) => typeof value === "string" && /^https?:\/\//i.test(value));
    return {
      title: song.title,
      artist: song.artist,
      album: song.album,
      source: song.source,
      ...(remoteCoverUrl ? { remoteCoverUrl } : {})
    };
  }

  function currentManualSaveInput(): ImportHistoryManualSaveInput {
    const current = currentDocumentRef.current;
    return {
      snapshot: {
        source: current.song.source,
        title: current.song.title,
        artist: current.song.artist,
        album: current.song.album,
        explicit: current.song.explicit,
        originalCoverUrl: current.song.originalCoverUrl,
        coverUrl: current.song.coverUrl,
        originalUrl: current.song.originalUrl,
        finalUrl: current.song.finalUrl,
        parseMethod: current.song.parseMethod,
        lyrics: current.lyrics,
        translationText: current.translationText,
        translationEnabled: current.translationEnabled,
        lyricDocument: current.lyricDocument
      }
    };
  }

  async function saveManualArchive() {
    const desktop = getLyricsCardDesktopApi();
    const copy = importHistoryCopy[currentDocumentRef.current.locale];
    if (!desktop || manualSavePendingRef.current) return;
    if (
      isManualSaveBlocked() ||
      documentControllerRef.current.hasActiveIntent ||
      !hasClearableLyricContent(currentDocumentRef.current)
    ) {
      onNotify(copy.manualSaveUnavailable, "warning");
      return;
    }

    const revision = documentControllerRef.current.currentRevision;
    const bindingAtStart = manualSaveBindingRef.current;
    if (bindingAtStart?.savedRevision === revision) {
      onNotify(copy.manualSaveUnchanged, "success");
      return;
    }

    // The session token prevents a late save from rebinding a document opened in the meantime.
    const sessionAtStart = manualSaveSessionRef.current;
    const input = currentManualSaveInput();
    const envelope = serializeImportHistoryManualSave(input);
    if (!envelope) {
      onNotify(copy.manualSaveUnavailable, "warning");
      return;
    }
    manualSavePendingRef.current = true;
    setIsManualSaveSaving(true);
    try {
      const result = bindingAtStart
        ? await desktop.updateManualSave(bindingAtStart.recordId, envelope)
        : await desktop.createManualSave(envelope);
      if (!result.ok) {
        if (bindingAtStart && (result.code === "not_found" || result.code === "invalid_kind")) {
          if (manualSaveBindingRef.current?.recordId === bindingAtStart.recordId) {
            startNewManualSaveSession();
          }
          onNotify(copy.manualSaveNotFound, "warning");
        } else if (result.code === "invalid_snapshot") {
          onNotify(copy.manualSaveUnavailable, "warning");
        } else {
          onNotify(copy.manualSaveFailed, "error");
        }
        return;
      }

      if (manualSaveSessionRef.current === sessionAtStart) {
        if (!bindingAtStart && !manualSaveBindingRef.current) {
          replaceManualSaveBinding({ recordId: result.record.id, savedRevision: revision });
        } else if (manualSaveBindingRef.current?.recordId === bindingAtStart?.recordId) {
          replaceManualSaveBinding({ recordId: result.record.id, savedRevision: revision });
        }
      }
      onNotify(bindingAtStart ? copy.manualSaveUpdated : copy.manualSaveCreated, "success");
    } catch {
      onNotify(copy.manualSaveFailed, "error");
    } finally {
      manualSavePendingRef.current = false;
      setIsManualSaveSaving(false);
    }
  }

  function handleHistoryRecordRemoved(recordId: string) {
    if (manualSaveBindingRef.current?.recordId === recordId) {
      startNewManualSaveSession();
    }
  }

  function handleHistoryCleared() {
    startNewManualSaveSession();
  }

  function beginAITranslation() {
    // A replacement generation restores its own partial synchronously before
    // this new document intent advances the shared revision.
    onInvalidateDocument("ai-start");
    settleTrackedDocumentIntent();
    const snapshot = documentStateAdapter.beginAITranslation();
    setDocumentRevision(snapshot.revision);
    return snapshot;
  }

  function getCurrentDocumentSnapshot() {
    return documentStateAdapter.getDocumentSnapshot();
  }

  function applyAIPartial(
    value: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) {
    return documentStateAdapter.applyAIPartial(
      value,
      expectedRevision,
      expectedSongIdentity
    );
  }

  function commitAITranslation(
    value: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) {
    return documentStateAdapter.commitAITranslation(
      value,
      expectedRevision,
      expectedSongIdentity
    );
  }

  function clearAllContent() {
    if (!hasClearableLyricContent(parsedState)) {
      onNotify(clearAlreadyEmptyMessage, "success");
      return;
    }

    clearVersionRef.current += 1;
    setCelebrationKey(0);
    setClearTransitionKey((key) => key + 1);
    onClearTransientState();
    applyDocumentMutation(clearLyricContent);
    startNewManualSaveSession();
  }

  function handleStyleChange(nextStyle: CardStyle) {
    // Semantic style fields participate in document revisioning; purely visual fields do not.
    if (isDocumentSemanticStyleChange(currentDocumentRef.current.style, nextStyle)) {
      applyDocumentMutation((current) => applyEditorStyleChange(current, nextStyle));
      return;
    }
    setState((current) => applyEditorStyleChange(current, nextStyle));
  }

  function setUrl(url: string) {
    if (manualReplayProvenanceRef.current) replaceManualReplayProvenance(null);
    applyDocumentMutation((current) => ({ ...current, url }));
  }

  function applyParsedSong(
    song: ParsedSongData,
    intent: DocumentImportIntent,
    context: LinkImportHistoryContext
  ) {
    const committed = commitSongImport(intent, song);
    if (committed) {
      queueImportHistoryRecord({
        kind: "link",
        inputUrl: context.inputUrl,
        normalizedUrl: song.originalUrl,
        finalUrl: song.finalUrl,
        display: historyDisplay(song)
      });
    }
    return committed;
  }

  function applyLocalAudio(
    song: ParsedSongData,
    embeddedLyrics: string | undefined,
    intent: DocumentImportIntent,
    context: LocalAudioImportHistoryContext
  ) {
    const committed = commitSongImport(intent, song, embeddedLyrics ?? "");
    if (committed) {
      queueImportHistoryRecord({
        kind: "local-audio",
        fileToken: context.fileToken,
        display: historyDisplay(song)
      });
    }
    return committed;
  }

  function applySearchedSong(
    song: ParsedSongData,
    lyrics: string | undefined,
    intent: DocumentImportIntent,
    context: SearchImportHistoryContext
  ) {
    const committed = commitSongImport(intent, song, lyrics ?? "");
    if (committed) {
      queueImportHistoryRecord({
        kind: "search",
        query: context.query,
        platform: context.platform,
        songId: context.songId,
        pageUrl: context.pageUrl,
        display: historyDisplay(song)
      });
    }
    return committed;
  }

  function setSong(song: SongInfo) {
    applyDocumentMutation((current) => ({ ...current, song: canonicalSongInfo(song) }));
  }

  function saveSongInfo(song: SongInfo, context: ManualCoverImportHistoryContext) {
    const savedDocument = applyDocumentMutation((current) => ({ ...current, song: canonicalSongInfo(song) }));
    if (!context.uploaded) return;
    startNewManualSaveSession();
    queueImportHistoryRecord({
      kind: "manual-cover",
      fileToken: context.fileToken,
      display: historyDisplay(song),
      snapshot: {
        title: song.title,
        artist: song.artist,
        album: song.album,
        source: song.source,
        originalUrl: song.originalUrl,
        finalUrl: song.finalUrl,
        lyrics: savedDocument.lyrics,
        translationText: savedDocument.translationText,
        translationEnabled: savedDocument.translationEnabled,
        lyricDocument: savedDocument.lyricDocument
      }
    });
  }

  function setLyrics(lyrics: string) {
    applyDocumentMutation((current) => withLyricSource(current, lyrics));
  }

  function setTranslationEnabled(translationEnabled: boolean) {
    applyDocumentMutation((current) => withTranslationEnabled(current, translationEnabled));
  }

  function setTranslationText(translationText: string) {
    applyDocumentMutation((current) => withLyricTranslation(current, translationText));
  }

  function setLyricsDocument(snapshot: LyricsDocumentSnapshot) {
    applyDocumentMutation((current) => withLyricDocument(
      current,
      snapshot.lyricDocument,
      snapshot.translationEnabled
    ));
  }

  async function completeAndExport() {
    const initialBlockMessage = getExportBlockMessage?.() ?? exportBlockMessage;
    if (initialBlockMessage) {
      onNotify(initialBlockMessage, "warning");
      return;
    }

    // Export owns an immutable snapshot; the clear version suppresses stale completion effects.
    const clearVersion = clearVersionRef.current;
    const snapshot = createExportSnapshot(parsedState, exportPixelRatio, exportRevisionRef.current, exportFormat);
    if (getExportRasterSizeIssue(snapshot.width, snapshot.height, snapshot.pixelRatio)) {
      onNotify(exportImageTooLargeMessage, "warning");
      return;
    }
    const result = await runExportTransaction({
      mutex: exportMutexRef.current,
      snapshot,
      mountSnapshot: async (mountedSnapshot, signal) => {
        setIsCompleteExporting(true);
        setActiveExportSnapshot(mountedSnapshot);
        return waitForExportSnapshotNode(() => cardRef.current, mountedSnapshot.id, signal);
      },
      validateSnapshot: (mountedSnapshot) => {
        if (getExportRasterSizeIssue(mountedSnapshot.width, mountedSnapshot.height, mountedSnapshot.pixelRatio)) {
          return exportImageTooLargeMessage;
        }
        return getExportBlockMessage?.(mountedSnapshot) ?? null;
      },
      captureSnapshot: async (mountedSnapshot, node, signal) => {
        const { exportNodeAsImage } = await import("@/lib/export-image");
        return exportNodeAsImage(
          node,
          mountedSnapshot.fileName,
          mountedSnapshot.format,
          mountedSnapshot.width,
          mountedSnapshot.height,
          mountedSnapshot.pixelRatio,
          signal
        );
      },
      unmountSnapshot: () => {
        setActiveExportSnapshot(null);
        setIsCompleteExporting(false);
      }
    });

    if (result.ok) {
      if (clearVersion === clearVersionRef.current) {
        setCelebrationKey((key) => key + 1);
      }
      return;
    }
    if (result.kind === "busy") {
      onNotify(exportBusyMessage, "warning");
    } else if (result.kind === "blocked") {
      onNotify(result.reason, "warning");
    } else {
      console.error("[Lyric Card Generator] complete export failed", result.error);
      onNotify(exportFailedMessage, "error");
    }
  }

  async function loadExample(payload: ExampleLoadPayload) {
    const { example, translation, importTranslation = true } = payload;
    const intent = beginSongImport("example");
    if (!intent) return;
    clearVersionRef.current += 1;
    const revision = documentControllerRef.current.tryCommit(intent);
    settleTrackedDocumentIntent(intent.id);
    if (revision === null) {
      intent.cancel();
      return;
    }
    setDocumentRevision(revision);
    startNewManualSaveSession();
    setState((current) => {
      const translationText = importTranslation ? translation.text : "";
      const translationEnabled = importTranslation && Boolean(translationText.trim()) && example.translationEnabled;
      const replaced = replaceSongDocument(current, {
        source: example.source,
        title: example.title,
        artist: example.artist,
        album: example.album,
        originalUrl: example.url
      }, example.lyrics);

      return withLyricPlainText({
        ...replaced,
        style: normalizeCardStyle(replaced.style)
      }, example.lyrics, translationText, translationEnabled);
    });
    onCloseExamples();
    onNotify(exampleLoadedMessage, "success");

    const enrichmentIntent = trackDocumentIntent(documentControllerRef.current.begin("example-enrichment"));
    try {
      const response = await fetch("/api/parse-song", {
        method: "POST",
        headers: createAppRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ url: example.url }),
        signal: enrichmentIntent.signal
      });
      const payload = await response.json() as { ok: boolean; data?: AppState["song"] };
      if (payload.ok && payload.data) {
        const enrichedRevision = documentControllerRef.current.tryCommit(enrichmentIntent);
        settleTrackedDocumentIntent(enrichmentIntent.id);
        if (enrichedRevision !== null) {
          setDocumentRevision(enrichedRevision);
          setState((current) => ({ ...current, song: canonicalSongInfo(payload.data!) }));
        }
      }
    } catch {
      // The example remains useful offline; cover/palette enrichment is best effort.
    } finally {
      enrichmentIntent.cancel();
    }
  }

  function applyFetchedLyrics(lyrics: string, revision: number, expectedSongIdentity: string) {
    if (!canApplyLyricsCandidate({
      controller: documentControllerRef.current,
      revision,
      expectedSongIdentity,
      currentSong: parsedState.song
    })) return false;
    applyDocumentMutation((current) => withLyricPlainText(current, lyrics, "", false));
    return true;
  }

  async function reimportHistory(recordId: string, relocate = false): Promise<ImportHistoryReplayUiResult> {
    const desktop = getLyricsCardDesktopApi();
    const copy = importHistoryCopy[currentDocumentRef.current.locale];
    if (!desktop) {
      onNotify(copy.replayFailed, "error");
      return { status: "error" };
    }
    const intent = beginSongImport("history-replay");
    if (!intent) return { status: "cancelled" };

    try {
      const replay = relocate
        ? await desktop.relocateImportHistory(recordId)
        : await desktop.replayImportHistory(recordId);
      if (!replay.ok) {
        intent.cancel();
        if (replay.code === "cancelled") return { status: "cancelled" };
        if (relocate) {
          onNotify(copy.relocateFailed, "error");
          return { status: "missing" };
        }
        if (replay.canRelocate) {
          onNotify(
            replay.code === "file_missing" ? copy.fileMissing : copy.relocateFailed,
            replay.code === "file_missing" ? "warning" : "error"
          );
          return { status: "missing" };
        }
        onNotify(copy.replayFailed, "error");
        return { status: "error" };
      }

      const committed = await commitHistoryReplay(replay, intent);
      if (!committed) return { status: "cancelled" };
      onCloseHistory();

      // UI replay commits first; file relocation metadata is persisted as a second best-effort phase.
      let replayCommit: ImportHistoryReplayCommitResult = { ok: false };
      try {
        replayCommit = await desktop.commitImportHistoryReplay(
          recordId,
          "relocationToken" in replay ? replay.relocationToken : undefined
        );
      } catch {
        replayCommit = { ok: false };
      }
      if (!replayCommit.ok) {
        if (
          replay.kind === "manual-save" &&
          replayCommit.code === "not_found" &&
          manualSaveBindingRef.current?.recordId === recordId
        ) {
          startNewManualSaveSession();
        }
        onNotify(copy.historySaveFailed, "warning");
      } else if ("file" in replay && replay.file.changed) {
        onNotify(copy.fileChanged, "warning");
      } else if (replay.kind === "manual-save") {
        onNotify(copy.manualSaveLoaded, "success");
      } else {
        onNotify(copy.replaySucceeded, "success");
      }
      return { status: "success" };
    } catch {
      const wasAborted = intent.signal.aborted;
      intent.cancel();
      if (wasAborted) return { status: "cancelled" };
      onNotify(copy.replayFailed, "error");
      return { status: "error" };
    }
  }

  async function commitHistoryReplay(replay: Extract<ImportHistoryReplayResult, { ok: true }>, intent: DocumentImportIntent) {
    if (replay.kind === "link") {
      const response = await fetch("/api/parse-song", {
        method: "POST",
        headers: createAppRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ url: replay.url }),
        signal: intent.signal
      });
      const payload = await response.json() as HistorySongParseResponse;
      if (!payload.ok) throw new Error(payload.error || "history_link_replay_failed");
      return commitSongImport(intent, payload.data, payload.data.lyrics ?? "", true)
        ? { revision: documentControllerRef.current.currentRevision }
        : null;
    }

    if (replay.kind === "search") {
      const response = await fetch("/api/resolve-searched-song", {
        method: "POST",
        headers: createAppRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ source: replay.platform, id: replay.songId }),
        signal: intent.signal
      });
      const payload = await response.json() as HistorySearchResolveResponse;
      if (!payload.ok) throw new Error(payload.error || "history_search_replay_failed");
      return commitSongImport(intent, payload.data.song, payload.data.lyrics ?? "", true)
        ? { revision: documentControllerRef.current.currentRevision }
        : null;
    }

    if (replay.kind === "local-audio") {
      const desktop = getLyricsCardDesktopApi();
      if (!desktop) throw new Error("history_local_audio_replay_failed");
      const file = await readReplayAudioFile(desktop, replay.file, intent.signal);
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/parse-local-audio", {
        method: "POST",
        headers: createAppRequestHeaders(),
        body: formData,
        signal: intent.signal
      });
      const payload = await response.json() as HistoryLocalAudioResponse;
      if (!payload.ok) throw new Error(payload.error || "history_local_audio_replay_failed");
      return commitSongImport(intent, payload.data, payload.data.lyrics ?? "", true)
        ? { revision: documentControllerRef.current.currentRevision }
        : null;
    }

    if (replay.kind === "manual-save") {
      const revision = documentControllerRef.current.tryCommit(intent);
      settleTrackedDocumentIntent(intent.id);
      if (revision === null) {
        intent.cancel();
        return null;
      }
      onInvalidateDocument();
      const snapshot = replay.snapshot;
      setDocumentRevision(revision);
      bindLoadedManualSave(
        replay.record.id,
        revision,
        snapshot.finalUrl || snapshot.originalUrl || ""
      );
      setState((current) => replaceWithHistorySnapshot(current, snapshot, {
        // Manual archives replay their persisted semantic snapshot without reparsing
        // the song. Restoring only the sanitized cover URL lets the existing image
        // proxy and palette flow load the archived cover safely.
        coverUrl: snapshot.coverUrl || snapshot.originalCoverUrl || "",
        originalCoverUrl: snapshot.originalCoverUrl || snapshot.coverUrl || "",
        parseMethod: snapshot.parseMethod || "import-history-manual-save"
      }));
      return { revision };
    }

    const coverUrl = URL.createObjectURL(new Blob(
      [copyReplayBytes(replay.file.bytes)],
      { type: replay.file.mimeType }
    ));
    const revision = documentControllerRef.current.tryCommit(intent);
    settleTrackedDocumentIntent(intent.id);
    if (revision === null) {
      intent.cancel();
      URL.revokeObjectURL(coverUrl);
      return false;
    }
    onInvalidateDocument();
    const snapshot = replay.snapshot;
    setDocumentRevision(revision);
    startNewManualSaveSession();
    setState((current) => replaceWithHistorySnapshot(current, snapshot, {
      coverUrl,
      originalCoverUrl: "",
      parseMethod: "import-history-manual-cover"
    }));
    return { revision };
  }

  const manualSaveButtonState: ManualSaveButtonState = isManualSaveSaving
    ? "saving"
    : !hasClearableLyricContent(parsedState)
      ? "unavailable"
      : manualSaveBinding
        ? manualSaveBinding.savedRevision === documentRevision ? "current" : "update"
        : "create";

  return {
    celebrationKey,
    isCompleteExporting,
    clearTransitionKey,
    activeExportSnapshot,
    documentRevision,
    isDocumentTransactionPending,
    manualSaveButtonState,
    createSongLinkAutoParseVisitIntent,
    beginSongImport,
    clearAllContent,
    handleStyleChange,
    beginAITranslation,
    getCurrentDocumentSnapshot,
    applyAIPartial,
    commitAITranslation,
    setUrl,
    applyParsedSong,
    applyLocalAudio,
    applySearchedSong,
    saveSongInfo,
    setSong,
    setLyrics,
    setTranslationEnabled,
    setTranslationText,
    setLyricsDocument,
    applyFetchedLyrics,
    loadExample,
    reimportHistory,
    saveManualArchive,
    handleHistoryRecordRemoved,
    handleHistoryCleared,
    completeAndExport
  };
}

function replaceWithHistorySnapshot(
  current: AppState,
  snapshot: ImportHistoryManualSnapshot,
  cover: { coverUrl: string; originalCoverUrl: string; parseMethod: string }
) {
  const replaced = replaceSongDocument(current, {
    source: snapshot.source,
    title: snapshot.title,
    artist: snapshot.artist,
    album: snapshot.album,
    explicit: snapshot.explicit ?? false,
    coverUrl: cover.coverUrl,
    originalCoverUrl: cover.originalCoverUrl,
    proxiedCoverUrl: "",
    originalUrl: snapshot.originalUrl ?? "",
    finalUrl: snapshot.finalUrl ?? "",
    parseMethod: cover.parseMethod
  }, snapshot.lyrics);
  const lyricDocument = migrateLyricDocumentV2(snapshot.lyricDocument, snapshot);
  return withLyricDocument(replaced, lyricDocument, snapshot.translationEnabled);
}

function copyReplayBytes(bytes: Uint8Array) {
  // Own the ArrayBuffer passed to browser File/Blob constructors instead of sharing IPC memory.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const MAX_IMPORT_HISTORY_AUDIO_CHUNK_BYTES = 1024 * 1024;

async function readReplayAudioFile(
  desktop: LyricsCardDesktopApi,
  file: ImportHistoryReplayAudioFile,
  signal: AbortSignal
) {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_LOCAL_AUDIO_BYTES) {
    throw new Error("history_local_audio_replay_failed");
  }
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  const abortStream = () => {
    void desktop.releaseImportHistoryFile(file.streamToken).catch(() => undefined);
  };
  signal.addEventListener("abort", abortStream, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const result = await desktop.readImportHistoryFileChunk(file.streamToken);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (!result.ok) throw new Error(result.code);
      if (!(result.bytes instanceof Uint8Array)) throw new Error("invalid_file_chunk");
      const length = result.bytes.byteLength;
      if (
        length > MAX_IMPORT_HISTORY_AUDIO_CHUNK_BYTES ||
        total + length > file.size ||
        (!result.done && length === 0)
      ) {
        throw new Error("invalid_file_chunk");
      }
      if (length > 0) chunks.push(copyReplayBytes(result.bytes));
      total += length;
      if (!result.done) continue;
      if (total !== file.size) throw new Error("invalid_file_chunk");
      return new File(chunks, file.fileName, {
        type: file.mimeType,
        lastModified: file.mtimeMs
      });
    }
  } finally {
    signal.removeEventListener("abort", abortStream);
    await desktop.releaseImportHistoryFile(file.streamToken).catch(() => false);
  }
}
