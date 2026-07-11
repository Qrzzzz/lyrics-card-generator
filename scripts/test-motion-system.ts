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
assert.match(motionTokens, /tabPanelVariants/);
assert.match(motionTokens, /dialogPanelVariants/);

for (const file of [
  "components/motion/MotionPanel.tsx",
  "components/motion/MotionDialog.tsx",
  "components/editor/SettingsStepper.tsx",
  "components/editor/PreviewPane.tsx",
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
const appToast = readFileSync(resolve("components/feedback/AppToast.tsx"), "utf8");
const editorActions = readFileSync(resolve("components/editor/hooks/useEditorActions.ts"), "utf8");
const editorSteps = readFileSync(resolve("components/editor/useEditorSteps.tsx"), "utf8");
assert.match(exportPanel, /role="status"/);
assert.match(exportPanel, /aria-live="polite"/);
assert.match(exportPanel, /aria-atomic="true"/);
assert.match(exportPanel, /aria-busy=\{isExporting\}/);
assert.match(exportPanel, /<SegmentedControl/);
assert.match(exportPanel, /preparingPng/);
assert.doesNotMatch(exportPanel, /previewMessage|FileImage|exportHint/);
assert.doesNotMatch(editorSteps, /description: t\("exportHint"\)|cardRef=\{cardRef\}/);
assert.match(previewPane, /data-testid="preview-clear-transition"/);
assert.match(previewPane, /mode="popLayout"/);
assert.match(previewPane, /initial=\{reduceMotion \? false : \{ opacity: 0, x: 72 \}\}/);
assert.match(previewPane, /exit=\{reduceMotion \? \{ opacity: 0, x: 0 \} : \{ opacity: 0, x: -72 \}\}/);
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

console.log(JSON.stringify({ ok: true, motionSystemRegressionChecks: 43 }, null, 2));
