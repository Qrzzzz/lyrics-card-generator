"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { commitEditorHistoryReplay } from "@/lib/editor/history-gateway";
import { createAppRequestHeaders } from "@/lib/app-request";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { clearLyricContent, hasClearableLyricContent } from "@/lib/clear-content";
import {
  applyEditorStyleChange,
  isDocumentSemanticStyleChange
} from "@/lib/editor/apply-style-change";
import type { UseEditorActionsInput } from "./editor-action-contracts";
import {
  canApplyLyricsCandidate,
  canonicalSongInfo,
  DocumentTransactionController,
  hasAuthoredDocument,
  replaceSongDocument,
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
import type { ExampleLoadPayload } from "@/lib/examples";
import {
  type ImportHistoryDisplayInput,
  type ImportHistoryManualSaveInput,
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
import { historyTransferCopy } from "@/lib/history-transfer-copy";
import type { RemoteLyricsSnapshot } from "@/lib/import-history";
import type {
  AppState,
  CardStyle,
  ParsedSongData,
  SongInfo
} from "@/lib/types";


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

type DocumentCommandsInput = Pick<UseEditorActionsInput, "autosave" | "parsedState" | "setState" | "exampleLoadedMessage" | "clearAlreadyEmptyMessage" | "confirmReplaceDocument" | "onNotify" | "onCloseExamples" | "onCloseHistory" | "onClearTransientState" | "aiLifecycle"> & {
  documentCleared: () => void;
  documentReplaced: () => void;
};
export function useEditorDocumentCommands({ autosave, parsedState, setState, exampleLoadedMessage, clearAlreadyEmptyMessage, confirmReplaceDocument, onNotify, onCloseExamples, onCloseHistory, onClearTransientState, aiLifecycle, documentCleared, documentReplaced }: DocumentCommandsInput) {
  const onInvalidateDocument = (reason?: "document" | "ai-start") => aiLifecycle.invalidateDocument(reason);
  const isManualSaveBlocked = () => aiLifecycle.isActive;
  const [clearTransitionKey, setClearTransitionKey] = useState(0);
  const documentControllerRef = useRef(new DocumentTransactionController());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      documentControllerRef.current.dispose();
    };
  }, []);
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
      allowAutoParse: !replayStillOwnsCurrentUrl && !autosave.ownsUrl(currentDocumentRef.current.url)
    };
  }

  function applyDocumentMutation(mutation: EditorDocumentStateMutation) {
    // Every document mutation invalidates stale AI work and advances the shared revision gate.
    settleTrackedDocumentIntent();
    const rollback = onInvalidateDocument();
    const projected = documentStateAdapter.projectDocumentMutation(rollback, mutation);
    setDocumentRevision(documentStateAdapter.queueDocumentMutation(rollback, mutation));
    currentDocumentRef.current = projected;
    return projected;
  }

  async function beginSongImport(kind: DocumentImportKind, signal?: AbortSignal) {
    if (!mountedRef.current || signal?.aborted) return null;
    // Bind ownership before either confirmation or draft persistence can yield.
    // Edits, newer imports and unmounts invalidate this same token throughout.
    const intent = trackDocumentIntent(documentControllerRef.current.begin(kind));
    const cancel = () => intent.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    let prepared = false;
    try {
      if (hasAuthoredDocument(currentDocumentRef.current) && !(await confirmReplaceDocument())) return null;
      if (intent.signal.aborted) return null;
      try { await autosave.flush(); }
      catch {
        if (!intent.signal.aborted) {
          onNotify(importHistoryCopy[currentDocumentRef.current.locale].historySaveFailed, "error");
        }
        return null;
      }
      if (intent.signal.aborted) return null;
      if (kind !== "history-replay") {
        documentStateAdapter.queueRollback(onInvalidateDocument());
      }
      prepared = true;
      return intent;
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (!prepared) intent.cancel();
    }
  }

  function commitSongImport(
    intent: DocumentImportIntent,
    song: ParsedSongData,
    lyrics = song.lyrics ?? "",
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
    const imported = replaceSongDocument(currentDocumentRef.current, song, lyrics);
    currentDocumentRef.current = imported;
    setState(imported);
    autosave.reset(imported);
    return true;
  }

  function queueImportHistoryRecord(candidate: ImportHistoryWriteCandidate) {
    const desktop = getLyricsCardDesktopApi();
    if (!desktop) return;
    // The full draft has its own retryable create, even if this source record fails.
    autosave.reset(currentDocumentRef.current, desktop.recordImportHistory(candidate));
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
    autosave.removed(recordId);
    if (manualSaveBindingRef.current?.recordId === recordId) {
      startNewManualSaveSession();
    }
  }

  function handleHistoryCleared() {
    autosave.removed();
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
    const committed = documentStateAdapter.commitAITranslation(
      value,
      expectedRevision,
      expectedSongIdentity
    );
    return committed;
  }

  async function clearAllContent() {
    if (!hasClearableLyricContent(parsedState) && !autosave.hasFormDraft) {
      onNotify(clearAlreadyEmptyMessage, "success");
      return;
    }

    const requestedRevision = documentControllerRef.current.currentRevision;
    try {
      await autosave.flush();
      await autosave.clearActive(() => {
        // Do not discard edits made while persistence was still running.
        if (documentControllerRef.current.currentRevision !== requestedRevision) return null;
        documentCleared();
        setClearTransitionKey((key) => key + 1);
        onClearTransientState();
        const cleared = applyDocumentMutation(clearLyricContent);
        startNewManualSaveSession();
        return cleared;
      });
    } catch { onNotify(importHistoryCopy[currentDocumentRef.current.locale].historySaveFailed, "error"); }
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
        display: historyDisplay(song),
        lyricsSnapshot: remoteLyricsSnapshot(currentDocumentRef.current)
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
        display: historyDisplay(song),
        lyricsSnapshot: remoteLyricsSnapshot(currentDocumentRef.current)
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

  async function loadExample(payload: ExampleLoadPayload) {
    const { example, translation, importTranslation = true } = payload;
    const intent = await beginSongImport("example");
    if (!intent) return;
    documentReplaced();
    const revision = documentControllerRef.current.tryCommit(intent);
    settleTrackedDocumentIntent(intent.id);
    if (revision === null) {
      intent.cancel();
      return;
    }
    setDocumentRevision(revision);
    startNewManualSaveSession();
    const loaded = (() => {
      const translationText = importTranslation ? translation.text : "";
      const translationEnabled = importTranslation && Boolean(translationText.trim()) && example.translationEnabled;
      const replaced = replaceSongDocument(currentDocumentRef.current, {
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
    })();
    currentDocumentRef.current = loaded;
    setState(loaded);
    autosave.reset(loaded);
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
    const intent = await beginSongImport("history-replay");
    if (!intent) return { status: "cancelled" };

    try {
      await autosave.flush();
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
      if (!replayCommit.ok || ("persistencePending" in committed && committed.persistencePending)) {
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
      } else if ("coverFailed" in committed && committed.coverFailed) {
        onNotify(historyTransferCopy[currentDocumentRef.current.locale].coverFailed, "warning");
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

  const commitHistoryReplay = (replay: Extract<ImportHistoryReplayResult, { ok: true }>, intent: DocumentImportIntent) => commitEditorHistoryReplay(replay, intent, {
    autosave, documentController: documentControllerRef.current, currentDocumentRef,
    setState, settleTrackedDocumentIntent, onInvalidateDocument, startNewManualSaveSession,
    setDocumentRevision, commitSongImport, bindLegacyRemoteReplay, bindLoadedManualSave
  });

  const manualSaveButtonState: ManualSaveButtonState = isManualSaveSaving
    ? "saving"
    : !hasClearableLyricContent(parsedState)
      ? "unavailable"
      : manualSaveBinding
        ? manualSaveBinding.savedRevision === documentRevision ? "current" : "update"
        : "create";

  return {
    clearTransitionKey,
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
    flushRemoteHistory: () => autosave.flush()
  };

  function bindLegacyRemoteReplay(id: string) {
    const current = currentDocumentRef.current;
    autosave.reset(current, id);
  }
}

function remoteLyricsSnapshot(state: AppState): RemoteLyricsSnapshot {
  return {
    lyrics: state.lyrics, translationText: state.translationText,
    translationEnabled: state.translationEnabled, lyricDocument: state.lyricDocument
  };
}
