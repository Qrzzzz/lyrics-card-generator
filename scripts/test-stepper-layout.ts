import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __internalStepperLayout } from "../components/editor/hooks/useBalancedStepperLayout";
import { revokeReplacedBlobUrl } from "../lib/object-url-lifecycle";

const { chooseStepperLayout } = __internalStepperLayout;

assert.deepEqual(
  chooseStepperLayout({
    containerWidth: 960,
    itemWidths: [100, 80, 72, 112, 104, 72],
    stepCount: 6,
    gapPx: 8,
    comfortableMinItemWidth: 96,
    compactMinItemWidth: 76
  }),
  { columns: 6, compact: false },
  "wide container should use one balanced row"
);

assert.deepEqual(
  chooseStepperLayout({
    containerWidth: 520,
    itemWidths: [100, 80, 72, 112, 104, 72],
    stepCount: 6,
    gapPx: 8,
    comfortableMinItemWidth: 96,
    compactMinItemWidth: 76
  }),
  { columns: 3, compact: false },
  "medium container should use 3 + 3"
);

assert.deepEqual(
  chooseStepperLayout({
    containerWidth: 220,
    itemWidths: [100, 80, 72, 112, 104, 72],
    stepCount: 6,
    gapPx: 8,
    comfortableMinItemWidth: 96,
    compactMinItemWidth: 76
  }),
  { columns: 2, compact: true },
  "narrow container should use compact 2 + 2 + 2"
);

assert.deepEqual(
  chooseStepperLayout({
    containerWidth: 360,
    itemWidths: [190, 176, 164, 184, 188, 172],
    stepCount: 6,
    gapPx: 8,
    comfortableMinItemWidth: 96,
    compactMinItemWidth: 76
  }),
  { columns: 2, compact: true },
  "compact fallback should prefer 2 + 2 + 2 over a heavily truncated 3 + 3"
);

const stepperSource = readFileSync(resolve("components/editor/SettingsStepper.tsx"), "utf8");
const webLiteEditorSource = readFileSync(resolve("web-lite/WebLiteEditor.tsx"), "utf8");
assert.ok(
  stepperSource.includes(': "content-start self-start"'),
  "default and Web Lite steps keep natural height instead of stretching to the preview column"
);
assert.ok(
  !stepperSource.includes("useMeasuredStepperPanelHeight"),
  "stepper header is not padded by a fixed measured minimum height"
);
assert.ok(
  stepperSource.includes("lyrics-stepper-actions flex items-center justify-between gap-3"),
  "step navigation uses the same borderless shell on every step"
);
assert.ok(
  stepperSource.includes("!isFirstStep ? (") &&
    stepperSource.includes('data-testid="stepper-back-button"') &&
    stepperSource.includes('data-testid="stepper-next-button"'),
  "step one omits Back while later steps retain explicit Back and Next controls"
);
assert.ok(
  stepperSource.includes('"focus" | "lyrics-workspace" | "preview-workbench"'),
  "step metadata exposes all supported desktop presentations"
);
assert.ok(
  stepperSource.includes('activeStep?.presentation ?? "preview-workbench"'),
  "steps without presentation metadata preserve the preview-workbench default"
);
assert.ok(
  stepperSource.includes("grid-rows-[auto_minmax(0,1fr)_auto]"),
  "lyrics workspace pins chrome around one bounded content row"
);
assert.ok(
  stepperSource.includes("isLyricsWorkspace && activeStep.managesOwnScroll"),
  "workspace content can own its only scrolling surface"
);
assert.ok(
  stepperSource.includes("compactChrome = false"),
  "compact chrome is opt-in so shared Web Lite rendering stays unchanged"
);
assert.ok(
  stepperSource.includes("headerActions?: ReactNode") &&
    stepperSource.includes('data-stepper-header-actions="true"'),
  "desktop chrome can place editor actions inside the stepper heading row"
);
assert.ok(
  stepperSource.includes("companionAside?: ReactNode") &&
    stepperSource.includes("settings-stepper-workbench") &&
    stepperSource.includes('data-stepper-companion="true"'),
  "shared chrome can span a content column and any companion panel"
);
assert.ok(
  stepperSource.includes('hasCompanionAside && isFocus && "min-[960px]:col-span-2"') &&
    stepperSource.includes("min-[960px]:col-start-2"),
  "the shared rail still spans the two-column focus presentation"
);
assert.ok(
  stepperSource.includes('hasCompanionAside && isFocus && "max-[959px]:order-2 min-[960px]:col-start-1') &&
    stepperSource.includes('className="min-h-0 min-w-0 max-[959px]:order-3 min-[960px]:col-start-2'),
  "the narrow focus layout keeps primary search before alternate import methods"
);
assert.ok(
  stepperSource.includes('data-testid="preview-workbench-track"') &&
    stepperSource.includes('data-workbench-panel="editor-settings"') &&
    stepperSource.includes('data-workbench-panel="preview"') &&
    stepperSource.includes('data-workbench-panel="export-settings"'),
  "preview steps use one ordered three-panel track"
);
assert.ok(
  stepperSource.includes('animate={{ x: isExportWorkbench ? "calc(-33.333333% - 0.416667rem)" : "0%" }}') &&
    stepperSource.includes('aria-hidden={isExportWorkbench}') &&
    stepperSource.includes('inert={!isExportWorkbench ? true : undefined}'),
  "the export step pans the whole track while keeping off-screen settings inert"
);
assert.ok(
  stepperSource.includes("const isComplete = index < currentStep"),
  "checkmarks represent steps completed before the active step"
);
assert.ok(
  stepperSource.includes('data-ready={isReady ? "true" : "false"}') &&
    stepperSource.includes('data-complete={isComplete ? "true" : "false"}'),
  "semantic readiness stays separate from positional step completion"
);

