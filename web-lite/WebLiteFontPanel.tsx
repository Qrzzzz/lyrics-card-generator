"use client";

import { Section } from "@/components/ui/controls";
import { FONT_SCHEME_PRESETS, identifyFontPreset } from "@/lib/font-schemes";
import { getEffectiveFontScheme } from "@/lib/fonts";
import type { createT } from "@/lib/i18n";
import type { CardStyle, FontScheme } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { WebLiteCopy } from "@/web-lite/copy";

type WebLiteFontId = "source-han-sans" | "source-han-serif" | "system-sans" | "system-serif";

const SYSTEM_SANS_SCHEME: FontScheme = {
  mode: "custom",
  cjkFontFamily: "system-ui",
  latinFontFamily: "system-ui"
};

const SYSTEM_SERIF_SCHEME: FontScheme = {
  mode: "custom",
  cjkFontFamily: "serif",
  latinFontFamily: "serif"
};

export function WebLiteFontPanel({
  style,
  copy,
  t,
  onStyleChange,
  onPreviewSchemeChange
}: {
  style: CardStyle;
  copy: WebLiteCopy;
  t: ReturnType<typeof createT>;
  onStyleChange: (style: CardStyle) => void;
  onPreviewSchemeChange: (scheme: FontScheme | null) => void;
}) {
  const activeId = identifyWebLiteFont(style);
  const options: Array<{ id: WebLiteFontId; label: string; description: string; scheme: FontScheme }> = [
    {
      id: "source-han-sans",
      label: copy.sourceHanSans,
      description: copy.stableFont,
      scheme: FONT_SCHEME_PRESETS["source-han-sans"]
    },
    {
      id: "source-han-serif",
      label: copy.sourceHanSerif,
      description: copy.stableFont,
      scheme: FONT_SCHEME_PRESETS["source-han-serif"]
    },
    { id: "system-sans", label: copy.systemSans, description: copy.deviceFont, scheme: SYSTEM_SANS_SCHEME },
    { id: "system-serif", label: copy.systemSerif, description: copy.deviceFont, scheme: SYSTEM_SERIF_SCHEME }
  ];

  function applyFont(id: WebLiteFontId, scheme: FontScheme) {
    const isBundled = id === "source-han-sans" || id === "source-han-serif";
    onStyleChange({
      ...style,
      fontScheme: { ...scheme },
      font:
        id === "source-han-serif"
          ? "serif-heavy"
          : id === "system-sans"
            ? "system-sans"
            : id === "system-serif"
              ? "system-serif"
              : "sans-heavy",
      customFontEnabled: !isBundled,
      customFontFamily: isBundled ? "" : scheme.latinFontFamily,
      customFontLabel: isBundled ? "" : scheme.latinFontFamily,
      customFontWeight: 400,
      customFontStyle: "normal"
    });
    onPreviewSchemeChange(null);
  }

  return (
    <Section title={copy.fontTitle} description={copy.fontDescription} variant="plain" className="border-t-0 pt-0">
      <div className="grid gap-3 sm:grid-cols-2" data-testid="web-lite-font-options">
        {options.map((option) => {
          const active = activeId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => applyFont(option.id, option.scheme)}
              onMouseEnter={() => onPreviewSchemeChange(option.scheme)}
              onMouseLeave={() => onPreviewSchemeChange(null)}
              onFocus={() => onPreviewSchemeChange(option.scheme)}
              onBlur={() => onPreviewSchemeChange(null)}
              className={cn(
                "control-focus rounded-xl border p-4 text-left transition",
                active
                  ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))] shadow-[0_0_0_3px_var(--control-selected-bg)]"
                  : "border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
              )}
              style={{ fontFamily: fontPreviewFamily(option.scheme) }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="app-text-primary font-bold">{option.label}</h3>
                  <p className="app-text-subtle mt-1 text-xs">{option.description}</p>
                </div>
                {active ? (
                  <span className="shrink-0 rounded-full bg-[var(--control-selected-bg-strong)] px-2 py-1 text-[11px] font-bold text-[var(--app-accent)]">
                    {copy.selected}
                  </span>
                ) : null}
              </div>
              <p className="app-text-primary mt-5 text-2xl font-black leading-snug">歌词 Lyrics かな</p>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function identifyWebLiteFont(style: CardStyle): WebLiteFontId {
  const scheme = getEffectiveFontScheme(style);
  const preset = identifyFontPreset(scheme);
  if (preset) {
    return preset;
  }
  if (scheme.cjkFontFamily === "serif" && scheme.latinFontFamily === "serif") {
    return "system-serif";
  }
  return "system-sans";
}

function fontPreviewFamily(scheme: FontScheme) {
  return `${JSON.stringify(scheme.latinFontFamily)}, ${JSON.stringify(scheme.cjkFontFamily)}, system-ui, sans-serif`;
}
