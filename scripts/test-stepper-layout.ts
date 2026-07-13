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
assert.ok(
  songImportAsideSource.includes("linkParser: ReactNode") &&
    songImportAsideSource.includes("localAudioParser: ReactNode"),
  "song import aside composes the existing parser nodes instead of duplicating their handlers"
);
assert.ok(
  songImportAsideSource.includes("aria-expanded={manualExpanded}") &&
    songImportAsideSource.includes("aria-controls={manualRegionId}"),
  "manual song metadata disclosure exposes its state to assistive technology"
);
assert.ok(
  songImportAsideSource.includes('data-song-import-panel="true"') &&
    songImportAsideSource.match(/className="glass-panel/g)?.length === 1,
  "song summary and alternate import methods share one companion panel"
);

console.log(JSON.stringify({ ok: true, stepperLayoutTests: 25 }, null, 2));
