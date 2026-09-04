import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SongLinkParser } from "../../../components/editor/SongLinkParser";
import { LocalAudioParser } from "../../../components/editor/LocalAudioParser";
import { SongSearchParser } from "../../../components/editor/SongSearchParser";
import { useEditorActions } from "../../../components/editor/hooks/useEditorActions";
import { useEditorAutosave } from "../../../components/editor/hooks/useEditorAutosave";
import { defaultState } from "../../../components/editor/editor-defaults";
import { withLyricPlainText } from "../../../lib/lyrics-document-state";
import { createT } from "../../../lib/i18n";
import type { LyricsCardDesktopApi } from "../../../lib/desktop-api";
import type { EditorDraftSnapshot } from "../../../lib/editor-draft";
import type { DocumentImportKind } from "../../../lib/editor/document-transactions";
import type { AppState, ParsedSongData } from "../../../lib/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const writeGate = deferred<void>();
const responseGate = deferred<void>();
const confirmations: ReturnType<typeof deferred<boolean>>[] = [];
const writes: EditorDraftSnapshot[] = [];
const requests: string[] = [];
const outcomes: (number | null)[] = [];
const notices: string[] = [];
let failWrite = false;
let confirmMode: boolean | "defer" = true;
let holdResponse = false;
let latest: { state: AppState; actions: ReturnType<typeof useEditorActions> };
type Surface = "link" | "audio" | "search" | "none";
let setSurface: (surface: Surface) => void;
const song: ParsedSongData = {
  source: "netease", title: "Imported fixture", artist: "Fixture artist", lyrics: "REMOTE LYRICS",
  originalUrl: "https://music.163.com/song?id=1", finalUrl: "https://music.163.com/song?id=1"
};

window.lyricsCardDesktop = {
  loadActiveEditorDraft: async () => ({ ok: true, data: null }),
  beginEditorDraft: async () => ({ ok: true, data: { recordId: "fixture-record", token: "fixture-lease" } }),
  writeEditorDraft: async (_id: string, _token: string, _revision: number, raw: string) => {
    writes.push(JSON.parse(raw));
    await writeGate.promise;
    return failWrite ? { ok: false, code: "write_failed" } : { ok: true };
  },
  recordImportHistory: async () => ({ ok: true, record: { id: "fixture-record" } }),
  registerImportFile: async () => ({ token: "fixture-file" })
} as unknown as LyricsCardDesktopApi;

window.fetch = async (input, init) => {
  if (input === "/api/search-song") return Response.json({ ok: true, data: [{
    ...song, id: "1", artists: [song.artist], pageUrl: song.originalUrl
  }] });
  if (input === "/api/resolve-searched-song") {
    requests.push("search");
    return Response.json({ ok: true, data: { song, lyrics: song.lyrics } });
  }
  requests.push(typeof init?.body === "string" ? JSON.parse(init.body).url : "local-audio");
  if (holdResponse) await responseGate.promise;
  if (init?.signal?.aborted) throw new DOMException("Cancelled fixture", "AbortError");
  return Response.json({ ok: true, data: song, status: "success" });
};

function Fixture() {
  const [state, setState] = useState(() => withLyricPlainText({
    ...structuredClone(defaultState), locale: "en", url: "https://music.163.com/song?id=1"
  }, "ORIGINAL LYRICS", ""));
  const [surface, updateSurface] = useState<Surface>("link");
  setSurface = updateSurface;
  const autosave = useEditorAutosave({
    state, view: { step: 0, exportFormat: "png", exportQuality: "high" }, enabled: true,
    onRestore: (next) => setState(next)
  });
  const actions = useEditorActions({
    autosave, parsedState: state, setState, cardRef: useRef<HTMLElement>(null),
    exportPixelRatio: 1, exportFormat: "png", exportBusyMessage: "busy", exportFailedMessage: "failed",
    copyImageSuccessMessage: "copied", copyImageFailedMessage: "failed", exportImageTooLargeMessage: "large",
    exampleLoadedMessage: "loaded", clearAlreadyEmptyMessage: "empty",
    confirmReplaceDocument: () => {
      const confirmation = deferred<boolean>();
      confirmations.push(confirmation);
      if (confirmMode !== "defer") confirmation.resolve(confirmMode);
      return confirmation.promise;
    },
    onNotify: (message) => { notices.push(message); },
    onCloseExamples() {}, onCloseHistory() {}, onClearTransientState() {},
    onInvalidateDocument: () => undefined, isManualSaveBlocked: () => false
  });
  latest = { state, actions };
  return <>
    <div data-testid="ready">{String(autosave.ready)}</div>
    <div data-testid="pending">{String(actions.isDocumentTransactionPending)}</div>
    <div data-testid="lyrics">{state.lyrics}</div>
    <div data-testid="url">{state.url}</div>
    {surface === "link" && <SongLinkParser url={state.url} onUrlChange={actions.setUrl}
      beginImport={(signal) => actions.beginSongImport("link", signal)} onParsed={actions.applyParsedSong} t={createT("en")} />}
    {surface === "audio" && <LocalAudioParser beginImport={(signal) => actions.beginSongImport("local-audio", signal)}
      onParsed={actions.applyLocalAudio} t={createT("en")} />}
    {surface === "search" && <SongSearchParser beginImport={(signal) => actions.beginSongImport("search", signal)}
      onResolved={actions.applySearchedSong} t={createT("en")} />}
  </>;
}

const root = createRoot(document.getElementById("root")!);
export const harness = {
  start: () => root.render(<Fixture />),
  releaseWrites: (fail = false) => { failWrite = fail; writeGate.resolve(); },
  deferConfirmations: () => { confirmMode = "defer"; },
  rejectConfirmations: () => { confirmMode = false; },
  confirm: (index: number, accepted: boolean) => confirmations[index].resolve(accepted),
  edit: (kind: "url" | "lyrics" | "document") => {
    if (kind === "url") latest.actions.setUrl("https://music.163.com/song?id=2");
    else if (kind === "lyrics") latest.actions.setLyrics("NEW LYRICS DURING WAIT");
    else latest.actions.setSong({ source: "unknown", title: "New document", artist: "New artist" });
  },
  begin: (kind: DocumentImportKind) => {
    void latest.actions.beginSongImport(kind).then((intent) => {
      outcomes.push(intent?.baseRevision ?? null);
      if (intent) latest.actions.applyParsedSong(song, intent, { inputUrl: song.originalUrl! });
    });
  },
  surface: (surface: Surface) => setSurface(surface),
  unmount: () => root.unmount(),
  holdResponse: () => { holdResponse = true; },
  releaseResponse: () => responseGate.resolve(),
  snapshot: () => ({
    requests: [...requests], outcomes: [...outcomes], notices: [...notices], confirmations: confirmations.length,
    writes: writes.map((snapshot) => snapshot.content.lyrics), lyrics: latest.state.lyrics,
    title: latest.state.song.title, revision: latest.actions.documentRevision
  })
};
export type ImportRaceHarness = typeof harness;
(window as unknown as { __importRace: ImportRaceHarness }).__importRace = harness;
