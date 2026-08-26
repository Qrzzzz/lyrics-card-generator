import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(file), "utf8");
const lyricEditor = read("components/editor/LyricEditor.tsx");
const deferredEditorSurfaces = read("components/editor/DeferredEditorSurfaces.tsx");
const retryableLazySurface = read("components/editor/RetryableLazySurface.tsx");
const editorHeader = read("components/editor/EditorHeader.tsx");
const historyFloor = read("components/editor/HistoryFloor.tsx");
const editorActions = read("components/editor/hooks/useEditorActions.ts");
const editorSteps = read("components/editor/useEditorSteps.tsx");
const desktopApi = read("lib/desktop-api.ts");
const importHistoryTypes = read("lib/import-history.ts");
const importHistoryStore = read("electron/import-history.js");
const desktopMain = read("electron/main.js");
const editorPreferences = read("components/editor/hooks/useEditorPreferences.ts");
const songLinkParser = read("components/editor/SongLinkParser.tsx");
const songSearchParser = read("components/editor/SongSearchParser.tsx");
const localAudioParser = read("components/editor/LocalAudioParser.tsx");
const documentTransactions = read("lib/editor/document-transactions.ts");
const webLiteApp = read("web-lite/WebLiteEditor.tsx");
const webLiteHeader = read("web-lite/WebLiteHeader.tsx");
const webLiteEntry = read("web-lite/entry.tsx");
const globals = read("app/globals.css");
const desktopHistoryInteractions = read("scripts/test-desktop-import-history-interactions.mjs");
const localAudioReplayActions = editorActions.slice(
  editorActions.indexOf('if (replay.kind === "local-audio")'),
  editorActions.indexOf('if (replay.kind === "manual-save")')
);

