"use client";

import { PaletteBackground } from "@/components/preview/PaletteBackground";
import { FONT_PANEL_PREVIEW_LYRIC, FONT_PREVIEW_COLORS, FONT_PREVIEW_PALETTE } from "@/lib/font-schemes";
import { quoteSingleFontFamily } from "@/lib/fonts";
import type { createT } from "@/lib/i18n";
import type { FontScheme } from "@/lib/types";

export function FontSchemePreviewPanel({
  scheme,
  t
}: {
  scheme: FontScheme;
  t: ReturnType<typeof createT>;
}) {
  return (
    <section className="glass-panel rounded-lg p-4" data-testid="font-scheme-preview-panel">
      <div className="mb-5">
        <p className="app-text-subtle text-[11px] uppercase tracking-[0.16em]">{t("fontSchemePreviewBackground")}</p>
        <h2 className="app-text-primary text-base font-semibold">{t("fontSchemePreviewTitle")}</h2>
        <p className="app-text-subtle mt-2 text-xs leading-relaxed">{t("fontSchemePreviewBackgroundDescription")}</p>
        <div className="mt-3 flex gap-2" aria-hidden="true" data-testid="font-preview-palette">
          {FONT_PREVIEW_COLORS.map((color) => (
            <span key={color} className="h-2 flex-1 rounded-full border border-white/15" style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[390px]">
        <div
          className="relative isolate overflow-hidden rounded-2xl border border-white/15 px-7 py-10 text-left text-white shadow-2xl sm:px-8 sm:py-11"
          data-testid="font-lyric-preview"
        >
          <FontPreviewBackground />
          <div className="relative z-10 grid w-full gap-11">
            {FONT_PANEL_PREVIEW_LYRIC.lines.map((line) => (
              <div key={line.original} className="grid gap-3">
                <p
                  className="text-[clamp(1.05rem,2.2vw,1.28rem)] font-black leading-[1.55]"
                  style={familyStyle(scheme.cjkFontFamily)}
                >
                  {line.original}
                </p>
                <p
                  className="text-[clamp(0.76rem,1.65vw,0.9rem)] leading-[1.7] text-white/66"
                  style={familyStyle(scheme.latinFontFamily)}
                >
                  {line.romanized}
                </p>
                <p
                  className="text-[clamp(0.9rem,1.9vw,1.08rem)] font-medium leading-[1.7] text-white/86"
                  style={familyStyle(scheme.cjkFontFamily)}
                >
                  {line.translation}
                </p>
              </div>
            ))}
          </div>
        </div>
        <p className="app-text-subtle mt-3 text-xs" data-testid="font-preview-footnote">
          {t("fontSchemePreviewFootnote")}
        </p>
      </div>
    </section>
  );
}

export function FontPreviewBackground() {
  return (
    <>
      <PaletteBackground palette={FONT_PREVIEW_PALETTE} />
      <div className="absolute inset-0 bg-black/14" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.14),transparent_42%,rgba(0,0,0,0.22))]"
        aria-hidden="true"
      />
    </>
  );
}

function familyStyle(family: string) {
  return { fontFamily: `${quoteSingleFontFamily(family)}, sans-serif` };
}
