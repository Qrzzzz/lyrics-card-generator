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
  stepperSource.includes('className="grid min-w-0 content-start self-start gap-4"'),
  "stepper keeps natural height instead of stretching to the preview column"
);
assert.ok(
  !stepperSource.includes("useMeasuredStepperPanelHeight"),
  "stepper header is not padded by a fixed measured minimum height"
);
assert.ok(
  stepperSource.includes('className="flex items-center justify-between gap-3"'),
  "step navigation uses the same borderless shell on every step"
);

console.log(JSON.stringify({ ok: true, stepperLayoutTests: 7 }, null, 2));
