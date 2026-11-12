import assert from "node:assert/strict";
import { resolveEditorThemeTokens } from "../components/editor/resolveEditorThemeTokens";
import {
  LIGHT_ACRYLIC_CONTRAST_FLOOR,
  compositeHexColors,
  getContrastRatio
} from "../lib/color/contrast";
import { normalizeUserSettings } from "../lib/settings/user-settings";
import { DEFAULT_PALETTE } from "../lib/palette-background";

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
assert.ok(getContrastRatio(lightAcrylicTokens.uiTextTokens.primary, "#F8FAFC") >= 4.5);

const darkAcrylicTokens = resolveEditorThemeTokens({
  userSettings: normalizeUserSettings({ uiTheme: "dark-acrylic" })
});
assert.equal(darkAcrylicTokens.uiTextTokens.primary, "#FFFFFF", "dark acrylic keeps its light foreground");

// Filled actions and switch icons must remain legible for custom/album accents,
// including yellow, white and black, independently of the surrounding theme.
for (const uiTheme of ["dark", "light", "dark-acrylic", "light-acrylic"] as const) {
  for (const accent of ["#000000", "#FFFFFF", "#EF4444", "#F97316", "#EAB308", "#22C55E", "#3B82F6", "#7C3AED"]) {
    for (const uiAccentMode of ["custom", "album-dynamic"] as const) {
      const tokens = resolveEditorThemeTokens({
        userSettings: normalizeUserSettings({ uiTheme, uiAccentMode, uiCustomAccentColor: accent }),
        palette: { ...DEFAULT_PALETTE, primary: accent }
      });
      const foreground = tokens.resolvedThemeTokens["--control-on-accent"];
      assert.ok(getContrastRatio(foreground, tokens.themeAccent) >= 4.5, `${uiTheme} ${accent}: filled action text`);
      const hoverColor = tokens.resolvedThemeTokens["--control-accent-hover"];
      assert.ok(getContrastRatio(foreground, hoverColor) >= 4.5, `${uiTheme} ${accent}: hovered action text`);
    }
  }
}

console.log(JSON.stringify({ ok: true, backdropCases: backdropMatrix.length, checkedSurfaces: 5 }, null, 2));
