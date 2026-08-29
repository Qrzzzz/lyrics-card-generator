"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, Check, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { MotionPresence } from "@/components/motion/MotionPresence";
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
import { motionDurations, motionEasings, reducedMotionTransition } from "@/lib/motion/tokens";
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

type SystemFontStatus = "idle" | "loading" | "ready" | "empty" | "failed" | "unavailable";

export function FontSchemePanel({ style, onStyleChange, onPreviewSchemeChange, showHeader = true, t }: FontSchemePanelProps) {
  const desktopApi = getLyricsCardDesktopApi();
  const reduceMotion = useAppReducedMotion();
  const currentScheme = getEffectiveFontScheme(style);
  const currentPresetId = identifyFontPreset(currentScheme);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<FontCategory>("cjk");
  const [pickerQuery, setPickerQuery] = useState("");
  const [customDraft, setCustomDraft] = useState<FontScheme>(() => customScheme(currentScheme));
  const [openingDraft, setOpeningDraft] = useState<FontScheme>(() => customScheme(currentScheme));
  const [systemFonts, setSystemFonts] = useState<SystemFontOption[]>([]);
  const [systemFontStatus, setSystemFontStatus] = useState<SystemFontStatus>("idle");
  const customSchemeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerOpenRef = useRef(false);

  useEffect(() => {
    if (!pickerOpen) return;
    if (!desktopApi) {
      setSystemFonts([]);
      setSystemFontStatus("unavailable");
      return;
    }

    let active = true;
    setSystemFontStatus("loading");
    void desktopApi.listSystemFonts()
      .then((fonts) => {
        if (!active) return;
        setSystemFonts(fonts);
        setSystemFontStatus(fonts.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (!active) return;
        setSystemFonts([]);
        setSystemFontStatus("failed");
      });

    return () => {
      active = false;
    };
  }, [desktopApi, pickerOpen]);

  useEffect(() => () => {
    pickerOpenRef.current = false;
    onPreviewSchemeChange?.(null);
  }, [onPreviewSchemeChange]);

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

  function applyPreset(preset: FontScheme) {
    pickerOpenRef.current = false;
    setPickerOpen(false);
    setPickerQuery("");
    applyScheme(preset);
  }

  function openFontSchemePicker() {
    setPickerCategory("cjk");
    setPickerQuery("");

    const startingScheme = customScheme(currentScheme);
    setOpeningDraft(startingScheme);
    setCustomDraft(startingScheme);
    pickerOpenRef.current = true;
    setPickerOpen(true);
    onPreviewSchemeChange?.(startingScheme);
  }

  function selectCustomFont(font: FontFamilyOption) {
    const nextDraft = withFamily(customDraft, font.category, font.family);
    setCustomDraft(nextDraft);
    if (pickerOpenRef.current) onPreviewSchemeChange?.(nextDraft);
  }

  function previewCustomFont(font: FontFamilyOption) {
    if (pickerOpenRef.current) {
      onPreviewSchemeChange?.(withFamily(customDraft, font.category, font.family));
    }
  }

  function restoreCustomDraftPreview() {
    if (pickerOpenRef.current) onPreviewSchemeChange?.(customDraft);
  }

  function swapCustomFonts() {
    const nextDraft: FontScheme = {
      mode: "custom",
      cjkFontFamily: customDraft.latinFontFamily,
      latinFontFamily: customDraft.cjkFontFamily
    };
    setCustomDraft(nextDraft);
    if (pickerOpenRef.current) onPreviewSchemeChange?.(nextDraft);
  }

  function restoreOpeningDraft() {
    setCustomDraft(openingDraft);
    if (pickerOpenRef.current) onPreviewSchemeChange?.(openingDraft);
  }

  function closeCustomPicker({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    pickerOpenRef.current = false;
    setPickerOpen(false);
    setPickerQuery("");
    onPreviewSchemeChange?.(null);
    if (restoreFocus) {
      requestAnimationFrame(() => customSchemeTriggerRef.current?.focus({ preventScroll: true }));
    }
  }

  function applyCustomScheme() {
    applyScheme(customDraft);
    closeCustomPicker();
  }

  const customDraftDirty = !sameFamilies(customDraft, openingDraft);
  const pageTransition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.slow, ease: motionEasings.emphasized };

  return (
    <section className="grid gap-5" data-testid="font-scheme-panel">
      {showHeader ? (
        <div>
          <h3 className="app-text-primary text-base font-semibold">{t("fontSchemeTitle")}</h3>
          <p className="app-text-subtle mt-1 text-sm">{t("fontSchemeDescription")}</p>
        </div>
      ) : null}

      <MotionPresence initial={false} mode="popLayout">
        {pickerOpen ? (
          <motion.div
            key="font-scheme-editor-page"
            className="min-w-0"
            data-testid="font-scheme-editor-transition"
            initial={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: 72 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: 72 }}
            transition={pageTransition}
          >
            <InlineFontPicker
              category={pickerCategory}
              draft={customDraft}
              query={pickerQuery}
              systemFonts={systemFonts}
              systemFontStatus={systemFontStatus}
              dirty={customDraftDirty}
              onCategoryChange={(category) => {
                setPickerCategory(category);
                setPickerQuery("");
                onPreviewSchemeChange?.(customDraft);
              }}
              onQueryChange={setPickerQuery}
              onPreview={previewCustomFont}
              onPreviewEnd={restoreCustomDraftPreview}
              onSelect={selectCustomFont}
              onSwap={swapCustomFonts}
              onRestore={restoreOpeningDraft}
              onApply={applyCustomScheme}
              onClose={() => closeCustomPicker()}
              t={t}
            />
          </motion.div>
        ) : (
          <motion.div
            key="font-scheme-overview-page"
            className="grid min-w-0 gap-5"
            data-testid="font-scheme-overview"
            initial={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: -72 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: -72 }}
            transition={pageTransition}
          >
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
                    onClick={() => applyPreset(preset)}
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
              aria-controls="custom-font-picker-workbench"
              onClick={openFontSchemePicker}
              className="control-focus grid w-full gap-4 rounded-xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] px-4 py-4 text-left transition hover:bg-[rgb(var(--button-bg-hover))]"
            >
              <span className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="app-text-primary block text-sm font-semibold">{t("fontSchemeCustomName")}</span>
                  <span className="app-text-subtle mt-1 block text-xs leading-relaxed">{t("fontSchemePickerDescription")}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--app-accent)]">
                  {t("fontSchemeEdit")}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </span>

              {!currentPresetId ? (
                <span className="grid gap-3 border-t border-[rgb(var(--panel-border))] pt-3">
                  <span className="flex justify-start">
                    <SelectedBadge label={t("fontSchemeSelected")} />
                  </span>
                  <span className="setting-row-adaptive grid gap-3">
                    <FontRoleSummary label={t("fontSchemeCjkFont")} value={currentScheme.cjkFontFamily} />
                    <FontRoleSummary label={t("fontSchemeLatinFont")} value={currentScheme.latinFontFamily} />
                  </span>
                </span>
              ) : null}
            </button>
          </PanelBlock>
          </motion.div>
        )}
      </MotionPresence>
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

function SelectedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--control-selected-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--app-accent)]">
      <Check className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function FontRoleSummary({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid min-w-0 gap-1">
      <span className="app-text-subtle text-[11px] font-semibold">{label}</span>
      <span className="app-text-primary min-w-0 break-words text-sm font-semibold">{value}</span>
    </span>
  );
}

function InlineFontPicker({
  category,
  draft,
  query,
  systemFonts,
  systemFontStatus,
  dirty,
  onCategoryChange,
  onQueryChange,
  onPreview,
  onPreviewEnd,
  onSelect,
  onSwap,
  onRestore,
  onApply,
  onClose,
  t
}: {
  category: FontCategory;
  draft: FontScheme;
  query: string;
  systemFonts: SystemFontOption[];
  systemFontStatus: SystemFontStatus;
  dirty: boolean;
  onCategoryChange: (category: FontCategory) => void;
  onQueryChange: (query: string) => void;
  onPreview: (font: FontFamilyOption) => void;
  onPreviewEnd: () => void;
  onSelect: (font: FontFamilyOption) => void;
  onSwap: () => void;
  onRestore: () => void;
  onApply: () => void;
  onClose: () => void;
  t: ReturnType<typeof createT>;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => buildFontOptions(category, systemFonts), [category, systemFonts]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? options.filter((font) => `${font.label} ${font.family}`.toLocaleLowerCase().includes(normalized))
      : options;
  }, [options, query]);
  const recommendedIds = new Set(
    RECOMMENDED_FONTS.filter((font) => font.category === category).map((font) => font.id)
  );
  const recommended = filtered.filter((font) => recommendedIds.has(font.id));
  const allFonts = filtered.filter((font) => !recommendedIds.has(font.id));
  const selectedFamily = familyForCategory(draft, category);

  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
  }, [category]);

  return (
    <section
      id="custom-font-picker-workbench"
      data-testid="font-picker-scheme"
      data-dirty={dirty ? "true" : "false"}
      aria-labelledby="font-picker-title"
      className="relative overflow-hidden rounded-xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))]"
    >
      <header className="grid gap-3 border-b border-[rgb(var(--panel-border))] p-4">
        <div>
          <h5 id="font-picker-title" className="app-text-primary text-base font-bold">{t("fontSchemePickerTitle")}</h5>
          <p className="app-text-subtle mt-1 text-xs leading-relaxed">{t("fontSchemePickerDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="app-button control-focus inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold"
              title={t("fontSchemeSwap")}
              onClick={onSwap}
            >
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              <span>{t("fontSchemeSwap")}</span>
            </button>
            <button
              type="button"
              className="app-button control-focus inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              title={t("fontSchemeRestore")}
              disabled={!dirty}
              onClick={onRestore}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              <span>{t("fontSchemeRestore")}</span>
            </button>
        </div>
      </header>

      <div className="grid gap-3 border-b border-[rgb(var(--panel-border))] p-4">
        <div className="setting-row-adaptive grid gap-2" role="group" aria-label={t("fontSchemePickerTitle")}>
          {(["cjk", "latin"] as FontCategory[]).map((optionCategory) => {
            const active = category === optionCategory;
            return (
              <button
                key={optionCategory}
                type="button"
                data-testid={`font-picker-category-${optionCategory}`}
                aria-pressed={active}
                onClick={() => onCategoryChange(optionCategory)}
                className={cn(
                  "control-focus relative min-w-0 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition",
                  active
                    ? "border-[var(--app-accent)] bg-[var(--control-selected-bg)]"
                    : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
                )}
              >
                {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--app-accent)]" aria-hidden="true" /> : null}
                <span className="app-text-subtle block text-[11px] font-semibold">
                  {t(optionCategory === "cjk" ? "fontSchemeCjkFont" : "fontSchemeLatinFont")}
                </span>
                <span className="app-text-primary mt-0.5 block truncate text-xs font-semibold">
                  {familyForCategory(draft, optionCategory)}
                </span>
              </button>
            );
          })}
        </div>

        <p className="app-text-subtle text-xs leading-relaxed" data-testid="font-picker-category-usage">
          {t(category === "cjk" ? "fontSchemeCjkUsage" : "fontSchemeLatinUsage")}
        </p>

        <div className="field-shell control-focus flex h-11 items-center gap-2 rounded-lg px-3">
          <Search className="app-text-subtle size-4 shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            data-testid="font-picker-search"
            aria-label={t("fontSchemeSearchPlaceholder")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("fontSchemeSearchPlaceholder")}
            className="app-text-primary min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[rgb(var(--app-subtle))]"
          />
          {query ? (
            <button
              type="button"
              className="control-focus app-text-subtle grid size-7 place-items-center rounded-md hover:bg-[rgb(var(--button-bg-hover))]"
              aria-label={t("fontSchemeClose")}
              onClick={() => {
                onQueryChange("");
                searchRef.current?.focus();
              }}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="grid max-h-[min(28rem,56vh)] gap-4 overflow-y-auto p-4"
        data-testid="font-picker-results"
        onMouseLeave={onPreviewEnd}
      >
        {recommended.length > 0 ? (
          <FontOptionGroup
            headingId="font-picker-recommended-heading"
            title={t("fontSchemeRecommendedFonts")}
            fonts={recommended}
            selectedFamily={selectedFamily}
            onPreview={onPreview}
            onPreviewEnd={onPreviewEnd}
            onSelect={onSelect}
          />
        ) : null}
        {allFonts.length > 0 ? (
          <FontOptionGroup
            headingId="font-picker-all-heading"
            title={t("fontSchemeAllFonts")}
            fonts={allFonts}
            selectedFamily={selectedFamily}
            onPreview={onPreview}
            onPreviewEnd={onPreviewEnd}
            onSelect={onSelect}
          />
        ) : null}
        {filtered.length === 0 && systemFontStatus !== "loading" ? (
          <p className="app-text-muted rounded-lg border border-[rgb(var(--panel-border))] p-4 text-sm">
            {t("customFontNoResults")}
          </p>
        ) : null}
        {systemFontStatus === "loading" ? <p className="app-text-subtle text-xs">{t("systemFontLoading")}</p> : null}
        {systemFontStatus === "empty" ? <p className="app-text-subtle text-xs">{t("systemFontEmpty")}</p> : null}
        {systemFontStatus === "failed" ? <p className="app-text-subtle text-xs">{t("systemFontFailed")}</p> : null}
        {systemFontStatus === "unavailable" ? <p className="app-text-subtle text-xs">{t("systemFontDesktopOnly")}</p> : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-4">
        <span className="grid gap-1 text-xs">
          <span className="app-text-subtle">
            {t("customFontResultCount", { shown: filtered.length, total: options.length })}
          </span>
          <span
            className={dirty ? "font-semibold text-[var(--app-accent)]" : "app-text-subtle"}
            data-testid="font-scheme-draft-status"
            aria-live="polite"
          >
            {t(dirty ? "fontSchemeDraftChanged" : "fontSchemeDraftUnchanged")}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="cancel-custom-font-scheme"
            className="app-button control-focus h-10 rounded-lg px-4 text-sm font-semibold"
            onClick={onClose}
          >
            {t("fontSchemePickerCancel")}
          </button>
          <button
            type="button"
            data-testid="save-custom-font-scheme"
            className="control-focus h-10 rounded-lg border border-[var(--app-accent)] bg-[rgb(var(--app-fg))] px-4 text-sm font-bold text-[var(--app-bg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!dirty}
            onClick={onApply}
          >
            {t("fontSchemePickerApply")}
          </button>
        </div>
      </footer>
    </section>
  );
}

function FontOptionGroup({
  headingId,
  title,
  fonts,
  selectedFamily,
  onPreview,
  onPreviewEnd,
  onSelect
}: {
  headingId: string;
  title: string;
  fonts: FontFamilyOption[];
  selectedFamily: string;
  onPreview: (font: FontFamilyOption) => void;
  onPreviewEnd: () => void;
  onSelect: (font: FontFamilyOption) => void;
}) {
  return (
    <section className="grid gap-2" aria-labelledby={headingId}>
      <h6 id={headingId} className="app-text-primary text-xs font-semibold">{title}</h6>
      <div className="grid gap-1.5">
        {fonts.map((font) => {
          const selected = selectedFamily === font.family;
          return (
            <button
              key={font.id}
              type="button"
              data-font-family={font.family}
              aria-pressed={selected}
              onMouseEnter={() => onPreview(font)}
              onFocus={() => onPreview(font)}
              onBlur={onPreviewEnd}
              onClick={() => onSelect(font)}
              className={cn(
                "control-focus grid min-h-14 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_1.25rem] items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                selected
                  ? "border-[var(--app-accent)] bg-[var(--control-selected-bg)]"
                  : "border-[rgb(var(--panel-border))] bg-[rgb(var(--button-bg))] hover:bg-[rgb(var(--button-bg-hover))]"
              )}
            >
              <span className="app-text-primary min-w-0 truncate text-xs font-semibold">{font.label}</span>
              <span
                className="app-text-muted min-w-0 truncate text-sm"
                style={{ fontFamily: `${quoteSingleFontFamily(font.family)}, sans-serif` }}
              >
                {font.preview}
              </span>
              <span className={cn("grid size-5 place-items-center rounded-full border", selected ? "border-[rgb(var(--app-fg))] bg-[rgb(var(--app-fg))] text-[var(--app-bg)]" : "border-[rgb(var(--control-border))]")}>
                {selected ? <Check className="size-3" aria-hidden="true" /> : null}
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

function familyForCategory(scheme: Pick<FontScheme, "cjkFontFamily" | "latinFontFamily">, category: FontCategory) {
  return category === "cjk" ? scheme.cjkFontFamily : scheme.latinFontFamily;
}

function withFamily(scheme: FontScheme, category: FontCategory, family: string): FontScheme {
  return category === "cjk"
    ? { ...scheme, mode: "custom", presetId: undefined, cjkFontFamily: family }
    : { ...scheme, mode: "custom", presetId: undefined, latinFontFamily: family };
}

function sameFamilies(first: FontScheme, second: FontScheme) {
  return first.cjkFontFamily === second.cjkFontFamily && first.latinFontFamily === second.latinFontFamily;
}

function presetName(presetId: FontPresetId, t: ReturnType<typeof createT>) {
  return t(presetId === "source-han-sans" ? "fontSchemeSourceHanSansName" : "fontSchemeSourceHanSerifName");
}

function presetDescription(presetId: FontPresetId, t: ReturnType<typeof createT>) {
  return t(presetId === "source-han-sans" ? "fontSchemeSourceHanSansDescription" : "fontSchemeSourceHanSerifDescription");
}
