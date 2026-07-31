import type { SongSource } from "@/lib/types";

export type ImportHistoryKind = "link" | "search" | "local-audio" | "manual-cover";
export type ImportHistoryFileKind = Extract<ImportHistoryKind, "local-audio" | "manual-cover">;
export type ImportHistoryLimit = 5 | 10 | "unlimited";

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
};

export type ImportHistoryListResult = {
  records: ImportHistoryRecord[];
  total: number;
  notice: {
    code: "corrupt_recovered";
    backupFileName: string;
  } | null;
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
    }
  | {
      kind: "search";
      query: string;
      platform: "netease";
      songId: string;
      pageUrl?: string;
      display: ImportHistoryDisplayInput;
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
  originalUrl?: string;
  finalUrl?: string;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
};

export type ImportHistoryWriteResult =
  | { ok: true; record: ImportHistoryRecord }
  | { ok: false; code: string };

export type ImportHistoryFileRegistration = {
  token: string;
};

export type ImportHistoryReplayFile = {
  bytes: Uint8Array;
  fileName: string;
  size: number;
  mtimeMs: number;
  mimeType: string;
  changed: boolean;
};

export type ImportHistoryReplayResult =
  | {
      ok: true;
      kind: "link";
      record: ImportHistoryRecord;
      url: string;
    }
  | {
      ok: true;
      kind: "search";
      record: ImportHistoryRecord;
      query: string;
      platform: "netease";
      songId: string;
      pageUrl: string;
    }
  | {
      ok: true;
      kind: "local-audio";
      record: ImportHistoryRecord;
      file: ImportHistoryReplayFile;
    }
  | {
      ok: true;
      kind: "manual-cover";
      record: ImportHistoryRecord;
      file: ImportHistoryReplayFile;
      snapshot: ImportHistoryManualSnapshot;
    }
  | {
      ok: false;
      code: string;
      canRelocate?: boolean;
    };

export type ImportHistoryReplayUiResult =
  | { status: "success" }
  | { status: "missing" }
  | { status: "cancelled" }
  | { status: "error" };
