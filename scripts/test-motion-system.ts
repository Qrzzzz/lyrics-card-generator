import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const exportSensitiveFiles = [
  "components/preview/LyricCard.tsx",
  "components/preview/LandscapeLyricCard.tsx",
  "components/preview/PaletteBackground.tsx"
] as const;

for (const file of exportSensitiveFiles) {
  const source = readFileSync(resolve(file), "utf8");
  assert.equal(source.includes("framer-motion"), false, `${file} must not import framer-motion`);
}

const lyricCard = readFileSync(resolve("components/preview/LyricCard.tsx"), "utf8");
const landscapeCard = readFileSync(resolve("components/preview/LandscapeLyricCard.tsx"), "utf8");
assert.match(lyricCard, /data-export-card="true"/);
assert.match(landscapeCard, /data-export-card="true"/);

const motionTokens = readFileSync(resolve("lib/motion/tokens.ts"), "utf8");
assert.match(motionTokens, /motionDurations/);
assert.match(motionTokens, /motionEasings/);
assert.match(motionTokens, /motionSprings/);
assert.match(motionTokens, /controlHoverTarget/);
assert.match(motionTokens, /controlTapTarget/);
assert.match(motionTokens, /reducedMotionTransition/);
assert.match(motionTokens, /stepPanelVariants/);
assert.match(motionTokens, /workbenchStepPanelVariants/);
assert.match(motionTokens, /tabPanelVariants/);
assert.match(motionTokens, /dialogPanelVariants/);
assert.match(motionTokens, /direction > 0 \? 72 : -72/);
assert.match(motionTokens, /direction > 0 \? -72 : 72/);

for (const file of [
  "components/motion/MotionPanel.tsx",
  "components/motion/MotionDialog.tsx",
  "components/editor/SettingsStepper.tsx",
  "components/editor/PreviewPane.tsx",
  "components/editor/SongImportAside.tsx",
  "components/editor/ExportPanel.tsx"
]) {
  const source = readFileSync(resolve(file), "utf8");
  assert.match(source, /useAppReducedMotion|reducedMotion/, `${file} should wire reduced-motion behavior`);
}

const appMotionProvider = readFileSync(resolve("components/motion/AppMotionProvider.tsx"), "utf8");
assert.match(appMotionProvider, /MotionConfig reducedMotion=\{reduceMotion \? "always" : "user"\}/);
assert.match(appMotionProvider, /return appPreference \|\| systemPreference/);
assert.match(appMotionProvider, /ready = true/);
assert.match(appMotionProvider, /useAppMotionReady/);

const motionPanel = readFileSync(resolve("components/motion/MotionPanel.tsx"), "utf8");
assert.match(motionPanel, /animate=\{motionReady \? animate : "initial"\}/);
assert.match(motionPanel, /!motionReady \? reducedMotionTransition/);

const clickSpark = readFileSync(resolve("components/layout/ClickSpark.tsx"), "utf8");
const exportCelebration = readFileSync(resolve("components/effects/ExportCelebration.tsx"), "utf8");
assert.match(clickSpark, /useAppReducedMotion/);
assert.match(clickSpark, /!enabled \|\| reduceMotion \|\| !canvas/);
assert.match(exportCelebration, /useAppReducedMotion/);
assert.match(exportCelebration, /consumedBurstKeyRef/);
assert.match(exportCelebration, /reduceMotion \|\| !isNewBurst/);

