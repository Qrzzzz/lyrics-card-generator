import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { TargetAndTransition, Variants } from "framer-motion";
import {
  panelVariants, tabPanelVariants, stepPanelVariants,
  workbenchStepPanelVariants, sidebarPageVariants, reducedMotionTransition
} from "../lib/motion/tokens";

// Raster capture must not inherit animated wrapper geometry. Rendered focus,
// reduced motion, visibility and toast behavior are covered by browser suites.
for (const file of ["LyricCard", "LandscapeLyricCard", "PaletteBackground"]) {
  assert.doesNotMatch(readFileSync(`components/preview/${file}.tsx`, "utf8"), /from\s+["']framer-motion["']/);
}

function state(variants: Variants, key: string, direction: 1 | -1): TargetAndTransition {
  const value = variants[key];
  const resolved = typeof value === "function" ? value(direction, {}, {}) : value;
  assert.ok(typeof resolved === "object" && resolved !== null, `${key} resolves to an animation target`);
  return resolved;
}

for (const factory of [panelVariants, tabPanelVariants, stepPanelVariants, workbenchStepPanelVariants, sidebarPageVariants]) {
  for (const direction of [1, -1] as const) {
    const reduced = factory(true);
    for (const key of ["initial", "animate", "exit"]) {
      const target = state(reduced, key, direction);
      for (const axis of ["x", "y"] as const) {
        assert.ok(target[axis] === undefined || Number.parseFloat(String(target[axis])) === 0,
          `${factory.name} removes ${axis} travel when reduced motion is enabled`);
      }
    }
    assert.equal(state(factory(false), "animate", direction).opacity, 1, "entered panels are visible");
    assert.equal(state(reduced, "animate", direction).opacity, 1, "reduced-motion panels remain visible");
  }
}
assert.equal(reducedMotionTransition.duration, 0, "reduced motion completes without animation delay");
for (const factory of [stepPanelVariants, workbenchStepPanelVariants, sidebarPageVariants]) {
  const forward = state(factory(false), "initial", 1);
  const backward = state(factory(false), "initial", -1);
  assert.ok(Number.parseFloat(String(forward.x)) > 0 && Number.parseFloat(String(backward.x)) < 0,
    `${factory.name} follows navigation direction without pinning its distance`);
}
console.log("Motion behavior tests passed");
