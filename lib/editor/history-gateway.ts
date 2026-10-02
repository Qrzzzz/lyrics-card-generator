import { createAppRequestHeaders } from "@/lib/app-request";
import { getLyricsCardDesktopApi, type LyricsCardDesktopApi } from "@/lib/desktop-api";
import { replaceSongDocument, type DocumentImportIntent, type DocumentTransactionController } from "@/lib/editor/document-transactions";
import { withLyricDocument } from "@/lib/lyrics-document-state";
import { migrateLyricDocumentV2 } from "@/lib/lyrics-document-v2";
import { MAX_LOCAL_AUDIO_BYTES } from "@/lib/local-audio-limits";
import type { AppState, ParsedSongData, SongInfo } from "@/lib/types";
import type { ImportHistoryManualSnapshot, ImportHistoryReplayAudioFile, ImportHistoryReplayResult } from "@/lib/import-history";
import type { EditorDraftLoad } from "@/lib/editor-draft";

export type EditorHistoryPorts = {
  autosave: {
    restore: (loaded: EditorDraftLoad, authorize: () => boolean) => Promise<AppState | null>;
    reset: (state: AppState, recordId?: string) => void;
    markUnsaved: () => void;
  };
  documentController: DocumentTransactionController;
  currentDocumentRef: { current: AppState };
  setState: (state: AppState) => void;
  settleTrackedDocumentIntent: (id?: number) => void;
  onInvalidateDocument: () => unknown;
  startNewManualSaveSession: () => void;
  setDocumentRevision: (revision: number) => void;
  commitSongImport: (intent: DocumentImportIntent, song: ParsedSongData, lyrics: string, invalidate: boolean) => boolean;
  bindLegacyRemoteReplay: (id: string) => void;
  bindLoadedManualSave: (id: string, revision: number, url: string) => void;
};
type HistorySongParseResponse =
  | { ok: true; data: ParsedSongData }
  | { ok: false; error?: string };

type HistorySearchResolveResponse =
  | { ok: true; data: { song: ParsedSongData; lyrics?: string } }
  | { ok: false; error?: string };

type HistoryLocalAudioResponse =
  | { ok: true; data: ParsedSongData; status: "success" | "no-lyrics" }
  | { ok: false; error?: string };


/** Replays saved content with one cancellation owner; callers own UI notices. */
export async function commitEditorHistoryReplay(replay: Extract<ImportHistoryReplayResult, { ok: true }>, intent: DocumentImportIntent, ports: EditorHistoryPorts) {
  const { autosave, documentController, currentDocumentRef, setState, settleTrackedDocumentIntent, onInvalidateDocument, startNewManualSaveSession, setDocumentRevision, commitSongImport, bindLegacyRemoteReplay, bindLoadedManualSave } = ports;
    if (replay.kind === "draft") {
      // Restore assets before committing the transaction; no remote reparse is involved.
      let revision: number | null = null;
      const restored = await autosave.restore(replay.draft, () => {
        revision = documentController.tryCommit(intent);
        settleTrackedDocumentIntent(intent.id);
        if (revision === null) { intent.cancel(); return false; }
        onInvalidateDocument();
        startNewManualSaveSession();
        setDocumentRevision(revision);
        return true;
      });
      if (!restored) return null;
      currentDocumentRef.current = restored;
      let persistencePending = false;
      try {
        if (!await getLyricsCardDesktopApi()?.activateEditorDraft(replay.record.id)) throw new Error("draft_activation_failed");
      } catch {
        // The UI has already restored the draft. Keep it dirty so close/retry
        // persists the active pointer instead of claiming the document is unchanged.
        persistencePending = true;
        autosave.markUnsaved();
      }
      return { revision, persistencePending };
    }
    if ((replay.kind === "link" || replay.kind === "search") && replay.lyricsSnapshot) {
      const url = replay.kind === "link" ? replay.url : replay.pageUrl || `https://music.163.com/song?id=${replay.songId}`;
      let song: ParsedSongData = {
        source: (["qq", "netease", "apple", "spotify"].includes(replay.record.source) ? replay.record.source : "unknown") as SongInfo["source"], title: replay.record.title,
        artist: replay.record.artist, album: replay.record.album, originalUrl: url
      };
      let coverFailed = false;
      try {
        const response = await fetch("/api/parse-song", {
          method: "POST", headers: createAppRequestHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ url }), signal: intent.signal
        });
        const payload = await response.json() as HistorySongParseResponse;
        if (!payload.ok) throw new Error("history_cover_parse_failed");
        // Song identity/text are the saved history's; only the cover is refreshed remotely.
        song = { ...song, coverUrl: payload.data.coverUrl, originalCoverUrl: payload.data.originalCoverUrl,
          parseMethod: payload.data.parseMethod };
        coverFailed = !song.coverUrl && !song.originalCoverUrl;
      } catch {
        if (intent.signal.aborted) return null;
        coverFailed = true;
      }
      if (!commitSongImport(intent, song, "", true)) return null;
      const restored = withLyricDocument(currentDocumentRef.current, replay.lyricsSnapshot.lyricDocument,
        replay.lyricsSnapshot.translationEnabled);
      currentDocumentRef.current = restored;
      setState(restored);
      autosave.reset(restored, replay.record.id);
      return { revision: documentController.currentRevision, coverFailed };
    }
    if (replay.kind === "link") {
      const response = await fetch("/api/parse-song", {
        method: "POST",
        headers: createAppRequestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ url: replay.url }),
        signal: intent.signal
      });
      const payload = await response.json() as HistorySongParseResponse;
      if (!payload.ok) throw new Error(payload.error || "history_link_replay_failed");
      if (!commitSongImport(intent, payload.data, payload.data.lyrics ?? "", true)) return null;
      bindLegacyRemoteReplay(replay.record.id);
      return { revision: documentController.currentRevision };
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
      if (!commitSongImport(intent, payload.data.song, payload.data.lyrics ?? "", true)) return null;
      bindLegacyRemoteReplay(replay.record.id);
      return { revision: documentController.currentRevision };
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
      if (!commitSongImport(intent, payload.data, payload.data.lyrics ?? "", true)) return null;
      autosave.reset(currentDocumentRef.current, replay.record.id);
      return { revision: documentController.currentRevision };
    }

    if (replay.kind === "manual-save") {
      const revision = documentController.tryCommit(intent);
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
      const restored = replaceWithHistorySnapshot(currentDocumentRef.current, snapshot, {
        // Manual archives replay their persisted semantic snapshot without reparsing
        // the song. Restoring only the sanitized cover URL lets the existing image
        // proxy and palette flow load the archived cover safely.
        coverUrl: snapshot.coverUrl || snapshot.originalCoverUrl || "",
        originalCoverUrl: snapshot.originalCoverUrl || snapshot.coverUrl || "",
        parseMethod: snapshot.parseMethod || "import-history-manual-save"
      });
      currentDocumentRef.current = restored;
      setState(restored);
      // Preserve legacy manual archives. Continuing one creates a new automatic draft.
      autosave.reset(restored);
      return { revision };
    }

    const coverUrl = URL.createObjectURL(new Blob(
      [copyReplayBytes(replay.file.bytes)],
      { type: replay.file.mimeType }
    ));
    const revision = documentController.tryCommit(intent);
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
    const restored = replaceWithHistorySnapshot(currentDocumentRef.current, snapshot, {
      coverUrl,
      originalCoverUrl: "",
      parseMethod: "import-history-manual-cover"
    });
    currentDocumentRef.current = restored;
    setState(restored);
    autosave.reset(restored, replay.record.id);
    return { revision };
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
