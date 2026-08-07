import type { CSSProperties } from "react";
import { DEFAULT_FONT_SCHEME, FONT_SCHEME_PRESETS, normalizeFontScheme } from "@/lib/font-schemes";
import type { CardFont, CardStyle } from "@/lib/types";

export const FONT_OPTIONS: Array<{ value: CardFont; label: string; className: string }> = [
  { value: "sans-heavy", label: "Source Han Sans Heavy", className: "card-font-sans-heavy" },
  { value: "serif-heavy", label: "Source Han Serif Heavy", className: "card-font-serif-heavy" },
  { value: "system-sans", label: "System Sans", className: "card-font-system-sans" },
  { value: "system-serif", label: "System Serif", className: "card-font-system-serif" }
];

export function fontClassName(font: CardFont) {
  return FONT_OPTIONS.find((option) => option.value === font)?.className ?? "card-font-sans-heavy";
}

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong"
]);

export function sanitizeCssFontFamilyName(value: string | undefined) {
  let family = value?.trim() ?? "";

  family = family.replace(/\s*\((TrueType|OpenType|Type 1|Raster|All res)\)\s*$/i, "").trim();

  if (
    family.length >= 2 &&
    ((family.startsWith('"') && family.endsWith('"')) || (family.startsWith("'") && family.endsWith("'")))
  ) {
    family = family.slice(1, -1).trim();
  }

  // A custom font value represents one family, never a user-authored fallback list.
  family = family.split(",", 1)[0]?.trim() ?? "";
  family = family.split(/\s+&\s+/, 1)[0]?.trim() ?? "";

  return family;
}

export function quoteSingleFontFamily(value: string) {
  const family = sanitizeCssFontFamilyName(value);

  if (!family) {
    return "";
  }

  if (GENERIC_FONT_FAMILIES.has(family.toLowerCase())) {
    return family.toLowerCase();
  }

  return `"${family.replace(/["\\]/g, "\\$&")}"`;
}

export function isCustomFontActive(style: CardStyle) {
  if (style.fontScheme) {
    return getEffectiveFontScheme(style).mode === "custom";
  }

  return Boolean(style.customFontEnabled && sanitizeCssFontFamilyName(style.customFontFamily));
}

export function getActiveFontMode(style: CardStyle): "preset" | "custom" {
  return getEffectiveFontScheme(style).mode;
}

export function getEffectiveFontScheme(style: CardStyle) {
  // Prefer the current two-family scheme, then bridge legacy single-font fields
  // so old documents render identically after loading.
  if (style.fontScheme) {
    return normalizeFontScheme(style.fontScheme);
  }

  if (style.customFontEnabled) {
    const customFamily = sanitizeCssFontFamilyName(style.customFontFamily);
    if (customFamily) {
      return {
        mode: "custom" as const,
        cjkFontFamily: customFamily,
        latinFontFamily: customFamily
      };
    }
  }

  if (style.font === "serif-heavy") {
    return { ...FONT_SCHEME_PRESETS["source-han-serif"] };
  }

  if (style.font === "system-sans") {
    return { mode: "custom" as const, cjkFontFamily: "system-ui", latinFontFamily: "system-ui" };
  }

  if (style.font === "system-serif") {
    return { mode: "custom" as const, cjkFontFamily: "serif", latinFontFamily: "serif" };
  }

  return { ...DEFAULT_FONT_SCHEME };
}

export function getResolvedFontStyle(style: CardStyle): CSSProperties | undefined {
  const scheme = getEffectiveFontScheme(style);
  const latinFamily = quoteSingleFontFamily(scheme.latinFontFamily);
  const cjkFamily = quoteSingleFontFamily(scheme.cjkFontFamily);
  const families = Array.from(new Set([latinFamily, cjkFamily].filter(Boolean)));

  return {
    fontFamily: `${families.join(", ")}, var(--font-source-han-sans-heavy), ui-sans-serif, system-ui, sans-serif`,
    ...(!style.fontScheme && style.customFontEnabled && style.customFontWeight
      ? { fontWeight: style.customFontWeight }
      : {}),
    ...(!style.fontScheme && style.customFontEnabled && style.customFontStyle
      ? { fontStyle: style.customFontStyle }
      : {})
  };
}

export function cardFontStyle(style: CardStyle): CSSProperties | undefined {
  return getResolvedFontStyle(style);
}

export function canBrowserUseFont(
  fontFamily: string,
  fontWeight = 400,
  fontStyle: "normal" | "italic" = "normal"
) {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return true;
  }

  const quoted = quoteSingleFontFamily(fontFamily);
  return quoted ? document.fonts.check(`${fontStyle} ${fontWeight} 16px ${quoted}`) : false;
}
