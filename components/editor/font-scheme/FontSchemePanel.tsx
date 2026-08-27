"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { AdaptiveSettingsGrid } from "@/components/ui/controls";
import { getLyricsCardDesktopApi, type SystemFontOption } from "@/lib/desktop-api";
import {
  buildFontOptions,
  previewTextForCategory,
  RECOMMENDED_FONTS,
  type FontCategory,
  type FontFamilyOption
} from "@/lib/font-picker-options";
import {
  FONT_SCHEME_PRESETS,
  identifyFontPreset,
  normalizeFontScheme
} from "@/lib/font-schemes";
import { getEffectiveFontScheme, quoteSingleFontFamily } from "@/lib/fonts";
import type { createT } from "@/lib/i18n";
import type { EffectiveUiThemeId } from "@/lib/settings/types";
import type {
  CardStyle,
  FontPresetId,
  FontScheme,
  Locale
} from "@/lib/types";
import { cn } from "@/lib/utils";

type FontSchemePanelProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  onPreviewSchemeChange?: (scheme: FontScheme | null) => void;
  showHeader?: boolean;
  locale: Locale;
  t: ReturnType<typeof createT>;
};

export function FontSchemePanel({ style, onStyleChange, onPreviewSchemeChange, showHeader = true, locale, t }: FontSchemePanelProps) {
  const desktopApi = getLyricsCardDesktopApi();
  const currentScheme = getEffectiveFontScheme(style);
  const currentPresetId = identifyFontPreset(currentScheme);
  const [fallbackPickerOpen, setFallbackPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<FontCategory>("cjk");
  const [pickerQuery, setPickerQuery] = useState("");
  const [fallbackDraft, setFallbackDraft] = useState<FontScheme>(() => customScheme(currentScheme));
  const [nativePickerOpen, setNativePickerOpen] = useState(false);
  const [nativeFocusRestoreVersion, setNativeFocusRestoreVersion] = useState(0);
  const customSchemeTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (nativeFocusRestoreVersion > 0) customSchemeTriggerRef.current?.focus();
  }, [nativeFocusRestoreVersion]);

  function applyScheme(nextScheme: FontScheme) {
    const normalized = normalizeFontScheme(nextScheme);
    const presetId = identifyFontPreset(normalized);

    onStyleChange({
      ...style,
      fontScheme: normalized,
      font: presetId === "source-han-serif" ? "serif-heavy" : "sans-heavy",
      customFontEnabled: !presetId,
      customFontFamily: presetId ? "" : normalized.latinFontFamily,
      customFontLabel: presetId ? "" : normalized.latinFontFamily,
      customFontWeight: 400,
      customFontStyle: "normal"
    });
    onPreviewSchemeChange?.(null);
  }

  async function openFontSchemePicker() {
    setPickerQuery("");
    const startingScheme = customScheme(currentScheme);
    if (!desktopApi) {
      setFallbackDraft(startingScheme);
      setPickerCategory("cjk");
      setFallbackPickerOpen(true);
      return;
    }

    setNativePickerOpen(true);
    const result = await desktopApi.openNativeFontPicker({
      cjkFontFamily: startingScheme.cjkFontFamily,
      latinFontFamily: startingScheme.latinFontFamily,
      locale,
      theme: currentUiTheme(),
      title: t("fontSchemePickerTitle")
    }).catch(() => null);
    setNativePickerOpen(false);
    if (result) {
      applyScheme({
        mode: "custom",
        cjkFontFamily: result.cjkFontFamily,
        latinFontFamily: result.latinFontFamily
      });
    }
    setNativeFocusRestoreVersion((version) => version + 1);
  }

  function selectFallbackFont(font: Pick<FontFamilyOption, "category" | "family">) {
    setFallbackDraft((draft) => withFamily(draft, font.category, font.family));
  }

  function applyFallbackScheme() {
    applyScheme(fallbackDraft);
    setFallbackPickerOpen(false);
  }

  return (
    <section className="grid gap-5" data-testid="font-scheme-panel">
      {showHeader ? (
        <div>
          <h3 className="app-text-primary text-base font-semibold">{t("fontSchemeTitle")}</h3>
          <p className="app-text-subtle mt-1 text-sm">{t("fontSchemeDescription")}</p>
        </div>
      ) : null}

      <PanelBlock title={t("fontSchemeCurrentTitle")}>
        <div className="min-w-0">
          <p className="app-text-primary text-lg font-semibold" data-testid="font-scheme-current-name">
            {currentPresetId ? presetName(currentPresetId, t) : t("fontSchemeCustomName")}
          </p>
          <dl className="app-text-muted mt-3 grid gap-2 text-sm">
            <FontSummaryRow label={t("fontSchemeCjkFont")} value={currentScheme.cjkFontFamily} />
            <FontSummaryRow label={t("fontSchemeLatinFont")} value={currentScheme.latinFontFamily} />
          </dl>
        </div>
      </PanelBlock>

      <PanelBlock title={t("fontSchemePresetsTitle")} tone="plain">
        <AdaptiveSettingsGrid kind="pairs">
          {(["source-han-sans", "source-han-serif"] as FontPresetId[]).map((presetId) => {
            const preset = FONT_SCHEME_PRESETS[presetId];
            const active = currentPresetId === presetId;
            const genericFallback = presetId === "source-han-serif" ? "serif" : "sans-serif";
            return (
              <button
                type="button"
                key={presetId}
                data-testid={`apply-font-preset-${presetId}`}
                aria-pressed={active}
                onClick={() => applyScheme(preset)}
                style={{ fontFamily: `${quoteSingleFontFamily(preset.cjkFontFamily)}, ${genericFallback}` }}
                className={cn(
                  "control-focus rounded-xl border p-4 text-left transition",
                  active ? "border-cyan-200/55 bg-cyan-300/10" : "app-border bg-black/10"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="app-text-primary font-semibold">{presetName(presetId, t)}</h4>
                    <p className="app-text-subtle mt-1 text-xs">{preset.cjkFontFamily}</p>
                  </div>
                  {active ? (
                    <span className="rounded-full bg-cyan-200/15 px-2 py-1 text-[11px] font-semibold text-cyan-100">
                      {t("fontSchemeSelected")}
                    </span>
                  ) : null}
                </div>
                <p className="app-text-muted mt-3 min-h-10 text-sm">{presetDescription(presetId, t)}</p>
              </button>
            );
          })}
        </AdaptiveSettingsGrid>
      </PanelBlock>

      <PanelBlock title={t("fontSchemeCustomTitle")}>
        <button
          ref={customSchemeTriggerRef}
          type="button"
          data-testid="edit-custom-font-scheme"
          onClick={() => void openFontSchemePicker()}
          disabled={nativePickerOpen}
          aria-busy={nativePickerOpen}
          className="app-button control-focus grid min-h-24 w-full gap-3 rounded-xl px-4 py-3 text-left disabled:cursor-wait disabled:opacity-60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <dl className="grid min-w-0 gap-2 text-sm">
            <FontSummaryRow label={t("fontSchemeCjkFont")} value={currentScheme.cjkFontFamily} />
            <FontSummaryRow label={t("fontSchemeLatinFont")} value={currentScheme.latinFontFamily} />
          </dl>
          <span className="shrink-0 text-sm font-semibold text-cyan-100">{t("fontSchemeEdit")}</span>
        </button>
      </PanelBlock>

      <FontSchemePickerDialog
        open={fallbackPickerOpen}
        category={pickerCategory}
        draft={fallbackDraft}
        query={pickerQuery}
        systemFonts={[]}
        status={t("systemFontDesktopOnly")}
        onCategoryChange={(category) => {
          setPickerCategory(category);
          setPickerQuery("");
        }}
        onQueryChange={setPickerQuery}
        onSelect={selectFallbackFont}
        onApply={applyFallbackScheme}
        onClose={() => setFallbackPickerOpen(false)}
        t={t}
      />
    </section>
  );
}

function PanelBlock({
  title,
  children,
  tone = "subtle"
}: {
  title: string;
  children: React.ReactNode;
  tone?: "plain" | "subtle";
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        tone === "subtle"
          ? "rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3"
          : ""
      )}
    >
      <h4 className="app-text-primary text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}

function FontSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="app-text-subtle">{label}</dt>
      <dd className="app-text-primary min-w-0 break-words">{value}</dd>
    </div>
  );
}

