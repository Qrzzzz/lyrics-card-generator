import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import {
  canApplyLyricsCandidate,
  DocumentTransactionController,
  replaceSongDocument,
  requestDocumentImport,
  songDocumentIdentity
} from "../lib/editor/document-transactions";
import type { AppState, ParsedSongData } from "../lib/types";

const songA: ParsedSongData = {
  source: "netease",
  title: "Song A",
  artist: "Artist A",
  album: "Album A",
  explicit: true,
  coverUrl: "https://example.com/a.jpg",
  originalUrl: "https://music.example/a",
  finalUrl: "https://music.example/final-a",
  parseMethod: "fixture"
};
const songB: ParsedSongData = {
  source: "qq",
  title: "Song B",
  artist: "Artist B",
  originalUrl: "https://music.example/b"
};

{
  const controller = new DocumentTransactionController();
  const a = controller.begin("link");
  const b = controller.begin("search");
  assert.equal(a.signal.aborted, true);
  assert.equal(controller.tryCommit(a), null, "A cannot commit after the later B intent");
  assert.equal(controller.tryCommit(b), 1, "B wins even when A completes later");
}

{
  const controller = new DocumentTransactionController();
  const pending = controller.begin("local-audio");
  assert.equal(controller.mutate(), 1, "clear/manual replacement advances the document revision");
  assert.equal(pending.signal.aborted, true);
  assert.equal(controller.tryCommit(pending), null);
}

{
  const controller = new DocumentTransactionController();
  const existing: AppState = {
    ...defaultState,
    song: { ...songA },
    lyrics: "original A",
    translationText: "translation A",
    translationEnabled: true,
    style: {
      ...defaultState.style,
      translationText: "translation A",
      translationEnabled: true
    }
  };
  let confirms = 0;
  const cancelled = requestDocumentImport(controller, existing, "search", () => {
    confirms += 1;
    return false;
  });
  assert.equal(cancelled, null);
  assert.equal(confirms, 1);
  assert.equal(controller.currentRevision, 0, "cancelled replacement leaves the document untouched");
}

{
  const existing: AppState = {
    ...defaultState,
    song: { ...songA, proxiedCoverUrl: "/api/image-proxy?a" },
    lyrics: "original A",
    translationText: "translation A",
    translationEnabled: true,
    style: {
      ...defaultState.style,
      translationText: "translation A",
      translationEnabled: true
    }
  };
  const replaced = replaceSongDocument(existing, songB, "original B");
  assert.equal(replaced.lyrics, "original B");
  assert.equal(replaced.translationText, "");
  assert.equal(replaced.translationEnabled, false);
  assert.equal(replaced.style.translationText, "");
  assert.equal(replaced.song.coverUrl, "");
  assert.equal(replaced.song.proxiedCoverUrl, "");
  assert.equal(replaced.song.explicit, false);
  assert.equal(replaced.song.finalUrl, "");
  assert.equal(replaced.song.parseMethod, "");

  const noLyrics = replaceSongDocument(existing, songB);
  assert.equal(noLyrics.lyrics, "", "a no-lyrics import cannot retain song A's original text");
  assert.equal(noLyrics.translationText, "", "a no-lyrics import cannot retain song A's translation");
}

{
  const controller = new DocumentTransactionController();
  const token = controller.begin("search");
  assert.equal(controller.tryCommit(token), 1);
  const current = replaceSongDocument(defaultState, songB, "original B");
  const identity = songDocumentIdentity(current.song);
  assert.equal(canApplyLyricsCandidate({ controller, revision: 1, expectedSongIdentity: identity, currentSong: current.song }), true);
  controller.mutate();
  assert.equal(canApplyLyricsCandidate({ controller, revision: 1, expectedSongIdentity: identity, currentSong: current.song }), false);
  assert.equal(canApplyLyricsCandidate({ controller, revision: 2, expectedSongIdentity: identity, currentSong: songA }), false);
}

console.log("document transaction race tests passed");
