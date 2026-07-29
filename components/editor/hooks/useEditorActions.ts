"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createAppRequestHeaders } from "@/lib/app-request";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { clearLyricContent, hasClearableLyricContent } from "@/lib/clear-content";
import {
  applyEditorStyleChange,
  isDocumentSemanticStyleChange
} from "@/lib/editor/apply-style-change";
import { exportNodeAsImage } from "@/lib/export-image";
import { createExportSnapshot, type ExportSnapshot } from "@/lib/export-snapshot";
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
import type { ExampleLoadPayload } from "@/lib/examples";
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
  exportFailedMessage: (detail: string) => string;
  exampleLoadedMessage: string;
  clearAlreadyEmptyMessage: string;
  confirmReplaceDocument: () => boolean;
  onNotify: (message: string) => void;
  onCloseExamples: () => void;
  onClearTransientState: () => void;
  onInvalidateDocument: (reason?: "document" | "ai-start") => TranslationValue | undefined;
};

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
  exampleLoadedMessage,
  clearAlreadyEmptyMessage,
  confirmReplaceDocument,
  onNotify,
  onCloseExamples,
  onClearTransientState,
  onInvalidateDocument
}: UseEditorActionsInput) {
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [isCompleteExporting, setIsCompleteExporting] = useState(false);
  const [clearTransitionKey, setClearTransitionKey] = useState(0);
  const clearVersionRef = useRef(0);
  const documentControllerRef = useRef(new DocumentTransactionController());
  const [documentRevision, setDocumentRevision] = useState(0);
  const currentDocumentRef = useRef(parsedState);
  currentDocumentRef.current = parsedState;
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

  function applyDocumentMutation(mutation: EditorDocumentStateMutation) {
    const rollback = onInvalidateDocument();
    setDocumentRevision(documentStateAdapter.queueDocumentMutation(rollback, mutation));
  }

  function beginSongImport(kind: DocumentImportKind) {
    const intent = requestDocumentImport(
      documentControllerRef.current,
      parsedState,
      kind,
      confirmReplaceDocument
    );
    if (intent) documentStateAdapter.queueRollback(onInvalidateDocument());
    return intent;
  }

  function commitSongImport(intent: DocumentImportIntent, song: ParsedSongData, lyrics = "") {
    const revision = documentControllerRef.current.tryCommit(intent);
    if (revision === null) return false;
    setDocumentRevision(revision);
    setState((current) => replaceSongDocument(current, song, lyrics));
    return true;
  }

  function beginAITranslation() {
    // A replacement generation restores its own partial synchronously before
    // this new document intent advances the shared revision.
    onInvalidateDocument("ai-start");
    const snapshot = documentStateAdapter.beginAITranslation();
    setDocumentRevision(snapshot.revision);
    return snapshot;
  }

  function getCurrentDocumentSnapshot() {
    return documentStateAdapter.getDocumentSnapshot();
  }

  function applyAIPartial(
    { text, enabled }: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) {
    return documentStateAdapter.applyAIPartial(
      { text, enabled },
      expectedRevision,
      expectedSongIdentity
    );
  }

  function commitAITranslation(
    { text, enabled }: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) {
    return documentStateAdapter.commitAITranslation(
      { text, enabled },
      expectedRevision,
      expectedSongIdentity
    );
  }

  function clearAllContent() {
    if (!hasClearableLyricContent(parsedState)) {
      onNotify(clearAlreadyEmptyMessage);
      return;
    }

    clearVersionRef.current += 1;
    setCelebrationKey(0);
    setClearTransitionKey((key) => key + 1);
    onClearTransientState();
    applyDocumentMutation(clearLyricContent);
  }

  function handleStyleChange(nextStyle: CardStyle) {
    if (isDocumentSemanticStyleChange(currentDocumentRef.current.style, nextStyle)) {
      applyDocumentMutation((current) => applyEditorStyleChange(current, nextStyle));
      return;
    }
    setState((current) => applyEditorStyleChange(current, nextStyle));
  }

  function setUrl(url: string) {
    applyDocumentMutation((current) => ({ ...current, url }));
  }

  function applyParsedSong(song: ParsedSongData, intent: DocumentImportIntent) {
    return commitSongImport(intent, song);
  }

  function applyLocalAudio(song: ParsedSongData, embeddedLyrics: string | undefined, intent: DocumentImportIntent) {
    return commitSongImport(intent, song, embeddedLyrics ?? "");
  }

  function applySearchedSong(song: ParsedSongData, lyrics: string | undefined, intent: DocumentImportIntent) {
    return commitSongImport(intent, song, lyrics ?? "");
  }

  function setSong(song: SongInfo) {
    applyDocumentMutation((current) => ({ ...current, song: canonicalSongInfo(song) }));
  }

  function setLyrics(lyrics: string) {
    applyDocumentMutation((current) => ({ ...current, lyrics }));
  }

  function setTranslationEnabled(translationEnabled: boolean) {
    applyDocumentMutation((current) => ({
      ...current,
      translationEnabled,
      style: { ...current.style, translationEnabled }
    }));
  }

  function setTranslationText(translationText: string) {
    applyDocumentMutation((current) => ({
      ...current,
      translationText,
      style: { ...current.style, translationText }
    }));
  }

  function setLyricsDocument(snapshot: LyricsDocumentSnapshot) {
    applyDocumentMutation((current) => ({
      ...current,
      lyrics: snapshot.lyrics,
      translationText: snapshot.translationText,
      translationEnabled: snapshot.translationEnabled,
      style: {
        ...current.style,
        translationText: snapshot.translationText,
        translationEnabled: snapshot.translationEnabled
      }
    }));
  }

  async function completeAndExport() {
    const initialBlockMessage = getExportBlockMessage?.() ?? exportBlockMessage;
    if (initialBlockMessage) {
      onNotify(initialBlockMessage);
      return;
    }

    const clearVersion = clearVersionRef.current;
    const snapshot = createExportSnapshot(parsedState, exportPixelRatio, exportRevisionRef.current, exportFormat);
    const result = await runExportTransaction({
      mutex: exportMutexRef.current,
      snapshot,
      mountSnapshot: async (mountedSnapshot, signal) => {
        setIsCompleteExporting(true);
        setActiveExportSnapshot(mountedSnapshot);
        return waitForExportSnapshotNode(() => cardRef.current, mountedSnapshot.id, signal);
      },
      validateSnapshot: (mountedSnapshot) => getExportBlockMessage?.(mountedSnapshot) ?? null,
      captureSnapshot: (mountedSnapshot, node, signal) => exportNodeAsImage(
        node,
        mountedSnapshot.fileName,
        mountedSnapshot.format,
        mountedSnapshot.width,
        mountedSnapshot.height,
        mountedSnapshot.pixelRatio,
        signal
      ),
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
      onNotify(exportBusyMessage);
    } else if (result.kind === "blocked") {
      onNotify(result.reason);
    } else {
      console.error("[Lyric Card Generator] complete export failed", result.error);
      onNotify(exportFailedMessage(result.error instanceof Error ? result.error.message : "Unknown error"));
    }
  }

  async function loadExample(payload: ExampleLoadPayload) {
    const { example, translation, importTranslation = true } = payload;
    const intent = beginSongImport("example");
    if (!intent) return;
    clearVersionRef.current += 1;
    const revision = documentControllerRef.current.tryCommit(intent);
    if (revision === null) return;
    setDocumentRevision(revision);
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

      return {
        ...replaced,
        translationText,
        translationEnabled,
        style: {
          ...normalizeCardStyle(replaced.style),
          translationText,
          translationEnabled
        }
      };
    });
    onCloseExamples();
    onNotify(exampleLoadedMessage);

    const enrichmentIntent = documentControllerRef.current.begin("example-enrichment");
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
        if (enrichedRevision !== null) {
          setDocumentRevision(enrichedRevision);
          setState((current) => ({ ...current, song: canonicalSongInfo(payload.data!) }));
        }
      }
    } catch {
      // The example remains useful offline; cover/palette enrichment is best effort.
    }
  }

  function applyFetchedLyrics(lyrics: string, revision: number, expectedSongIdentity: string) {
    if (!canApplyLyricsCandidate({
      controller: documentControllerRef.current,
      revision,
      expectedSongIdentity,
      currentSong: parsedState.song
    })) return false;
    applyDocumentMutation((current) => ({
      ...current,
      lyrics,
      translationText: "",
      translationEnabled: false,
      style: { ...current.style, translationText: "", translationEnabled: false }
    }));
    return true;
  }

  return {
    celebrationKey,
    isCompleteExporting,
    clearTransitionKey,
    activeExportSnapshot,
    documentRevision,
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
    setSong,
    setLyrics,
    setTranslationEnabled,
    setTranslationText,
    setLyricsDocument,
    applyFetchedLyrics,
    loadExample,
    completeAndExport
  };
}
