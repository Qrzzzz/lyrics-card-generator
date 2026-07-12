"use client";

import { useRef, useState } from "react";
import { normalizeCardStyle } from "@/lib/card-style-normalize";
import { clearLyricContent, hasClearableLyricContent } from "@/lib/clear-content";
import { applyEditorStyleChange } from "@/lib/editor/apply-style-change";
import { exportNodeAsPng } from "@/lib/export-image";
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
  songDocumentIdentity,
  type DocumentImportIntent,
  type DocumentImportKind
} from "@/lib/editor/document-transactions";
import type { ExampleLoadPayload } from "@/lib/examples";
import type {
  AppState,
  CardStyle,
  ParsedSongData,
  SongInfo
} from "@/lib/types";

type TranslationValue = {
  text: string;
  enabled: boolean;
};

type UseEditorActionsInput = {
  parsedState: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  cardRef: React.RefObject<HTMLElement | null>;
  exportPixelRatio: number;
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
  onInvalidateDocument: () => void;
};

export function useEditorActions({
  parsedState,
  setState,
  cardRef,
  exportPixelRatio,
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
  const [activeExportSnapshot, setActiveExportSnapshot] = useState<ExportSnapshot | null>(null);
  const exportMutexRef = useRef(new ExportTransactionMutex());
  const exportRevisionRef = useRef(0);
  const previousExportStateRef = useRef(parsedState);
  if (previousExportStateRef.current !== parsedState) {
    previousExportStateRef.current = parsedState;
    exportRevisionRef.current += 1;
  }

  function markDocumentMutation() {
    onInvalidateDocument();
    setDocumentRevision(documentControllerRef.current.mutate());
  }

  function beginSongImport(kind: DocumentImportKind) {
    const intent = requestDocumentImport(
      documentControllerRef.current,
      parsedState,
      kind,
      confirmReplaceDocument
    );
    if (intent) onInvalidateDocument();
    return intent;
  }

  function commitSongImport(intent: DocumentImportIntent, song: ParsedSongData, lyrics = "") {
    const revision = documentControllerRef.current.tryCommit(intent);
    if (revision === null) return false;
    setDocumentRevision(revision);
    setState((current) => replaceSongDocument(current, song, lyrics));
    return true;
  }

  function setTranslation({ text, enabled }: TranslationValue) {
    markDocumentMutation();
    setState((current) => ({
      ...current,
      translationText: text,
      translationEnabled: enabled,
      style: {
        ...current.style,
        translationText: text,
        translationEnabled: enabled
      }
    }));
  }

  function clearAllContent() {
    if (!hasClearableLyricContent(parsedState)) {
      onNotify(clearAlreadyEmptyMessage);
      return;
    }

    clearVersionRef.current += 1;
    markDocumentMutation();
    setCelebrationKey(0);
    setClearTransitionKey((key) => key + 1);
    onClearTransientState();
    setState(clearLyricContent);
  }

  function handleStyleChange(nextStyle: CardStyle) {
    setState((current) => applyEditorStyleChange(current, nextStyle));
  }

  function setUrl(url: string) {
    markDocumentMutation();
    setState((current) => ({ ...current, url }));
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
    markDocumentMutation();
    setState((current) => ({ ...current, song: canonicalSongInfo(song) }));
  }

  function setLyrics(lyrics: string) {
    markDocumentMutation();
    setState((current) => ({ ...current, lyrics }));
  }

  function setTranslationEnabled(translationEnabled: boolean) {
    markDocumentMutation();
    setState((current) => ({
      ...current,
      translationEnabled,
      style: { ...current.style, translationEnabled }
    }));
  }

  function setTranslationText(translationText: string) {
    markDocumentMutation();
    setState((current) => ({
      ...current,
      translationText,
      style: { ...current.style, translationText }
    }));
  }

  function splitAlternatingLyrics(lyrics: string, translationText: string) {
    markDocumentMutation();
    setState((current) => ({
      ...current,
      lyrics,
      translationText,
      translationEnabled: true,
      style: {
        ...current.style,
        translationText,
        translationEnabled: true
      }
    }));
  }

  async function completeAndExport() {
    const initialBlockMessage = exportBlockMessage;
    if (initialBlockMessage) {
      onNotify(initialBlockMessage);
      return;
    }

    const clearVersion = clearVersionRef.current;
    const snapshot = createExportSnapshot(parsedState, exportPixelRatio, exportRevisionRef.current);
    const result = await runExportTransaction({
      mutex: exportMutexRef.current,
      snapshot,
      mountSnapshot: async (mountedSnapshot) => {
        setIsCompleteExporting(true);
        setActiveExportSnapshot(mountedSnapshot);
        return waitForExportSnapshotNode(() => cardRef.current, mountedSnapshot.id);
      },
      validateSnapshot: (mountedSnapshot) => getExportBlockMessage?.(mountedSnapshot) ?? null,
      captureSnapshot: (mountedSnapshot, node) => exportNodeAsPng(
        node,
        mountedSnapshot.fileName,
        mountedSnapshot.width,
        mountedSnapshot.height,
        mountedSnapshot.pixelRatio
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
        headers: { "content-type": "application/json" },
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
    markDocumentMutation();
    setState((current) => ({
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
    setTranslation,
    setUrl,
    applyParsedSong,
    applyLocalAudio,
    applySearchedSong,
    setSong,
    setLyrics,
    setTranslationEnabled,
    setTranslationText,
    splitAlternatingLyrics,
    applyFetchedLyrics,
    loadExample,
    completeAndExport
  };
}
