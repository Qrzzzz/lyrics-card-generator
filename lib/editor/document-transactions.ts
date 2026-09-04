import { getHighResolutionCoverUrl } from "@/lib/cover-url";
import { proxiedImageUrl } from "@/lib/image-utils";
import { createLyricDocumentV2, hasAuthoredLyrics } from "@/lib/lyrics-document-v2";
import { withLyricDocument } from "@/lib/lyrics-document-state";
import type { AppState, ParsedSongData, SongInfo } from "@/lib/types";

export type DocumentImportKind =
  | "search"
  | "link"
  | "local-audio"
  | "history-replay"
  | "example"
  | "example-enrichment";

export type DocumentImportIntent = {
  id: number;
  kind: DocumentImportKind;
  baseRevision: number;
  signal: AbortSignal;
  cancel: () => void;
};

type ActiveIntent = {
  token: DocumentImportIntent;
  controller: AbortController;
};

/**
 * Grants one optimistic import intent at a time. Both token identity and the
 * base document revision must still match at commit, preventing late network
 * results from replacing edits made after an import began.
 */
export class DocumentTransactionController {
  private revision = 0;
  private nextIntentId = 0;
  private active: ActiveIntent | null = null;

  get currentRevision() {
    return this.revision;
  }

  get hasActiveIntent() {
    return this.active !== null;
  }

  begin(kind: DocumentImportKind): DocumentImportIntent {
    this.abortActive();
    const controller = new AbortController();
    const id = ++this.nextIntentId;
    const token: DocumentImportIntent = {
      id,
      kind,
      baseRevision: this.revision,
      signal: controller.signal,
      cancel: () => this.cancel(id)
    };
    this.active = { token, controller };
    return token;
  }

  tryCommit(token: DocumentImportIntent) {
    if (
      token.signal.aborted ||
      token.baseRevision !== this.revision ||
      this.active?.token.id !== token.id
    ) {
      return null;
    }
    this.active = null;
    this.revision += 1;
    return this.revision;
  }

  mutate() {
    this.abortActive();
    this.revision += 1;
    return this.revision;
  }

  isCurrentRevision(revision: number) {
    return revision === this.revision;
  }

  dispose() {
    this.abortActive();
  }

  private cancel(id: number) {
    if (this.active?.token.id !== id) return;
    this.active.controller.abort();
    this.active = null;
  }

  private abortActive() {
    this.active?.controller.abort();
    this.active = null;
  }
}

export function requestDocumentImport(
  controller: DocumentTransactionController,
  state: AppState,
  kind: DocumentImportKind,
  confirmReplace: () => boolean
) {
  if (hasAuthoredDocument(state) && !confirmReplace()) {
    return null;
  }
  return controller.begin(kind);
}

export function hasAuthoredDocument(state: AppState) {
  return Boolean(
    state.song.title.trim() ||
    state.song.artist.trim() ||
    state.song.album?.trim() ||
    state.song.coverUrl?.trim() ||
    hasAuthoredLyrics(state.lyricDocument)
  );
}

export function replaceSongDocument(current: AppState, parsed: ParsedSongData, lyrics = ""): AppState {
  const song = canonicalSongInfo(parsed);
  // Translation and palette state belong to the previous song and must be
  // cleared atomically with the document replacement.
  return withLyricDocument({
    ...current,
    url: song.originalUrl ?? "",
    song,
    style: {
      ...current.style,
      translationText: "",
      translationEnabled: false,
      extractedPalette: undefined
    },
    palette: undefined,
    paletteWarning: "",
    coverArtwork: undefined
  }, createLyricDocumentV2(lyrics, ""), false);
}

export function canonicalSongInfo(parsed: ParsedSongData | SongInfo): SongInfo {
  const originalCoverUrl = parsed.originalCoverUrl ?? parsed.coverUrl ?? "";
  const coverUrl = getHighResolutionCoverUrl(parsed.coverUrl ?? originalCoverUrl, parsed.source);
  return {
    source: parsed.source,
    title: parsed.title,
    artist: parsed.artist,
    album: parsed.album ?? "",
    explicit: parsed.explicit ?? false,
    originalCoverUrl,
    coverUrl,
    proxiedCoverUrl: coverUrl ? proxiedImageUrl(coverUrl) : "",
    originalUrl: parsed.originalUrl ?? "",
    finalUrl: parsed.finalUrl ?? "",
    parseMethod: parsed.parseMethod ?? ""
  };
}

export function songDocumentIdentity(song: SongInfo) {
  // A non-printing separator avoids ambiguous concatenation without changing
  // or normalizing user-authored title and artist text.
  return [song.source, song.originalUrl ?? "", song.finalUrl ?? "", song.title, song.artist].join("\u001f");
}

export function canApplyLyricsCandidate(params: {
  controller: DocumentTransactionController;
  revision: number;
  expectedSongIdentity: string;
  currentSong: SongInfo;
}) {
  return params.controller.isCurrentRevision(params.revision) &&
    params.expectedSongIdentity === songDocumentIdentity(params.currentSong);
}