const exportPanel = readFileSync(resolve("components/editor/ExportPanel.tsx"), "utf8");
const previewPane = readFileSync(resolve("components/editor/PreviewPane.tsx"), "utf8");
const songImportAside = readFileSync(resolve("components/editor/SongImportAside.tsx"), "utf8");
const lyricCardPreview = readFileSync(resolve("components/preview/LyricCardPreview.tsx"), "utf8");
const lyricEditor = readFileSync(resolve("components/editor/LyricEditor.tsx"), "utf8");
const appToast = readFileSync(resolve("components/feedback/AppToast.tsx"), "utf8");
const editorActions = readFileSync(resolve("components/editor/hooks/useEditorActions.ts"), "utf8");
const editorSteps = readFileSync(resolve("components/editor/useEditorSteps.tsx"), "utf8");
const settingsStepper = readFileSync(resolve("components/editor/SettingsStepper.tsx"), "utf8");
const lyricsWorkspace = readFileSync(resolve("components/editor/LyricsWorkspace.tsx"), "utf8");
const lyricsSidebar = readFileSync(resolve("components/editor/LyricsSidebar.tsx"), "utf8");
const motionPresence = readFileSync(resolve("components/motion/MotionPresence.tsx"), "utf8");
assert.match(exportPanel, /role="status"/);
assert.match(exportPanel, /aria-live="polite"/);
assert.match(exportPanel, /aria-atomic="true"/);
assert.match(exportPanel, /aria-busy=\{isExporting\}/);
assert.match(exportPanel, /<SegmentedControl/);
assert.match(exportPanel, /preparingImage/);
assert.doesNotMatch(exportPanel, /previewMessage|FileImage|exportHint/);
assert.doesNotMatch(editorSteps, /description: t\("exportHint"\)|cardRef=\{cardRef\}/);
assert.match(previewPane, /data-testid="preview-clear-transition"/);
assert.match(previewPane, /mode="popLayout"/);
assert.match(previewPane, /initial=\{reduceMotion \? false : \{ opacity: 0, x: 72 \}\}/);
assert.match(previewPane, /exit=\{reduceMotion \? \{ opacity: 0, x: 0 \} : \{ opacity: 0, x: -72 \}\}/);
assert.match(previewPane, /measurementKey=\{measurementKey\}/);
assert.match(settingsStepper, /data-testid="preview-workbench-settings-transition"/);
assert.match(settingsStepper, /<MotionPresence custom=\{stepDirection\} mode="popLayout">/);
assert.match(settingsStepper, /variants=\{workbenchStepVariants\}/);
assert.match(settingsStepper, /data-step-direction=\{stepDirection > 0 \? "forward" : "backward"\}/);
assert.match(settingsStepper, /data-settings-step-id=\{workbenchSettingsStep\.id\}/);
assert.match(motionPresence, /<AnimatePresence custom=\{custom\}/);
assert.match(lyricsWorkspace, /<motion\.div[\s\S]*?animate=\{splitTarget\}[\s\S]*?transition=\{splitTransition\}/);
assert.match(lyricsWorkspace, /previousSidebarCollapsedRef[\s\S]*?animateSidebarDisclosure/);
assert.match(lyricsWorkspace, /reduceMotion \|\| split\.isDragging \|\| !animateSidebarDisclosure/);
assert.match(lyricsWorkspace, /data-motion-active=\{sidebarCollapsed \? "false" : "true"\}/);
assert.match(lyricsSidebar, /data-testid="lyrics-sidebar-collapsed-layer"/);
assert.match(lyricsSidebar, /data-testid="lyrics-sidebar-expanded-layer"/);
assert.match(lyricsSidebar, /transitionEnd: \{ visibility: "hidden" \}/);
assert.match(songImportAside, /mode="popLayout"/);
assert.match(songImportAside, /key="song-info-editor"[\s\S]*?initial=\{reduceMotion \? \{ opacity: 0, x: 0 \} : \{ opacity: 0, x: 72 \}\}/);
assert.match(songImportAside, /key="song-info-editor"[\s\S]*?exit=\{reduceMotion \? \{ opacity: 0, x: 0 \} : \{ opacity: 0, x: 72 \}\}/);
assert.match(songImportAside, /key="song-info-summary"[\s\S]*?initial=\{reduceMotion \? \{ opacity: 0, x: 0 \} : \{ opacity: 0, x: -72 \}\}/);
assert.match(songImportAside, /key="song-info-summary"[\s\S]*?exit=\{reduceMotion \? \{ opacity: 0, x: 0 \} : \{ opacity: 0, x: -72 \}\}/);
assert.match(lyricCardPreview, /rect\.top >= window\.innerHeight/);
assert.match(lyricCardPreview, /\}, \[measurementKey\]\);/);
assert.match(lyricCardPreview, /data-testid="lyric-card-preview-pressure"/);
assert.match(lyricCardPreview, /rotateXTarget\.set\(normalizedY \* -5\.5\)/);
assert.match(lyricCardPreview, /scaleTarget\.set\(0\.992\)/);
assert.match(lyricCardPreview, /event\.pointerType === "touch" \|\| !event\.isPrimary \|\| event\.button !== 0/);
assert.match(lyricCardPreview, /const isPointerInside =[\s\S]*?resetPressureFeedback\(\);/);
assert.match(lyricEditor, /onAnimationComplete=\{\(\) => \{[\s\S]*?setPreviewMeasurementKey/);
assert.match(lyricEditor, /pressureEnabled=\{currentStep >= 2\}/);
assert.match(editorActions, /if \(!hasClearableLyricContent\(parsedState\)\)[\s\S]*?onNotify\(clearAlreadyEmptyMessage\);[\s\S]*?return;[\s\S]*?setClearTransitionKey/);
assert.match(appToast, /role="status"/);
assert.match(appToast, /aria-live="polite"/);
assert.match(appToast, /data-testid="app-toast"/);
assert.match(appToast, /useAppReducedMotion/);
assert.match(appToast, /scaleX: 0/);

const globals = readFileSync(resolve("app/globals.css"), "utf8");
assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(globals, /body\[data-reduce-motion="true"\] \*/);
assert.match(globals, /animation-iteration-count: 1 !important/);
assert.match(globals, /ai-stream-progress/);
assert.match(globals, /star-border-container::before/);
assert.match(globals, /@media \(hover: hover\) and \(pointer: fine\)/);
assert.match(globals, /not\(\.traffic-light\):not\(\.example-song-card\):hover/);
assert.match(globals, /not\(\.traffic-light\):not\(\.example-song-card\):hover:active/);
assert.match(globals, /\.preview-pressure-stage/);
assert.match(globals, /\.app-shell\[data-reduce-motion="true"\] \.preview-pressure-card/);

console.log(JSON.stringify({ ok: true, motionSystemRegressionChecks: 74 }, null, 2));