function FontSchemePickerDialog({
  open,
  category,
  draft,
  query,
  systemFonts,
  status,
  onCategoryChange,
  onQueryChange,
  onSelect,
  onApply,
  onClose,
  t
}: {
  open: boolean;
  category: FontCategory;
  draft: FontScheme;
  query: string;
  systemFonts: SystemFontOption[];
  status: string;
  onCategoryChange: (category: FontCategory) => void;
  onQueryChange: (query: string) => void;
  onSelect: (font: FontFamilyOption) => void;
  onApply: () => void;
  onClose: () => void;
  t: ReturnType<typeof createT>;
}) {
  const options = useMemo(() => buildFontOptions(category, systemFonts), [category, systemFonts]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? options.filter((font) => `${font.label} ${font.family}`.toLocaleLowerCase().includes(normalized))
      : options;
  }, [options, query]);
  const recommendedIds = new Set(RECOMMENDED_FONTS.filter((font) => font.category === category).map((font) => font.id));
  const recommended = filtered.filter((font) => recommendedIds.has(font.id));
  const allFonts = filtered.filter((font) => !recommendedIds.has(font.id));
  const selectedFamily = familyForCategory(draft, category);

  return (
    <AccessibleDialog
      open={open}
      labelledBy="font-picker-title"
      onClose={onClose}
      initialFocusSelector='[data-testid="font-picker-search"]'
      overlayClassName="z-[160] bg-black/70"
      panelClassName="settings-surface flex max-h-[90vh] max-w-3xl flex-col overflow-hidden rounded-2xl border"
    >
      <section data-testid="font-picker-scheme" className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-[rgb(var(--panel-border))] p-5">
          <h2 id="font-picker-title" className="app-text-primary text-lg font-bold">{t("fontSchemePickerTitle")}</h2>
          <p className="app-text-subtle mt-1 text-sm">{t("fontSchemePickerDescription")}</p>
        </header>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["cjk", "latin"] as FontCategory[]).map((optionCategory) => (
              <button
                key={optionCategory}
                type="button"
                data-testid={`font-picker-category-${optionCategory}`}
                aria-pressed={category === optionCategory}
                onClick={() => onCategoryChange(optionCategory)}
                className={cn(
                  "control-focus grid gap-1 rounded-xl border p-3 text-left",
                  category === optionCategory
                    ? "border-cyan-200/60 bg-cyan-300/10"
                    : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))]"
                )}
              >
                <span className="app-text-subtle text-xs">
                  {t(optionCategory === "cjk" ? "fontSchemeCjkFont" : "fontSchemeLatinFont")}
                </span>
                <span className="app-text-primary break-words text-sm font-semibold">
                  {familyForCategory(draft, optionCategory)}
                </span>
              </button>
            ))}
          </div>
          <section className="grid gap-2 rounded-xl border border-[rgb(var(--panel-border))] p-3" aria-label={t("fontSchemePreviewTitle")}>
            {(["cjk", "latin"] as FontCategory[]).map((previewCategory) => (
              <p
                key={previewCategory}
                className="app-text-primary break-words text-lg leading-relaxed"
                style={{ fontFamily: `${quoteSingleFontFamily(familyForCategory(draft, previewCategory))}, sans-serif` }}
              >
                {previewTextForCategory(previewCategory)}
              </p>
            ))}
          </section>
          <input
            data-testid="font-picker-search"
            aria-label={t("fontSchemeSearchPlaceholder")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("fontSchemeSearchPlaceholder")}
            className="field-shell h-11 w-full rounded-lg px-3 text-sm"
          />
          {recommended.length > 0 ? (
            <FontOptionGroup headingId="font-picker-recommended-heading" title={t("fontSchemeRecommendedFonts")} fonts={recommended} selectedFamily={selectedFamily} onSelect={onSelect} />
          ) : null}
          {allFonts.length > 0 ? (
            <FontOptionGroup headingId="font-picker-all-heading" title={t("fontSchemeAllFonts")} fonts={allFonts} selectedFamily={selectedFamily} onSelect={onSelect} />
          ) : null}
          {filtered.length === 0 ? <p className="app-text-muted rounded-lg border border-[rgb(var(--panel-border))] p-4 text-sm">{t("customFontNoResults")}</p> : null}
          {status ? <p className="app-text-subtle text-sm">{status}</p> : null}
        </div>
        <footer className="flex justify-end gap-3 border-t border-[rgb(var(--panel-border))] p-4">
          <button type="button" className="app-button h-10 rounded-lg px-4 text-sm font-semibold" onClick={onClose}>
            {t("fontSchemePickerCancel")}
          </button>
          <button type="button" data-testid="font-picker-apply" className="h-10 rounded-lg bg-cyan-200 px-4 text-sm font-bold text-slate-950" onClick={onApply}>
            {t("fontSchemePickerApply")}
          </button>
        </footer>
      </section>
    </AccessibleDialog>
  );
}

