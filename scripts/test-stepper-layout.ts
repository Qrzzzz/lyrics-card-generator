import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __internalStepperLayout } from "../components/editor/hooks/useBalancedStepperLayout";

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
  stepperSource.includes('isFocus ? "min-[960px]:col-span-2" : "lg:col-span-2"') &&
    stepperSource.includes("min-[960px]:col-start-2") &&
    stepperSource.includes("lg:col-start-2 lg:row-start-2 lg:row-span-2"),
  "the shared rail spans both focus and preview workbench columns at their desktop breakpoints"
);
assert.ok(
  stepperSource.includes('? "max-[959px]:order-2 min-[960px]:col-start-1') &&
    stepperSource.includes('? "max-[959px]:order-3 min-[960px]:col-start-2'),
  "the narrow focus layout keeps primary search before alternate import methods"
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
    (editorSource.match(/<EditorHeader\b/g)?.length ?? 0) === 1,
  "the editor surface no longer renders a separate legacy header for step one"
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

const songImportAsideSource = readFileSync(resolve("components/editor/SongImportAside.tsx"), "utf8");
const editorStepsSource = readFileSync(resolve("components/editor/useEditorSteps.tsx"), "utf8");
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
    stepperSource.includes("aria-controls={secondaryAction.controls}"),
  "manual song metadata disclosure exposes its state and controlled region from the shared action row"
);
assert.ok(
  !songImportAsideSource.includes("<button") &&
    songImportAsideSource.includes('role="region"') &&
    songImportAsideSource.includes("id={manualRegionId}"),
  "the metadata aside keeps one labelled region without a duplicate disclosure button"
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

console.log(JSON.stringify({ ok: true, stepperLayoutTests: 32 }, null, 2));