const editorSource = readFileSync(resolve("components/editor/LyricEditor.tsx"), "utf8");
assert.ok(
  editorSource.includes("compactChrome") &&
    !editorSource.includes("const usesUnifiedStepperChrome = currentStep > 0"),
  "all six desktop steps opt into one compact stepper chrome"
);
assert.ok(
  !editorSource.includes("const showLegacyEditorHeader = currentStep === 0") &&
    (editorSource.match(/<EditorHeader\b/g)?.length ?? 0) === 0,
  "the editor surface no longer renders the legacy app header above or below examples"
);
assert.ok(
  editorSource.includes('placement="stepper"') &&
    editorSource.includes("headerActions={"),
  "all editor steps embed the shared action group in the stepper"
);
assert.ok(
  editorSource.includes("companionAside={") &&
    editorSource.includes(") : activeSettingsStep?.aside"),
  "step one and preview steps place their companion panels inside the shared workbench"
);
assert.ok(
  webLiteEditorSource.includes("companionAside={") &&
    webLiteEditorSource.includes("pressureEnabled={currentStep >= 2}"),
  "Web Lite shares the preview/export workbench and limits pressure feedback to steps three through six"
);

const songImportAsideSource = readFileSync(resolve("components/editor/SongImportAside.tsx"), "utf8");
const editorStepsSource = readFileSync(resolve("components/editor/useEditorSteps.tsx"), "utf8");
const editorEffectsSource = readFileSync(resolve("components/editor/hooks/useLyricEditorEffects.ts"), "utf8");
assert.ok(
  editorStepsSource.includes("song-import-primary__alternates") &&
    editorStepsSource.includes("<SongLinkParser") &&
    editorStepsSource.includes("<LocalAudioParser"),
  "link and local-audio imports sit below the primary search in the left column"
);
assert.ok(
  !songImportAsideSource.includes("linkParser:") &&
    !songImportAsideSource.includes("localAudioParser:") &&
    songImportAsideSource.includes('data-testid="song-import-cover"'),
  "the right column is reserved for cover and song metadata"
);
assert.ok(
  songImportAsideSource.includes("max-w-80") &&
    songImportAsideSource.includes("min-[960px]:max-w-none"),
  "the large song cover stays bounded when the companion column stacks on narrow screens"
);
assert.ok(
  editorStepsSource.includes('testId: "song-info-toggle"') &&
    editorStepsSource.includes("expanded: songInfoExpanded") &&
    editorStepsSource.includes("controls: songInfoRegionId") &&
    editorStepsSource.includes("buttonRef: songInfoToggleRef") &&
    stepperSource.includes("ref={secondaryAction.buttonRef}") &&
    stepperSource.includes("aria-controls={secondaryAction.controls}"),
  "manual song metadata disclosure exposes its state, controlled region, and return-focus target"
);
assert.ok(
    songImportAsideSource.includes('role="region"') &&
    songImportAsideSource.includes("id={manualRegionId}") &&
    songImportAsideSource.includes('data-song-info-view={manualExpanded ? "editor" : "summary"}') &&
    songImportAsideSource.includes('data-testid="song-info-summary"') &&
    songImportAsideSource.includes('data-testid="song-info-editor"'),
  "the metadata aside swaps summary and editor views inside one stable labelled region"
);
assert.ok(
  songImportAsideSource.includes('mode="popLayout"') &&
    songImportAsideSource.includes('data-testid="song-info-save"') &&
    songImportAsideSource.includes('data-testid="song-info-cancel"'),
  "manual song metadata editing crossfades in one panel and provides explicit save and cancel actions"
);
assert.ok(
  editorStepsSource.includes("useState<SongInfo>") &&
    editorStepsSource.includes("onSongChange={updateSongInfoDraft}") &&
    editorStepsSource.includes("handlers.onSongChange({ ...songInfoDraft })") &&
    editorStepsSource.includes("songInfoEditRevision !== documentRevision") &&
    editorStepsSource.includes("songInfoDraftCoverRef") &&
    editorStepsSource.includes("revokeReplacedBlobUrl"),
  "manual song metadata stays in a guarded draft until one explicit save transaction"
);
assert.ok(
  editorEffectsSource.includes("useSongCoverObjectUrlLifecycle") &&
    editorEffectsSource.includes("reconcileBlobUrlRetirement") &&
    editorSource.includes("activeExportSnapshot?.song.coverUrl"),
  "committed local cover object URLs wait for any active export snapshot before retirement"
);
assert.ok(
  stepperSource.includes("flex min-w-0 flex-wrap items-center justify-end") &&
    stepperSource.indexOf("{secondaryAction ? (") < stepperSource.indexOf("data-testid=\"stepper-next-button\""),
  "secondary action remains before Next and wraps safely in a narrow action row"
);
assert.ok(
  songImportAsideSource.includes('data-song-import-panel="true"') &&
    songImportAsideSource.match(/className="glass-panel/g)?.length === 1,
  "cover, song metadata, and manual editing share one companion panel"
);

const lyricsWorkspaceSource = readFileSync(resolve("components/editor/LyricsWorkspace.tsx"), "utf8");
const lyricsToolsSource = readFileSync(resolve("components/editor/LyricsToolsAside.tsx"), "utf8");
const globalsSource = readFileSync(resolve("app/globals.css"), "utf8");
assert.ok(
  globalsSource.includes(".preview-workbench-track") &&
    globalsSource.includes("width: calc(150% + 0.625rem);") &&
    globalsSource.includes("grid-template-columns: repeat(3, minmax(0, 1fr));") &&
    globalsSource.includes('.preview-workbench-export[data-active="false"]'),
  "desktop uses a three-panel horizontal track while narrow layouts hide inactive settings"
);
assert.ok(
  lyricsWorkspaceSource.includes('className="relative flex min-h-0 flex-col overflow-hidden"') &&
    lyricsWorkspaceSource.includes("lyrics-workspace-column lyrics-summary-aside") &&
    lyricsWorkspaceSource.includes("lyrics-workspace-column lyrics-document-column") &&
    lyricsToolsSource.includes("lyrics-workspace-column lyrics-tools-aside"),
  "the lyrics workspace and its three columns do not render framed panel shells"
);
assert.ok(
  globalsSource.includes(".lyrics-workspace-column + .lyrics-workspace-column") &&
    globalsSource.includes("border-left: 1px solid rgb(var(--panel-border));"),
  "lyrics columns use only one thin responsive divider between neighbours"
);

const originalRevokeObjectUrl = URL.revokeObjectURL;
const revokedObjectUrls: string[] = [];
URL.revokeObjectURL = (url) => {
  revokedObjectUrls.push(url);
};
try {
  assert.equal(revokeReplacedBlobUrl("https://example.com/cover.png", ""), false);
  assert.equal(revokeReplacedBlobUrl("blob:kept", "blob:kept"), false);
  assert.equal(revokeReplacedBlobUrl("blob:committed", "blob:draft", "blob:committed"), false);
  assert.equal(revokeReplacedBlobUrl("blob:discarded", "blob:next"), true);
  assert.deepEqual(revokedObjectUrls, ["blob:discarded"]);
} finally {
  URL.revokeObjectURL = originalRevokeObjectUrl;
}

console.log(JSON.stringify({ ok: true, stepperLayoutTests: 45 }, null, 2));
