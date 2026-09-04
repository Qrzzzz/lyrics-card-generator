import type { SongSource } from "@/lib/types";
import {
  cloneLyricDocument,
  migrateLyricDocumentV2,
  serializeLyricDocument,
  type LyricDocumentV2
} from "@/lib/lyrics-document-v2";

export type ImportHistoryKind = "link" | "search" | "local-audio" | "manual-cover" | "manual-save";
export type ImportHistoryFileKind = Extract<ImportHistoryKind, "local-audio" | "manual-cover">;
export type ImportHistoryLimit = "none" | 5 | 10 | "unlimited";
export type ManualSaveButtonState = "create" | "update" | "current" | "saving" | "unavailable";

export type ImportHistoryRecord = {
  id: string;
  kind: ImportHistoryKind;
  title: string;
  artist: string;
  album: string;
  source: string;
  importedAt: number;
  detail: string;
  remoteCoverUrl?: string;
  hasLyricsSnapshot?: boolean;
};

export type RemoteLyricsSnapshot = {
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  lyricDocument: LyricDocumentV2;
};

export type HistoryTransferPreview = {
  version: string;
  added: number;
  duplicates: number;
  trimmed: number;
};

export type HistoryTransferResult<T> = { ok: true; data: T } | { ok: false; code: string };
export const MAX_HISTORY_TRANSFER_CHARACTERS = 16 * 1024 * 1024;

export type ImportHistoryListResult = {
  records: ImportHistoryRecord[];
  total: number;
  notice: {
    code: "corrupt_recovered";
    backupFileName: string;
  } | null;
};

export type ImportHistoryStats = {
  total: number;
  automaticTotal: number;
  manualTotal: number;
  version: string;
};

export type ImportHistoryTrimConfirmation = {
  expectedVersion: string;
  confirmedTrimCount: number;
};

export type ImportHistoryDisplayInput = {
  title: string;
  artist: string;
  album?: string;
  source: string;
  remoteCoverUrl?: string;
};

export type LinkImportHistoryContext = {
  inputUrl: string;
};

export type SearchImportHistoryContext = {
  query: string;
  platform: "netease";
  songId: string;
  pageUrl?: string;
};

export type LocalAudioImportHistoryContext = {
  fileToken?: string;
};

export type ManualCoverImportHistoryContext = {
  uploaded: boolean;
  fileToken?: string;
};

export type ImportHistoryWriteCandidate =
  | {
      kind: "link";
      inputUrl: string;
      normalizedUrl?: string;
      finalUrl?: string;
      display: ImportHistoryDisplayInput;
      lyricsSnapshot?: RemoteLyricsSnapshot;
    }
  | {
      kind: "search";
      query: string;
      platform: "netease";
      songId: string;
      pageUrl?: string;
      display: ImportHistoryDisplayInput;
      lyricsSnapshot?: RemoteLyricsSnapshot;
    }
  | {
      kind: "local-audio";
      fileToken?: string;
      display: ImportHistoryDisplayInput;
    }
  | {
      kind: "manual-cover";
      fileToken?: string;
      display: ImportHistoryDisplayInput;
      snapshot: ImportHistoryManualSnapshot;
    };

export type ImportHistoryManualSnapshot = {
  title: string;
  artist: string;
  album?: string;
  source: SongSource;
  explicit?: boolean;
  originalCoverUrl?: string;
  coverUrl?: string;
  originalUrl?: string;
  finalUrl?: string;
  parseMethod?: string;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  /** v2 snapshots persist stable block/unit identities; absent values are migrated from legacy text. */
  lyricDocument?: LyricDocumentV2;
};

export type ImportHistoryManualSaveInput = {
  snapshot: ImportHistoryManualSnapshot;
};

export type ImportHistoryManualSaveEnvelope = string & {
  readonly __manualSaveEnvelope: unique symbol;
};

const MANUAL_SAVE_SOURCES = new Set<SongSource>(["qq", "netease", "apple", "spotify", "unknown"]);

/**
 * Validates and serializes a manual snapshot before it crosses the desktop IPC
 * boundary. The branded result prevents ordinary strings from reaching the
 * privileged persistence methods through the typed renderer API.
 */
