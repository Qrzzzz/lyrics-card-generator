"use client";

import { useMemo, useRef, useState } from "react";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { AdaptiveSettingsGrid } from "@/components/ui/controls";
import { getLyricsCardDesktopApi, type SystemFontOption } from "@/lib/desktop-api";
import {
  buildFontOptions,
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
  const reduceMotion = useAppReducedMotion();
  const desktopApi = getLyricsCardDesktopApi();
  const currentScheme = getEffectiveFontScheme(style);
  const currentPresetId = identifyFontPreset(currentScheme);
  const customSectionRef = useRef<HTMLDivElement>(null);
  const [customDraft, setCustomDraft] = useState<FontScheme>(() => ({
    mode: "custom",
    cjkFontFamily: currentScheme.cjkFontFamily,
    latinFontFamily: currentScheme.latinFontFamily
  }));
  const [pickerCategory, setPickerCategory] = useState<FontCategory | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [nativePickerCategory, setNativePickerCategory] = useState<FontCategory | null>(null);
  // Retain the category while the dialog exits so its rendered content remains well-defined.
  const lastPickerCategoryRef = useRef<FontCategory>("cjk");
  if (pickerCategory) lastPickerCategoryRef.current = pickerCategory;
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

  function editCurrentScheme() {
    setCustomDraft({
      mode: "custom",
      cjkFontFamily: currentScheme.cjkFontFamily,
      latinFontFamily: currentScheme.latinFontFamily
    });
    onPreviewSchemeChange?.(currentScheme);
    requestAnimationFrame(() => customSectionRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }));
  }

  async function openFontPicker(category: FontCategory) {
    setPickerQuery("");
    if (!desktopApi) {
      setPickerCategory(category);
      return;
    }

    setNativePickerCategory(category);
    const selectedFamily = category === "cjk" ? customDraft.cjkFontFamily : customDraft.latinFontFamily;
    const family = await desktopApi.openNativeFontPicker({
      category,
      selectedFamily,
      locale,
      theme: currentUiTheme(),
      title: t(category === "cjk" ? "fontSchemeChooseCjk" : "fontSchemeChooseLatin")
    }).catch(() => null);
    setNativePickerCategory(null);
    if (family) selectCustomFont({ category, family });
    requestAnimationFrame(() => {
      const trigger = document.querySelector<HTMLElement>(
        `[data-testid="${category === "cjk" ? "choose-cjk-font" : "choose-latin-font"}"]`
      );
      trigger?.focus();
    });
  }

  function selectCustomFont(font: Pick<FontFamilyOption, "category" | "family">) {
    const nextDraft: FontScheme = {
      ...customDraft,
      mode: "custom",
      presetId: undefined,
      ...(font.category === "cjk"
        ? { cjkFontFamily: font.family }
        : { latinFontFamily: font.family })
    };
    // Picker selection updates only the draft preview; applyScheme performs the durable commit.
    setCustomDraft(nextDraft);
    onPreviewSchemeChange?.(nextDraft);
    setPickerCategory(null);
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="app-text-primary text-lg font-semibold" data-testid="font-scheme-current-name">
              {currentPresetId ? presetName(currentPresetId, t) : t("fontSchemeCustomName")}
            </p>
            <dl className="app-text-muted mt-3 grid gap-2 text-sm">
              <FontSummaryRow label={t("fontSchemeCjkFont")} value={currentScheme.cjkFontFamily} />
              <FontSummaryRow label={t("fontSchemeLatinFont")} value={currentScheme.latinFontFamily} />
            </dl>
          </div>
          <button type="button" className="app-button h-10 rounded-lg px-4 text-sm font-semibold" onClick={editCurrentScheme}>
            {t("fontSchemeEdit")}
          </button>
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

      <PanelBlock title={t("fontSchemeCustomTitle")} blockRef={customSectionRef}>
        <AdaptiveSettingsGrid kind="pairs">
          <FontChoice
            testId="choose-cjk-font"
            label={t("fontSchemeCjkFont")}
            value={customDraft.cjkFontFamily}
            onChoose={() => openFontPicker("cjk")}
            disabled={nativePickerCategory !== null}
            chooseLabel={t("fontSchemeChoose")}
          />
          <FontChoice
            testId="choose-latin-font"
            label={t("fontSchemeLatinFont")}
            value={customDraft.latinFontFamily}
            onChoose={() => openFontPicker("latin")}
            disabled={nativePickerCategory !== null}
            chooseLabel={t("fontSchemeChoose")}
          />
        </AdaptiveSettingsGrid>
        <button
          type="button"
          data-testid="save-custom-font-scheme"
          className="h-10 rounded-lg bg-cyan-200 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-100"
          onClick={() => applyScheme(customDraft)}
        >
          {t("fontSchemeSaveCurrent")}
        </button>
      </PanelBlock>

      <FontPickerDialog
        open={pickerCategory !== null}
        category={lastPickerCategoryRef.current}
        query={pickerQuery}
        selectedFamily={pickerCategory === "cjk" ? customDraft.cjkFontFamily : customDraft.latinFontFamily}
        systemFonts={[]}
        status={t("systemFontDesktopOnly")}
        onQueryChange={setPickerQuery}
        onSelect={selectCustomFont}
        onClose={() => setPickerCategory(null)}
        t={t}
      />
    </section>
  );
}

