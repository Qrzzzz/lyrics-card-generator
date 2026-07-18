import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __internalStepperLayout } from "../components/editor/hooks/useBalancedStepperLayout";
import {
  __internalPreviewWorkbenchSplit,
  resolvePreviewWorkbenchSplit,
  resolvePreviewWorkbenchTrack
} from "../components/editor/hooks/usePreviewWorkbenchSplit";
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

const equalWorkbench = resolvePreviewWorkbenchSplit({ viewportWidth: 1216, requestedRatio: 0.5 });
assert.equal(equalWorkbench.ratio, 0.5, "the preview workbench defaults to an equal split");
assert.ok(
  Math.abs(equalWorkbench.settingsWidth - equalWorkbench.previewWidth) < 0.001,
  "the default split gives settings and preview the same usable width"
);

const wideWorkbench = resolvePreviewWorkbenchSplit({
  viewportWidth: 1216,
  requestedRatio: __internalPreviewWorkbenchSplit.MAX_SETTINGS_RATIO
});
assert.ok(
  Math.abs(wideWorkbench.ratio - 2 / 3) < 0.0001 && wideWorkbench.previewWidth > 398,
  "a 1280-class window can expand settings to two thirds while preserving the preview"
);

const expandedStepFiveTrack = resolvePreviewWorkbenchTrack(wideWorkbench, false);
const balancedStepSixTrack = resolvePreviewWorkbenchTrack(wideWorkbench, true);
assert.ok(
  expandedStepFiveTrack.previewWidth < balancedStepSixTrack.previewWidth &&
    Math.abs(balancedStepSixTrack.previewWidth - wideWorkbench.usableWidth / 2) < 0.001 &&
    Math.abs(balancedStepSixTrack.previewWidth - balancedStepSixTrack.exportWidth) < 0.001 &&
    Math.abs(balancedStepSixTrack.offset + balancedStepSixTrack.editorWidth + wideWorkbench.gap) < 0.001,
  "step six grows any narrower step-five preview to an equal half-width split and pans by the matching track width"
);

const constrainedWorkbench = resolvePreviewWorkbenchSplit({
  viewportWidth: 960,
  requestedRatio: __internalPreviewWorkbenchSplit.MAX_SETTINGS_RATIO
});
assert.ok(
  Math.abs(constrainedWorkbench.previewWidth - __internalPreviewWorkbenchSplit.MIN_PREVIEW_WIDTH) < 0.001 &&
    constrainedWorkbench.ratio < 2 / 3,
  "the smallest side-by-side window caps settings before the preview becomes too narrow"
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
  stepperSource.includes("usePreviewWorkbenchSplit(isPreviewWorkbench)") &&
    stepperSource.includes("resolvePreviewWorkbenchTrack(workbenchSplit.geometry, isExportWorkbench)") &&
    stepperSource.includes("gridTemplateColumns: `${workbenchTrack.editorWidth}px ${workbenchTrack.previewWidth}px ${workbenchTrack.exportWidth}px`") &&
    stepperSource.includes('data-testid="preview-workbench-resizer"') &&
    stepperSource.includes('role="separator"') &&
    stepperSource.includes('aria-hidden={isExportWorkbench}') &&
    stepperSource.includes('inert={!isExportWorkbench ? true : undefined}'),
  "the adjustable workbench pans by the measured settings width while keeping off-screen settings inert"
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
const lyricsCommandBarSource = readFileSync(resolve("components/editor/LyricsCommandBar.tsx"), "utf8");
const lyricsSidebarSource = readFileSync(resolve("components/editor/LyricsSidebar.tsx"), "utf8");
const globalsSource = readFileSync(resolve("app/globals.css"), "utf8");
assert.ok(
  globalsSource.includes(".preview-workbench-track") &&
    globalsSource.includes("calc(50% - 0.625rem)") &&
    globalsSource.includes(".preview-workbench-resizer") &&
    globalsSource.includes('.preview-workbench-export[data-active="false"]'),
  "desktop uses an adjustable three-panel track while narrow layouts hide inactive settings"
);
assert.ok(
  globalsSource.includes(".preview-workbench-resizer::before") &&
    !globalsSource.includes(".preview-workbench-resizer::after") &&
    globalsSource.includes("background-color: var(--control-focus-border)") &&
    /\.preview-workbench-resizer::before\s*\{[\s\S]*?top:\s*0;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*1px;/.test(globalsSource),
  "the adjustable workbench uses one full-height one-pixel line whose hover feedback is color-only"
);
assert.ok(
  globalsSource.includes(".settings-adaptive-grid--toggles") &&
    globalsSource.includes(".settings-adaptive-grid--rows") &&
    globalsSource.includes(".settings-adaptive-grid--pairs") &&
    globalsSource.includes("repeat(auto-fit"),
  "settings groups derive compact columns from their own available width"
);
assert.ok(
  lyricsWorkspaceSource.includes("relative flex min-h-0 flex-col overflow-hidden") &&
    lyricsWorkspaceSource.includes("lyrics-workspace-split") &&
    lyricsWorkspaceSource.includes("lyrics-document-column") &&
    lyricsCommandBarSource.includes('role="toolbar"') &&
    lyricsSidebarSource.includes("lyrics-sidebar"),
  "the lyrics workspace uses a semantic command bar and internal editor/sidebar split without framed panel shells"
);
assert.ok(
  globalsSource.includes(".lyrics-workspace-resizer") &&
    lyricsWorkspaceSource.includes('className="preview-workbench-resizer lyrics-workspace-resizer"') &&
    lyricsWorkspaceSource.includes("width: split.geometry.gap"),
  "step two reuses the full-height one-pixel divider contract with a 20px hit area"
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

console.log(JSON.stringify({ ok: true, stepperLayoutTests: 51 }, null, 2));