// These integration contracts ensure History remains desktop-only and that its
// UI wiring reaches the same persistence and transaction layers tested below.
assert.match(
  lyricEditor,
  /\{isDesktopShell \? \(\s*<DeferredHistorySurface[\s\S]*?mounted=\{mountedSurfaces\.history\}/,
  "History remains desktop-only and is mounted only after first use"
);
assert.match(lyricEditor, /const openHistory = useCallback\(\(\) => openSurface\("history"\)/);
assert.match(lyricEditor, /onOpenHistory=\{isDesktopShell \? openHistory : undefined\}/);
assert.match(
  deferredEditorSurfaces,
  /const loadHistoryFloor:[\s\S]*?import\("@\/components\/editor\/HistoryFloor"\)/,
  "the desktop history floor remains a separately loaded module"
);
assert.match(
  deferredEditorSurfaces,
  /<RetryableLazySurface[\s\S]*?loadComponent=\{loadComponent\}[\s\S]*?testId="history-surface-loading"[\s\S]*?testId="history-surface-error"/,
  "the delayed history module owns loading and failure UI inside one local retry boundary"
);
assert.match(retryableLazySurface, /\(\) => lazy\(loadComponent\)[\s\S]*?\[generation, loadComponent\]/);
assert.match(retryableLazySurface, /key=\{generation\}[\s\S]*?renderError=\{\(error\) => renderError\(error, retry\)\}/);
assert.doesNotMatch(
  [webLiteApp, webLiteHeader, webLiteEntry].join("\n"),
  /HistoryFloor|import-history|history-button|manual-save|manualSave|createManualSave|updateManualSave/,
  "Web Lite has no history/manual-save UI or browser fallback"
);

const examplesIndex = editorHeader.indexOf('data-testid="examples-button"');
const historyIndex = editorHeader.indexOf('data-testid="history-button"');
const manualSaveIndex = editorHeader.indexOf('data-testid="manual-save-button"');
const clearIndex = editorHeader.indexOf('data-testid="clear-all-button"');
const settingsIndex = editorHeader.indexOf('data-testid="settings-button"');
assert.ok(
  examplesIndex < historyIndex && historyIndex < manualSaveIndex && manualSaveIndex < clearIndex && clearIndex < settingsIndex,
  "desktop header action order is examples/history/manual-save/clear/settings"
);
const manualSaveButton = editorHeader.slice(manualSaveIndex, editorHeader.indexOf("</button>", manualSaveIndex));
assert.match(manualSaveButton, /aria-label=\{manualSaveLabel\}/);
assert.match(manualSaveButton, /title=\{manualSaveLabel\}/);
assert.doesNotMatch(manualSaveButton, /<span/, "manual save remains icon-only");
assert.match(
  manualSaveButton,
  /disabled=\{manualSaveDisabled \|\| manualSaveState === "saving" \|\| manualSaveState === "unavailable"\}/
);

assert.match(historyFloor, /closeButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
assert.match(historyFloor, /event\.key !== "Escape"/);
assert.match(historyFloor, /aria-hidden=\{!isActive\}/);
assert.match(historyFloor, /hidden=\{!isActive && !exitingVisible\}/);
assert.match(historyFloor, /inert=\{!isActive \? true : undefined\}/);
assert.match(historyFloor, /isActive \? "pointer-events-auto" : "pointer-events-none"/);
assert.match(historyFloor, /y: reduceMotion \? "0%"/);
assert.match(historyFloor, /const PAGE_SIZE = 24/);
assert.match(historyFloor, /offset: records\.length/);
assert.match(historyFloor, /catch \{\s*if \(requestId === requestIdRef\.current\) \{\s*setError\(copy\.loadFailed\)/);
assert.match(historyFloor, /data-testid="history-search"/);
assert.match(historyFloor, /data-testid="history-source-filter"/);
assert.match(historyFloor, /await showSystemConfirm\(/);
assert.match(historyFloor, /message: dialogCopy\.clearHistoryTitle/);
assert.match(historyFloor, /detail: copy\.clearConfirm/);
assert.doesNotMatch(historyFloor, /window\.(?:confirm|alert)/);
assert.match(historyFloor, /<option value="manual-save">\{copy\.sourceManualSave\}<\/option>/);
assert.match(historyFloor, /record\.kind === "manual-save" \? Save : RotateCcw/);
assert.match(historyFloor, /record\.kind === "manual-save"[\s\S]*?copy\.loadManualSave/);
assert.match(historyFloor, /onRecordRemoved\(recordId\)/);
assert.match(historyFloor, /onHistoryCleared\(\)/);

assert.match(documentTransactions, /"history-replay"/);
assert.match(editorActions, /const committed = commitSongImport\(intent, song\);[\s\S]*?if \(committed\) \{[\s\S]*?queueImportHistoryRecord/);
assert.match(editorActions, /if \(!context\.uploaded\) return;[\s\S]*?kind: "manual-cover"/);
assert.match(editorActions, /const intent = await beginSongImport\("history-replay"\)/);
assert.match(editorActions, /desktop\.replayImportHistory\(recordId\)/);
assert.match(editorActions, /if \(!replay\.ok\) \{[\s\S]*?intent\.cancel\(\)/);
assert.match(editorActions, /const committed = await commitHistoryReplay\(replay, intent\)/);
assert.match(editorActions, /if \(!committed\) return \{ status: "cancelled" \}/);
assert.match(editorActions, /desktop\.commitImportHistoryReplay\(/);
assert.match(editorActions, /readReplayAudioFile\(desktop, replay\.file, intent\.signal\)/);
assert.match(editorActions, /desktop\.readImportHistoryFileChunk\(file\.streamToken\)/);
assert.match(editorActions, /length > MAX_IMPORT_HISTORY_AUDIO_CHUNK_BYTES/);
assert.match(editorActions, /signal\.addEventListener\("abort", abortStream/);
assert.match(editorActions, /finally \{[\s\S]*?desktop\.releaseImportHistoryFile\(file\.streamToken\)/);
assert.doesNotMatch(
  localAudioReplayActions,
  /replay\.file\.bytes/,
  "local-audio replay never receives the complete file as one IPC value"
);
assert.match(editorActions, /"relocationToken" in replay \? replay\.relocationToken : undefined/);
assert.match(editorActions, /historySaveFailed/);
assert.match(editorActions, /bindingAtStart\?\.savedRevision === revision[\s\S]*?manualSaveUnchanged[\s\S]*?return/);
assert.match(
  editorActions,
  /serializeImportHistoryManualSave\(input\)[\s\S]*?desktop\.updateManualSave\(bindingAtStart\.recordId, envelope\)[\s\S]*?desktop\.createManualSave\(envelope\)/,
  "manual-save writes cross the desktop bridge only as a renderer-built canonical string envelope"
);
assert.match(
  importHistoryTypes,
  /serializeImportHistoryManualSave[\s\S]*?version: 2[\s\S]*?snapshot: \{\s*source: snapshot\.source,\s*title: snapshot\.title,\s*artist: snapshot\.artist,\s*album: snapshot\.album \?\? "",\s*explicit: snapshot\.explicit === true,\s*originalCoverUrl: snapshot\.originalCoverUrl \?\? "",\s*coverUrl: snapshot\.coverUrl \?\? "",\s*originalUrl: snapshot\.originalUrl \?\? "",\s*finalUrl: snapshot\.finalUrl \?\? "",\s*parseMethod: snapshot\.parseMethod \?\? "",\s*lyrics: text\.source,\s*translationText: text\.translation,\s*translationEnabled: snapshot\.translationEnabled,\s*lyricDocument/,
  "the renderer serializer emits the canonical ordered v2 document snapshot"
);
assert.match(
  importHistoryStore,
  /MANUAL_SAVE_SNAPSHOT_FIELDS = Object\.freeze\(\[[\s\S]*?"lyricDocument"[\s\S]*?keys\.length !== expectedFields\.length[\s\S]*?key !== expectedFields\[index\][\s\S]*?SONG_SOURCES\.has\(source\.value\)[\s\S]*?lyricDocumentV2FieldsFit/,
  "the Store requires canonical legacy or v2 fields and validates the structured document"
);
assert.match(
  importHistoryStore,
  /function normalizeManualSongUrls\(original, final\)[\s\S]*?identityState === "ambiguous"[\s\S]*?return null[\s\S]*?original\.identityKey !== final\.identityKey[\s\S]*?originalUrl: provenanceUrl, finalUrl: provenanceUrl/,
  "manual archives reject any ambiguous URL before resolving one replay provenance URL"
);
assert.match(
  desktopApi,
  /typeof value === "string"[\s\S]*?createManualSave: [\s\S]*?isManualSaveEnvelope\(envelope\)[\s\S]*?bridge\.createManualSaveEnvelope\(envelope\)/,
  "the public renderer service rejects object inputs before contextBridge"
);
assert.match(editorActions, /result\.code === "not_found" \|\| result\.code === "invalid_kind"/);
assert.match(editorActions, /manualSaveSessionRef\.current === sessionAtStart/);
assert.match(
  editorActions,
  /bindLoadedManualSave\([\s\S]*?replay\.record\.id,[\s\S]*?revision,[\s\S]*?snapshot\.finalUrl \|\| snapshot\.originalUrl \|\| ""[\s\S]*?\)/,
  "manual replay provenance binds the exact sanitized replay URL"
);
assert.match(editorActions, /handleHistoryRecordRemoved[\s\S]*?startNewManualSaveSession/);
const commitHistoryReplayIndex = editorActions.indexOf("async function commitHistoryReplay");
const manualReplayIndex = editorActions.indexOf('if (replay.kind === "manual-save")', commitHistoryReplayIndex);
const manualReplayBranch = editorActions.slice(
  manualReplayIndex,
  editorActions.indexOf("const coverUrl = URL.createObjectURL")
);
assert.doesNotMatch(manualReplayBranch, /fetch\(/, "manual-save replay commits its stored snapshot without network parsing");
assert.match(
  manualReplayBranch,
  /coverUrl: snapshot\.coverUrl \|\| snapshot\.originalCoverUrl \|\| ""/,
  "manual-save replay restores its sanitized cover URL so the normal image proxy and palette flow can run"
);
assert.match(
  editorActions,
  /migrateLyricDocumentV2\(snapshot\.lyricDocument, snapshot\)[\s\S]*?withLyricDocument\(replaced, lyricDocument, snapshot\.translationEnabled\)/,
  "manual replay restores v2 identity and migrates legacy text snapshots"
);
assert.match(
  editorActions,
  /type ManualReplayProvenance = \{[\s\S]*?recordId: string;[\s\S]*?replayUrl: string;[\s\S]*?\};/
);
assert.match(
  editorActions,
  /function bindLoadedManualSave\(recordId: string, savedRevision: number, replayUrl: string\)[\s\S]*?replaceManualReplayProvenance\(\{[\s\S]*?recordId,[\s\S]*?replayUrl[\s\S]*?\}\)/,
  "manual-save replay binding records explicit provenance"
);
assert.match(
  editorActions,
  /function setUrl\(url: string\)[\s\S]*?replaceManualReplayProvenance\(null\)[\s\S]*?applyDocumentMutation/,
  "an explicit URL edit releases manual-replay auto-parse suppression"
);
assert.match(
  editorActions,
  /function createSongLinkAutoParseVisitIntent\(\)[\s\S]*?manualReplayProvenanceRef\.current[\s\S]*?manualSaveBindingRef\.current[\s\S]*?replayProvenance\.replayUrl === currentDocumentRef\.current\.url[\s\S]*?allowAutoParse: !replayStillOwnsCurrentUrl/,
  "each navigation visit captures one immutable decision from synchronous replay provenance and the exact current URL"
);
assert.match(
  songLinkParser,
  /handledAutoParseVisitRef\.current === autoParseVisitIntent\.id[\s\S]*?handledAutoParseVisitRef\.current = autoParseVisitIntent\.id;[\s\S]*?autoParseVisitIntent\.allowAutoParse[\s\S]*?void parseUrl\(\)[\s\S]*?\[autoParseOnMount, autoParseVisitIntent\.id\]/,
  "the parser consumes each immutable navigation intent at most once"
);
assert.match(
  editorSteps,
  /autoParseVisitIntent=\{songLinkAutoParseVisitIntent\}/,
  "the parser receives the explicit song-import navigation intent"
);
assert.match(
  lyricEditor,
  /function changeEditorStep\(nextStep: number\)[\s\S]*?nextStep === 0 && currentStep !== 0[\s\S]*?setSongLinkAutoParseVisitIntent\(createSongLinkAutoParseVisitIntent\(\)\)[\s\S]*?onStepChange=\{changeEditorStep\}/,
  "the real navigation event creates the visit intent independently of animation remount timing"
);
assert.match(
  desktopHistoryInteractions,
  /replayedCover[\s\S]*?manual-save replay routes the archived cover through the image proxy[\s\S]*?manual-save replay does not restore stripped cover tokens[\s\S]*?routeCountsBeforeManualReplayRemount[\s\S]*?roundTrip <= 2[\s\S]*?manual replay does not reparse the song across remount/,
  "desktop regression covers restored cover loading and repeated component remounts after a URL-bearing manual replay"
);
assert.match(
  desktopHistoryInteractions,
  /routeCountsBeforeExplicitUrlImport[\s\S]*?editing the replay URL alone performs no request[\s\S]*?explicit URL edit restores exactly one normal auto-parse request on the next mount[\s\S]*?waitForManualSaveState\("create"\)/,
  "desktop regression covers explicit URL release and detachment from the prior manual save"
);
assert.match(
  desktopHistoryInteractions,
  /publicGetterCalls[\s\S]*?publicProxyOwnKeys[\s\S]*?contextBridge probe documents Electron's one caller-getter execution[\s\S]*?no history file side effect/,
  "packaged regression distinguishes caller-side contextBridge cloning from product storage effects"
);
assert.match(
  desktopHistoryInteractions,
  /NetEase song identity while removing credentials[\s\S]*?manual replay retains its exact sanitized song identity[\s\S]*?manual replay does not reparse the song across remount/,
  "packaged replay keeps the allowlisted song ID without reparsing it across remounts"
);
assert.match(
  desktopHistoryInteractions,
  /ipcCanonicalContract[\s\S]*?unknown snapshot field[\s\S]*?missing required artist[\s\S]*?unsupported source enum[\s\S]*?non-canonical envelopes create no history file/,
  "packaged IPC regression rejects parse-and-project candidates without persistence"
);
assert.match(
  desktopHistoryInteractions,
  /packaged IPC rejects conflicting original\/final song identities[\s\S]*?originalUrl: "https:\/\/music\.163\.com\/#\/song\?id=70001[\s\S]*?roundTrip <= 2[\s\S]*?manual replay remount retains the original update binding/,
  "packaged replay regression covers equivalent URL representations, repeated remounts, and retained binding"
);
assert.match(
  desktopHistoryInteractions,
  /pendingCloseLyrics = [^\n]+\.repeat\(4_000\)[\s\S]*?updateManualSave\(recordId[\s\S]*?UI replay restores all 4,000 seeded lyric lines/,
  "pending-close regression seeds and replays the large archive through the real preload/store/UI path"
);
assert.match(
  desktopHistoryInteractions,
  /Object\.getOwnPropertyDescriptor\(HTMLTextAreaElement\.prototype, "value"\)[\s\S]*?new InputEvent\("input"[\s\S]*?new Event\("change"[\s\S]*?real React document transaction/,
  "pending-close regression uses a bounded native edit while retaining the real React transaction"
);
assert.doesNotMatch(
  desktopHistoryInteractions,
  /fill\(pendingCloseLyrics\)/,
  "the 4,000-line pending-close fixture cannot regress to Playwright's per-character fill path"
);
for (const [name, source] of [
  ["link", songLinkParser],
  ["search", songSearchParser],
  ["local audio", localAudioParser]
] as const) {
  assert.match(
    source,
    /catch \(error\) \{\s*const wasAborted = intent\.signal\.aborted;\s*intent\.cancel\(\);/,
    `${name} failure settles its document intent`
  );
}
assert.match(
  localAudioParser,
  /accept="[^"]*\.m4a[^"]*audio\/mp4[^"]*audio\/m4a[^"]*audio\/x-m4a[^"]*"/,
  "the local-audio picker exposes M4A extensions and browser MIME variants"
);
assert.match(
  importHistoryStore,
  /AUDIO_EXTENSIONS = new Set\(\["\.mp3", "\.flac", "\.m4a"\]\)/,
  "desktop history accepts M4A files for registration and replay"
);
assert.match(
  desktopMain,
  /extensions: \["mp3", "flac", "m4a"\][\s\S]*?if \(extension === "\.m4a"\) return "audio\/mp4"/,
  "desktop relocation and replay preserve M4A selection and MIME identity"
);
assert.doesNotMatch(editorActions, /loadExample[\s\S]{0,500}queueImportHistoryRecord/, "built-in examples are not recorded");
assert.match(
  editorPreferences,
  /onPersisted: \(_result, snapshot\) => \{\s*committedUserSettingsRef\.current = snapshot\.value\.userSettings/,
  "the committed settings snapshot advances after each durable save"
);
assert.doesNotMatch(
  editorPreferences,
  /await flushPreferenceSave\(\);\s*committedUserSettingsRef\.current = normalized/,
  "an older caller cannot overwrite a newer durable settings snapshot after a shared flush"
);

assert.match(globals, /\.history-grid/);
assert.match(globals, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.history-card/);
assert.match(
  globals,
  /@media \(max-width: 760px\)[\s\S]*?\.app-shell\[data-desktop-shell="true"\][\s\S]*?\.editor-header-actions--stepper \.app-button > span/,
  "narrow icon-only adaptation remains scoped to the desktop shell"
);

console.log(JSON.stringify({ ok: true, importHistoryUiContracts: 82 }, null, 2));