function PanelBlock({
  title,
  children,
  blockRef,
  tone = "subtle"
}: {
  title: string;
  children: React.ReactNode;
  blockRef?: React.RefObject<HTMLDivElement | null>;
  tone?: "plain" | "subtle";
}) {
  return (
    <div
      ref={blockRef}
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

function FontChoice({
  testId,
  label,
  value,
  chooseLabel,
  onChoose,
  disabled = false
}: {
  testId: string;
  label: string;
  value: string;
  chooseLabel: string;
  onChoose: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <p className="app-text-primary text-sm font-medium">{label}</p>
      <button
        type="button"
        data-testid={testId}
        onClick={onChoose}
        disabled={disabled}
        aria-busy={disabled}
        className="app-button flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-wait disabled:opacity-60"
      >
        <span className="min-w-0 break-words">{value}</span>
        <span className="shrink-0 text-xs text-cyan-100">{chooseLabel}</span>
      </button>
    </div>
  );
}

function FontPickerDialog({
  open,
  category,
  query,
  selectedFamily,
  systemFonts,
  status,
  onQueryChange,
  onSelect,
  onClose,
  t
}: {
  open: boolean;
  category: FontCategory;
  query: string;
  selectedFamily: string;
  systemFonts: SystemFontOption[];
  status: string;
  onQueryChange: (query: string) => void;
  onSelect: (font: FontFamilyOption) => void;
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

  return (
    <AccessibleDialog open={open} labelledBy="font-picker-title" onClose={onClose} initialFocusSelector='[data-testid="font-picker-search"]' overlayClassName="z-[160] bg-black/70" panelClassName="settings-surface flex max-h-[86vh] max-w-3xl flex-col overflow-hidden rounded-2xl border">
      <section
        data-testid={`font-picker-${category}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[rgb(var(--panel-border))] p-5">
          <div>
            <h2 id="font-picker-title" className="app-text-primary text-lg font-bold">
              {category === "cjk" ? t("fontSchemeChooseCjk") : t("fontSchemeChooseLatin")}
            </h2>
            <p className="app-text-subtle mt-1 text-sm">{t(category === "cjk" ? "fontSchemeCjkUsage" : "fontSchemeLatinUsage")}</p>
          </div>
          <button type="button" className="app-button h-10 rounded-lg px-3 text-sm" onClick={onClose} aria-label={t("fontSchemeClose")}>
            {t("fontSchemeClose")}
          </button>
        </header>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
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
                selected ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))]" : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
              )}
            >
              <span>
                <span className="app-text-primary block text-sm font-semibold">{font.label}</span>
                <span className="app-text-subtle mt-1 block text-xs">{font.category === "cjk" ? "CJK" : "Latin"}</span>
              </span>
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
