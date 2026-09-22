import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveEditorThemeTokens } from "../components/editor/resolveEditorThemeTokens";
import {
  LIGHT_ACRYLIC_CONTRAST_FLOOR,
  compositeHexColors,
  getContrastRatio
} from "../lib/color/contrast";
import { normalizeUserSettings } from "../lib/settings/user-settings";

const backdropMatrix = [
  { name: "black", color: "#000000" },
  { name: "white", color: "#FFFFFF" },
  { name: "red", color: "#FF0000" },
  { name: "green", color: "#00FF00" },
  { name: "blue", color: "#0000FF" },
  { name: "dark gray", color: "#1F2937" },
  { name: "mid gray", color: "#64748B" },
  { name: "light", color: "#E2E8F0" }
] as const;

// Acrylic surfaces are composited against representative desktop backdrops
// before contrast is measured; checking token colors alone would overstate it.
for (const backdrop of backdropMatrix) {
  const windowBase = compositeHexColors(
    LIGHT_ACRYLIC_CONTRAST_FLOOR.windowBase.color,
    backdrop.color,
    LIGHT_ACRYLIC_CONTRAST_FLOOR.windowBase.opacity
  );
  const panel = compositeHexColors(
    LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.panel.color,
    windowBase,
    LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.panel.opacity
  );
  const surfaces = {
    window: windowBase,
    panel,
    input: compositeHexColors(
      LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.input.color,
      panel,
      LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.input.opacity
    ),
    button: compositeHexColors(
      LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.button.color,
      panel,
      LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.button.opacity
    ),
    elevated: compositeHexColors(
      LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.elevated.color,
      windowBase,
      LIGHT_ACRYLIC_CONTRAST_FLOOR.surfaces.elevated.opacity
    )
  };

  for (const [surfaceName, surfaceColor] of Object.entries(surfaces)) {
    for (const [textName, textColor] of Object.entries(LIGHT_ACRYLIC_CONTRAST_FLOOR.text)) {
      assert.ok(
        getContrastRatio(textColor, surfaceColor) >= 4.5,
        `${textName} text meets 4.5:1 on ${backdrop.name} ${surfaceName} (${textColor} on ${surfaceColor})`
      );
    }
  }

  for (const controlName of ["input", "button"] as const) {
    const surfaceColor = surfaces[controlName];
    const boundaryColor = compositeHexColors(
      LIGHT_ACRYLIC_CONTRAST_FLOOR.controlBorder.color,
      surfaceColor,
      LIGHT_ACRYLIC_CONTRAST_FLOOR.controlBorder.opacity
    );
    assert.ok(
      getContrastRatio(boundaryColor, surfaceColor) >= 3,
      `${controlName} boundary meets 3:1 on ${backdrop.name} (${boundaryColor} on ${surfaceColor})`
    );
  }
}

// All RGB backgrounds are bounded by black/white; saturated primaries catch channel assumptions.
// Theme accents can also be arbitrary, including black and white.
for (const accent of ["#000000", "#FFFFFF", "#EF4444", "#EAB308", "#22C55E", "#3B82F6", "#7C3AED"]) {
  for (const surface of [
    compositeHexColors(accent, "#F1F5F9", 0.16),
    compositeHexColors(accent, "#E2E8F0", 0.12)
  ]) {
    for (const color of Object.values(LIGHT_ACRYLIC_CONTRAST_FLOOR.text)) {
      assert.ok(getContrastRatio(color, surface) >= 4.5, "selected and hovered text stays readable for every accent");
    }
  }
}

for (const [foreground, background] of [["#166534", "#F0FDF4"], ["#92400E", "#FFFBEB"], ["#9F1239", "#FFF1F2"]]) {
  assert.ok(getContrastRatio(foreground, compositeHexColors(background, "#000000", 0.98)) >= 4.5, "notification tones remain readable");
}

const lightAcrylicTokens = resolveEditorThemeTokens({
  userSettings: normalizeUserSettings({ uiTheme: "light-acrylic" })
});
assert.deepEqual(lightAcrylicTokens.uiTextTokens, {
  primary: "#0F172A",
  fg: "15 23 42",
  muted: "51 65 85",
  subtle: "71 85 105"
});

const darkAcrylicTokens = resolveEditorThemeTokens({
  userSettings: normalizeUserSettings({ uiTheme: "dark-acrylic" })
});
assert.equal(darkAcrylicTokens.uiTextTokens.primary, "#FFFFFF", "dark acrylic keeps its light foreground");

const globalsSource = readFileSync(resolve("app/globals.css"), "utf8");
const lightAcrylicBlock = globalsSource.match(/\.app-shell\[data-ui-theme="light-acrylic"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
for (const token of [
  "--app-muted: 51 65 85;",
  "--app-subtle: 71 85 105;",
  "--panel-bg: 255 255 255 / 0.48;",
  "--elevated-panel-bg: 250 252 255 / 0.97;",
  "--control-border: 100 116 139 / 0.86;",
  "--input-bg: 255 255 255 / 0.88;",
  "--input-border: 100 116 139 / 0.86;",
  "--button-bg: 241 245 249 / 0.86;"
]) {
  assert.ok(lightAcrylicBlock.includes(token), `light acrylic CSS keeps ${token}`);
}
assert.match(globalsSource, /\.segmented-control\s*\{[\s\S]*?background: rgb\(var\(--input-bg\)\);/);
assert.match(globalsSource, /\.segmented-control__active-indicator\s*\{[\s\S]*?background: var\(--control-selected-bg-strong\);/);

console.log(JSON.stringify({ ok: true, backdropCases: backdropMatrix.length, checkedSurfaces: 5 }, null, 2));
