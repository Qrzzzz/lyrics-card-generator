import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(file), "utf8");
const lyricEditor = read("components/editor/LyricEditor.tsx");
const editorHeader = read("components/editor/EditorHeader.tsx");
const historyFloor = read("components/editor/HistoryFloor.tsx");
const editorActions = read("components/editor/hooks/useEditorActions.ts");
const editorPreferences = read("components/editor/hooks/useEditorPreferences.ts");
const documentTransactions = read("lib/editor/document-transactions.ts");
const webLiteApp = read("web-lite/WebLiteEditor.tsx");
const globals = read("app/globals.css");

assert.match(lyricEditor, /\{isDesktopShell \? \(\s*<HistoryFloor/);
assert.match(lyricEditor, /onOpenHistory=\{isDesktopShell \? \(\) => setActiveSurface\("history"\) : undefined\}/);
assert.doesNotMatch(webLiteApp, /HistoryFloor|import-history|history-button/, "Web Lite has no history UI or browser fallback");

const examplesIndex = editorHeader.indexOf('data-testid="examples-button"');
const historyIndex = editorHeader.indexOf('data-testid="history-button"');
const clearIndex = editorHeader.indexOf('data-testid="clear-all-button"');
const settingsIndex = editorHeader.indexOf('data-testid="settings-button"');
assert.ok(examplesIndex < historyIndex && historyIndex < clearIndex && clearIndex < settingsIndex, "desktop header action order");

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

console.log(JSON.stringify({ ok: true, importHistoryUiContracts: 32 }, null, 2));