function FontOptionGroup({
  headingId,
  title,
  fonts,
  selectedFamily,
  onSelect
}: {
  headingId: string;
  title: string;
  fonts: FontFamilyOption[];
  selectedFamily: string;
  onSelect: (font: FontFamilyOption) => void;
}) {
  return (
    <section className="grid gap-2" aria-labelledby={headingId}>
      <h3 id={headingId} className="app-text-primary text-sm font-semibold">{title}</h3>
      <div className="grid gap-2">
        {fonts.map((font) => {
          const selected = selectedFamily === font.family;
          return (
            <button
              key={font.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(font)}
              className={cn(
                "grid gap-2 rounded-xl border p-3 text-left transition sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center",
                selected
                  ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))]"
                  : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
              )}
            >
              <span className="app-text-primary block text-sm font-semibold">{font.label}</span>
              <span className="app-text-muted block truncate text-sm" style={{ fontFamily: `${quoteSingleFontFamily(font.family)}, sans-serif` }}>
                {font.preview}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function customScheme(scheme: FontScheme): FontScheme {
  return {
    mode: "custom",
    cjkFontFamily: scheme.cjkFontFamily,
    latinFontFamily: scheme.latinFontFamily
  };
}

function familyForCategory(scheme: FontScheme, category: FontCategory) {
  return category === "cjk" ? scheme.cjkFontFamily : scheme.latinFontFamily;
}

function withFamily(scheme: FontScheme, category: FontCategory, family: string): FontScheme {
  return category === "cjk"
    ? { ...scheme, mode: "custom", presetId: undefined, cjkFontFamily: family }
    : { ...scheme, mode: "custom", presetId: undefined, latinFontFamily: family };
}

function currentUiTheme(): EffectiveUiThemeId {
  const theme = document.body.dataset.uiTheme;
  if (
    theme === "album-dynamic" ||
    theme === "dark" ||
    theme === "light" ||
    theme === "dark-acrylic" ||
    theme === "light-acrylic"
  ) {
    return theme;
  }
  return "dark";
}

function presetName(presetId: FontPresetId, t: ReturnType<typeof createT>) {
  return t(presetId === "source-han-sans" ? "fontSchemeSourceHanSansName" : "fontSchemeSourceHanSerifName");
}

function presetDescription(presetId: FontPresetId, t: ReturnType<typeof createT>) {
  return t(presetId === "source-han-sans" ? "fontSchemeSourceHanSansDescription" : "fontSchemeSourceHanSerifDescription");
}
