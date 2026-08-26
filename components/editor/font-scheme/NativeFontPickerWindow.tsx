"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getLyricsCardDesktopApi, type NativeFontPickerContext, type SystemFontOption } from "@/lib/desktop-api";
import {
  buildFontOptions,
  previewTextForCategory,
  RECOMMENDED_FONTS,
  type FontFamilyOption
} from "@/lib/font-picker-options";
import { quoteSingleFontFamily } from "@/lib/fonts";
import { createT } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

const fallbackContext: NativeFontPickerContext = {
  category: "cjk",
  selectedFamily: "Source Han Sans SC",
  locale: "en",
  theme: "dark",
  title: "Choose a font"
};

export function NativeFontPickerWindow() {
  const desktopApi = getLyricsCardDesktopApi();
  const searchRef = useRef<HTMLInputElement>(null);
  const [context, setContext] = useState<NativeFontPickerContext | null>(null);
  const [systemFonts, setSystemFonts] = useState<SystemFontOption[]>([]);
  const [query, setQuery] = useState("");
  const [previewFamily, setPreviewFamily] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "failed">("loading");
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    if (!desktopApi) {
      setContext(fallbackContext);
      setStatus("failed");
      return;
    }

    let active = true;
    void desktopApi.getNativeFontPickerContext()
      .then((nextContext) => {
        if (!active) return;
        if (!nextContext) {
          setContext(fallbackContext);
          setStatus("failed");
          return;
        }
        setContext(nextContext);
        setPreviewFamily(nextContext.selectedFamily);
        document.documentElement.lang = documentLanguage(nextContext.locale);
        document.title = nextContext.title;
        requestAnimationFrame(() => searchRef.current?.focus());
      })
      .catch(() => {
        if (!active) return;
        setContext(fallbackContext);
        setStatus("failed");
      });
    void desktopApi.listSystemFonts()
      .then((fonts) => {
        if (!active) return;
        setSystemFonts(fonts);
        setStatus(fonts.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (active) setStatus("failed");
      });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void desktopApi.closeNativeFontPicker();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [desktopApi]);

  const activeContext = context ?? fallbackContext;
  const t = createT(activeContext.locale);
  const options = useMemo(
    () => buildFontOptions(activeContext.category, systemFonts),
    [activeContext.category, systemFonts]
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? options.filter((font) => `${font.label} ${font.family}`.toLocaleLowerCase().includes(normalized))
      : options;
  }, [options, query]);
  const recommendedIds = new Set(
    RECOMMENDED_FONTS.filter((font) => font.category === activeContext.category).map((font) => font.id)
  );
  const recommended = filtered.filter((font) => recommendedIds.has(font.id));
  const allFonts = filtered.filter((font) => !recommendedIds.has(font.id));
  const sampleFamily = previewFamily || activeContext.selectedFamily;

  async function selectFont(font: FontFamilyOption) {
    if (!desktopApi || selecting) return;
    setSelecting(true);
    const accepted = await desktopApi.selectNativeFontPicker(font.family).catch(() => false);
    if (!accepted) setSelecting(false);
  }

  return (
    <main
      className="app-shell min-h-screen bg-[var(--app-bg)] p-4 text-[rgb(var(--app-fg))] sm:p-5"
      data-ui-theme={activeContext.theme}
      data-testid={`font-picker-${activeContext.category}`}
    >
      <div className="mx-auto grid max-w-4xl gap-4">
        <header className="grid gap-1">
          <h1 className="app-text-primary text-xl font-bold">
            {activeContext.category === "cjk" ? t("fontSchemeChooseCjk") : t("fontSchemeChooseLatin")}
          </h1>
          <p className="app-text-subtle text-sm">
            {t(activeContext.category === "cjk" ? "fontSchemeCjkUsage" : "fontSchemeLatinUsage")}
          </p>
        </header>

        <section className="settings-surface grid gap-3 rounded-xl border p-4" aria-labelledby="font-picker-preview-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="font-picker-preview-heading" className="app-text-primary text-sm font-semibold">
              {t("fontSchemePreviewTitle")}
            </h2>
            <span className="app-text-subtle min-w-0 truncate text-xs">{sampleFamily}</span>
          </div>
          <p
            className="app-text-primary break-words text-2xl leading-relaxed"
            data-testid="font-picker-live-preview"
            style={{ fontFamily: `${quoteSingleFontFamily(sampleFamily)}, sans-serif` }}
          >
            {previewTextForCategory(activeContext.category)}
          </p>
        </section>

        <input
          ref={searchRef}
          data-testid="font-picker-search"
          aria-label={t("fontSchemeSearchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("fontSchemeSearchPlaceholder")}
          className="field-shell h-11 w-full rounded-lg px-3 text-sm"
        />

        <div className="grid max-h-[calc(100vh-17rem)] min-h-48 gap-4 overflow-y-auto pr-1">
          {recommended.length > 0 ? (
            <FontOptionGroup
              headingId="font-picker-recommended-heading"
              title={t("fontSchemeRecommendedFonts")}
              fonts={recommended}
              selectedFamily={activeContext.selectedFamily}
              disabled={selecting}
              onPreview={setPreviewFamily}
              onSelect={selectFont}
            />
          ) : null}
          {allFonts.length > 0 ? (
            <FontOptionGroup
              headingId="font-picker-all-heading"
              title={t("fontSchemeAllFonts")}
              fonts={allFonts}
              selectedFamily={activeContext.selectedFamily}
              disabled={selecting}
              onPreview={setPreviewFamily}
              onSelect={selectFont}
            />
          ) : null}
          {filtered.length === 0 && status !== "loading" ? (
            <p className="app-text-muted rounded-lg border border-[rgb(var(--panel-border))] p-4 text-sm">
              {t("customFontNoResults")}
            </p>
          ) : null}
          {status === "loading" ? <p className="app-text-subtle text-sm">{t("systemFontLoading")}</p> : null}
          {status === "empty" ? <p className="app-text-subtle text-sm">{t("systemFontEmpty")}</p> : null}
          {status === "failed" ? <p className="app-text-subtle text-sm">{t("systemFontFailed")}</p> : null}
        </div>

        <footer className="flex justify-end border-t border-[rgb(var(--panel-border))] pt-3">
          <button
            type="button"
            className="app-button h-10 rounded-lg px-4 text-sm font-semibold"
            onClick={() => void desktopApi?.closeNativeFontPicker()}
          >
            {t("fontSchemeClose")}
          </button>
        </footer>
      </div>
    </main>
  );
}

function FontOptionGroup({
  headingId,
  title,
  fonts,
  selectedFamily,
  disabled,
  onPreview,
  onSelect
}: {
  headingId: string;
  title: string;
  fonts: FontFamilyOption[];
  selectedFamily: string;
  disabled: boolean;
  onPreview: (family: string) => void;
  onSelect: (font: FontFamilyOption) => void;
}) {
  return (
    <section className="grid gap-2" aria-labelledby={headingId}>
      <h2 id={headingId} className="app-text-primary text-sm font-semibold">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {fonts.map((font) => {
          const selected = selectedFamily === font.family;
          return (
            <button
              key={font.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onMouseEnter={() => onPreview(font.family)}
              onFocus={() => onPreview(font.family)}
              onClick={() => onSelect(font)}
              className={cn(
                "grid gap-2 rounded-xl border p-3 text-left transition disabled:opacity-60",
                selected
                  ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))]"
                  : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
              )}
            >
              <span className="app-text-primary truncate text-sm font-semibold">{font.label}</span>
              <span
                className="app-text-muted block truncate text-sm"
                style={{ fontFamily: `${quoteSingleFontFamily(font.family)}, sans-serif` }}
              >
                {font.preview}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function documentLanguage(locale: Locale) {
  if (locale === "zh") return "zh-CN";
  return locale;
}
