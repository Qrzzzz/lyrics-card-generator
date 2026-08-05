import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(file), "utf8");
const lyricEditor = read("components/editor/LyricEditor.tsx");
const editorHeader = read("components/editor/EditorHeader.tsx");
const historyFloor = read("components/editor/HistoryFloor.tsx");
const editorActions = read("components/editor/hooks/useEditorActions.ts");
const editorSteps = read("components/editor/useEditorSteps.tsx");
const desktopApi = read("lib/desktop-api.ts");
const importHistoryTypes = read("lib/import-history.ts");
const importHistoryStore = read("electron/import-history.js");
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

assert.match(lyricEditor, /\{isDesktopShell \? \(\s*<HistoryFloor/);
assert.match(lyricEditor, /onOpenHistory=\{isDesktopShell \? \(\) => setActiveSurface\("history"\) : undefined\}/);
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
assert.match(historyFloor, /window\.confirm\(copy\.clearConfirm\)/);
assert.match(historyFloor, /<option value="manual-save">\{copy\.sourceManualSave\}<\/option>/);
assert.match(historyFloor, /record\.kind === "manual-save" \? Save : RotateCcw/);
assert.match(historyFloor, /record\.kind === "manual-save"[\s\S]*?copy\.loadManualSave/);
assert.match(historyFloor, /onRecordRemoved\(recordId\)/);
assert.match(historyFloor, /onHistoryCleared\(\)/);

assert.match(documentTransactions, /"history-replay"/);
assert.match(editorActions, /const committed = commitSongImport\(intent, song\);[\s\S]*?if \(committed\) \{[\s\S]*?queueImportHistoryRecord/);
assert.match(editorActions, /if \(!context\.uploaded\) return;[\s\S]*?kind: "manual-cover"/);
assert.match(editorActions, /const intent = beginSongImport\("history-replay"\)/);
assert.match(editorActions, /desktop\.replayImportHistory\(recordId\)/);
assert.match(editorActions, /if \(!replay\.ok\) \{[\s\S]*?intent\.cancel\(\)/);
assert.match(editorActions, /const committed = await commitHistoryReplay\(replay, intent\)/);
assert.match(editorActions, /if \(!committed\) return \{ status: "cancelled" \}/);
assert.match(editorActions, /desktop\.commitImportHistoryReplay\(/);
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
  /serializeImportHistoryManualSave[\s\S]*?version: 1[\s\S]*?snapshot: \{[\s\S]*?translationEnabled: snapshot\.translationEnabled/,
  "the renderer serializer constructs only the whitelisted semantic snapshot"
);
assert.match(
  importHistoryStore,
  /MANUAL_SAVE_SNAPSHOT_FIELDS = Object\.freeze\(\[[\s\S]*?"translationEnabled"[\s\S]*?keys\.length !== MANUAL_SAVE_SNAPSHOT_FIELDS\.length[\s\S]*?SONG_SOURCES\.has\(source\.value\)/,
  "the Store requires every canonical field, rejects extras, and enforces the source enum"
);
assert.match(
  importHistoryStore,
  /function normalizeManualSongUrls\(original, final\)[\s\S]*?original\.identityKey !== final\.identityKey[\s\S]*?return null[\s\S]*?originalUrl: provenanceUrl, finalUrl: provenanceUrl/,
  "manual archives reject conflicting identities and expose one replay provenance URL"
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
assert.match(manualReplayBranch, /coverUrl: ""/, "manual-save replay cannot reactivate a remote cover URL");
assert.match(editorActions, /const translationEnabled = snapshot\.translationEnabled;/);
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
  /routeCountsBeforeManualReplayRemount[\s\S]*?roundTrip <= 2[\s\S]*?manual replay remains local across song-import remount/,
  "desktop regression covers repeated component remounts after a URL-bearing manual replay"
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
  /NetEase song identity while removing credentials[\s\S]*?manual replay retains its exact sanitized song identity[\s\S]*?manual replay remains local across song-import remount/,
  "packaged replay keeps the allowlisted song ID with zero remount network activity"
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

console.log(JSON.stringify({ ok: true, importHistoryUiContracts: 76 }, null, 2));