export function serializeImportHistoryManualSave(
  input: ImportHistoryManualSaveInput
): ImportHistoryManualSaveEnvelope | null {
  const snapshot = input.snapshot;
  if (
    !MANUAL_SAVE_SOURCES.has(snapshot.source) ||
    typeof snapshot.title !== "string" ||
    typeof snapshot.artist !== "string" ||
    (snapshot.album !== undefined && typeof snapshot.album !== "string") ||
    (snapshot.explicit !== undefined && typeof snapshot.explicit !== "boolean") ||
    (snapshot.originalCoverUrl !== undefined && typeof snapshot.originalCoverUrl !== "string") ||
    (snapshot.coverUrl !== undefined && typeof snapshot.coverUrl !== "string") ||
    (snapshot.originalUrl !== undefined && typeof snapshot.originalUrl !== "string") ||
    (snapshot.finalUrl !== undefined && typeof snapshot.finalUrl !== "string") ||
    (snapshot.parseMethod !== undefined && typeof snapshot.parseMethod !== "string") ||
    typeof snapshot.lyrics !== "string" ||
    typeof snapshot.translationText !== "string" ||
    typeof snapshot.translationEnabled !== "boolean"
  ) {
    return null;
  }

  const lyricDocument = cloneLyricDocument(migrateLyricDocumentV2(snapshot.lyricDocument, snapshot));
  const text = serializeLyricDocument(lyricDocument);

  return JSON.stringify({
    version: 2,
    snapshot: {
      source: snapshot.source,
      title: snapshot.title,
      artist: snapshot.artist,
      album: snapshot.album ?? "",
      explicit: snapshot.explicit === true,
      originalCoverUrl: snapshot.originalCoverUrl ?? "",
      coverUrl: snapshot.coverUrl ?? "",
      originalUrl: snapshot.originalUrl ?? "",
      finalUrl: snapshot.finalUrl ?? "",
      parseMethod: snapshot.parseMethod ?? "",
      lyrics: text.source,
      translationText: text.translation,
      translationEnabled: snapshot.translationEnabled,
      lyricDocument
    }
  }) as ImportHistoryManualSaveEnvelope;
}

export type ImportHistoryWriteResult =
  | { ok: true; record: ImportHistoryRecord }
  | { ok: false; code: string };

export type ImportHistoryFileRegistration = {
  token: string;
};

export type ImportHistoryReplayFileMetadata = {
  fileName: string;
  size: number;
  mtimeMs: number;
  mimeType: string;
  changed: boolean;
};

export type ImportHistoryReplayAudioFile = ImportHistoryReplayFileMetadata & {
  streamToken: string;
};

export type ImportHistoryReplayBytesFile = ImportHistoryReplayFileMetadata & {
  bytes: Uint8Array;
};

export type ImportHistoryFileChunkResult =
  | { ok: true; bytes: Uint8Array; done: boolean }
  | { ok: false; code: string };

export type ImportHistoryReplayResult =
  | {
      ok: true;
      kind: "link";
      record: ImportHistoryRecord;
      url: string;
      lyricsSnapshot?: RemoteLyricsSnapshot;
    }
  | {
      ok: true;
      kind: "search";
      record: ImportHistoryRecord;
      query: string;
      platform: "netease";
      songId: string;
      pageUrl: string;
      lyricsSnapshot?: RemoteLyricsSnapshot;
    }
  | {
      ok: true;
      kind: "local-audio";
      record: ImportHistoryRecord;
      file: ImportHistoryReplayAudioFile;
      relocationToken?: string;
    }
  | {
      ok: true;
      kind: "manual-cover";
      record: ImportHistoryRecord;
      file: ImportHistoryReplayBytesFile;
      snapshot: ImportHistoryManualSnapshot;
      relocationToken?: string;
    }
  | {
      ok: true;
      kind: "manual-save";
      record: ImportHistoryRecord;
      snapshot: ImportHistoryManualSnapshot;
    }
  | {
      ok: false;
      code: string;
      canRelocate?: boolean;
    };

export type ImportHistoryReplayCommitResult = {
  ok: boolean;
  code?: string;
};

export type ImportHistoryReplayUiResult =
  | { status: "success" }
  | { status: "missing" }
  | { status: "cancelled" }
  | { status: "error" };
