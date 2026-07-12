import assert from "node:assert/strict";
import { defaultState } from "../components/editor/editor-defaults";
import {
  AITranslationTransactionController,
  type AITranslationDocumentIntent
} from "../lib/editor/ai-translation-transaction";
import {
  DocumentTransactionController,
  replaceSongDocument,
  songDocumentIdentity
} from "../lib/editor/document-transactions";
import type { AppState, ParsedSongData } from "../lib/types";

type TranslationValue = { text: string; enabled: boolean };

const songA: ParsedSongData = {
  source: "netease",
  title: "Song A",
  artist: "Artist A",
  originalUrl: "https://music.example/a"
};
const songB: ParsedSongData = {
  source: "qq",
  title: "Song B",
  artist: "Artist B",
  originalUrl: "https://music.example/b"
};

function createHarness() {
  const documents = new DocumentTransactionController();
  const translations = new AITranslationTransactionController<TranslationValue>();
  let state: AppState = {
    ...replaceSongDocument(defaultState, songA, "lyrics A"),
    translationText: "old A",
    translationEnabled: true,
    style: {
      ...defaultState.style,
      translationText: "old A",
      translationEnabled: true
    }
  };
  const intent = translations.begin(
    documents.currentRevision,
    songDocumentIdentity(state.song),
    { text: state.translationText, enabled: state.translationEnabled }
  );

  function writeIfCurrent(token: AITranslationDocumentIntent<TranslationValue>, next: TranslationValue) {
    if (!translations.isCurrent(token, documents.currentRevision, songDocumentIdentity(state.song))) return false;
    state = {
      ...state,
      translationText: next.text,
      translationEnabled: next.enabled,
      style: { ...state.style, translationText: next.text, translationEnabled: next.enabled }
    };
    return true;
  }

  return {
    documents,
    translations,
    intent,
    get state() { return state; },
    set state(next: AppState) { state = next; },
    writeIfCurrent
  };
}

function emitPartial(
  stream: ReturnType<typeof createHarness>,
  text: string
) {
  const wrote = stream.writeIfCurrent(stream.intent, { text, enabled: true });
  if (wrote) stream.intent.hasWrittenPartial = true;
  return wrote;
}

{
  const stream = createHarness();
  assert.equal(emitPartial(stream, "partial A"), true);
  stream.translations.invalidate(stream.intent);
  const importB = stream.documents.begin("search");
  const revision = stream.documents.tryCommit(importB);
  assert.equal(revision, 1);
  stream.state = replaceSongDocument(stream.state, songB, "lyrics B");

  assert.equal(stream.writeIfCurrent(stream.intent, { text: "final A", enabled: true }), false);
  assert.equal(stream.writeIfCurrent(stream.intent, stream.intent.previousTranslation), false);
  assert.equal(stream.state.song.title, "Song B");
  assert.equal(stream.state.translationText, "", "stale final/catch cannot write song A translation into song B");
}

{
  const stream = createHarness();
  assert.equal(emitPartial(stream, "partial A"), true);
  stream.translations.invalidate(stream.intent);
  stream.documents.mutate();
  stream.state = {
    ...stream.state,
    lyrics: "",
    translationText: "",
    translationEnabled: false,
    style: { ...stream.state.style, translationText: "", translationEnabled: false }
  };

  assert.equal(stream.writeIfCurrent(stream.intent, { text: "late after clear", enabled: true }), false);
  assert.equal(stream.writeIfCurrent(stream.intent, stream.intent.previousTranslation), false);
  assert.equal(stream.state.translationText, "", "clear wins over stale stream completion and recovery");
  assert.equal(stream.state.style.translationText, "", "clear also keeps the rendered translation empty");
}

{
  const stream = createHarness();
  assert.equal(emitPartial(stream, "partial A"), true);
  assert.equal(stream.writeIfCurrent(stream.intent, stream.intent.previousTranslation), true);
  stream.translations.invalidate(stream.intent);
  const pendingImport = stream.documents.begin("link");

  assert.equal(stream.writeIfCurrent(stream.intent, stream.intent.previousTranslation), false);
  assert.equal(stream.writeIfCurrent(stream.intent, { text: "late A", enabled: true }), false);
  assert.equal(pendingImport.signal.aborted, false, "stale AI catch must not abort the newer import intent");
  assert.equal(stream.state.translationText, "old A", "external invalidation restores only the still-current document");
}

{
  const stream = createHarness();
  assert.equal(emitPartial(stream, "partial A"), true);
  assert.equal(stream.writeIfCurrent(stream.intent, stream.intent.previousTranslation), true);
  assert.equal(stream.state.translationText, "old A", "same-revision provider failure or user cancel restores the prior value");
}

console.log("AI translation transaction race tests passed");
