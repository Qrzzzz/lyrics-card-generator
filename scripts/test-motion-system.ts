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
assert.match(motionTokens, /dialogPanelVariants/);

for (const file of [
  "components/motion/MotionPanel.tsx",
  "components/motion/MotionDialog.tsx",
  "components/editor/SettingsStepper.tsx",
  "components/editor/PreviewPane.tsx"
]) {
  const source = readFileSync(resolve(file), "utf8");
  assert.match(source, /useReducedMotion|reducedMotion/, `${file} should wire reduced-motion behavior`);
}

const globals = readFileSync(resolve("app/globals.css"), "utf8");
assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(globals, /ai-stream-progress/);
assert.match(globals, /star-border-container::before/);
assert.match(globals, /@media \(hover: hover\) and \(pointer: fine\)/);
assert.match(globals, /not\(\.traffic-light\):not\(\.example-song-card\):hover/);

console.log(JSON.stringify({ ok: true, motionSystemRegressionChecks: 22 }, null, 2));
