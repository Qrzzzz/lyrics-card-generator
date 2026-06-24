"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { FontPreviewBackground } from "@/components/editor/font-scheme/FontSchemePreviewPanel";
import { getLyricsCardDesktopApi, type SystemFontOption } from "@/lib/desktop-api";
import {
  FONT_SCHEME_PRESETS,
  identifyFontPreset,
  normalizeFontScheme
} from "@/lib/font-schemes";
import { getEffectiveFontScheme, quoteSingleFontFamily } from "@/lib/fonts";
import type { createT } from "@/lib/i18n";
import type {
  CardStyle,
  FontPresetId,
  FontScheme
} from "@/lib/types";
import { cn } from "@/lib/utils";

type FontCategory = "cjk" | "latin";

type FontFamilyOption = {
  id: string;
  family: string;
  label: string;
  category: FontCategory;
  preview: string;
  fallback?: string[];
};

type FontSchemePanelProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  onPreviewSchemeChange?: (scheme: FontScheme | null) => void;
  t: ReturnType<typeof createT>;
};

const RECOMMENDED_FONTS: FontFamilyOption[] = [
  cjkFont("source-han-sans", "Source Han Sans SC"),
  cjkFont("source-han-serif", "Source Han Serif SC"),
  cjkFont("microsoft-yahei", "Microsoft YaHei"),
  cjkFont("simsun", "SimSun"),
  latinFont("source-han-sans-latin", "Source Han Sans SC"),
  latinFont("source-han-serif-latin", "Source Han Serif SC"),
  latinFont("inter", "Inter"),
  latinFont("source-sans-3", "Source Sans 3"),
  latinFont("source-serif-4", "Source Serif 4"),
  latinFont("arial", "Arial"),
  latinFont("georgia", "Georgia"),
  latinFont("maple-mono", "Maple Mono")
];

export function FontSchemePanel({ style, onStyleChange, onPreviewSchemeChange, t }: FontSchemePanelProps) {
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
  const [systemFonts, setSystemFonts] = useState<SystemFontOption[]>([]);
  const [systemFontStatus, setSystemFontStatus] = useState("");

  useEffect(() => {
    let active = true;

    if (!desktopApi) {
      setSystemFontStatus(t("systemFontDesktopOnly"));
      return;
    }

    setSystemFontStatus(t("systemFontLoading"));
    desktopApi
      .listSystemFonts()
      .then((fonts) => {
        if (!active) return;
        setSystemFonts(fonts);
        setSystemFontStatus(fonts.length > 0 ? "" : t("systemFontEmpty"));
      })
      .catch(() => {
        if (!active) return;
        setSystemFontStatus(t("systemFontFailed"));
      });

    return () => {
      active = false;
    };
  }, [desktopApi, t]);

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
    requestAnimationFrame(() => customSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function selectCustomFont(font: FontFamilyOption) {
    const nextDraft: FontScheme = {
      ...customDraft,
      mode: "custom",
      presetId: undefined,
      ...(font.category === "cjk"
        ? { cjkFontFamily: font.family }
        : { latinFontFamily: font.family })
    };
    setCustomDraft(nextDraft);
    onPreviewSchemeChange?.(nextDraft);
    setPickerCategory(null);
  }

  return (
    <section className="grid gap-5" data-testid="font-scheme-panel">
      <div>
        <h3 className="app-text-primary text-base font-semibold">{t("fontSchemeTitle")}</h3>
        <p className="app-text-subtle mt-1 text-sm">{t("fontSchemeDescription")}</p>
      </div>

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

      <PanelBlock title={t("fontSchemePresetsTitle")}>
        <div className="grid gap-3 md:grid-cols-2">
          {(["source-han-sans", "source-han-serif"] as FontPresetId[]).map((presetId) => {
            const preset = FONT_SCHEME_PRESETS[presetId];
            const active = currentPresetId === presetId;
            return (
              <article
                key={presetId}
                className={cn(
                  "rounded-xl border p-4 transition",
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
                <MiniFontPreview scheme={preset} />
                <button
                  type="button"
                  data-testid={`apply-font-preset-${presetId}`}
                  className="app-button mt-4 h-10 w-full rounded-lg px-4 text-sm font-semibold"
                  onClick={() => applyScheme(preset)}
                >
                  {t("fontSchemeApply")}
                </button>
              </article>
            );
          })}
        </div>
      </PanelBlock>

      <PanelBlock title={t("fontSchemeCustomTitle")} blockRef={customSectionRef}>
        <div className="grid gap-3 md:grid-cols-2">
          <FontChoice
            label={t("fontSchemeCjkFont")}
            value={customDraft.cjkFontFamily}
            onChoose={() => setPickerCategory("cjk")}
            chooseLabel={t("fontSchemeChoose")}
          />
          <FontChoice
            label={t("fontSchemeLatinFont")}
            value={customDraft.latinFontFamily}
            onChoose={() => setPickerCategory("latin")}
            chooseLabel={t("fontSchemeChoose")}
          />
        </div>
        <button
          type="button"
          data-testid="save-custom-font-scheme"
          className="h-10 rounded-lg bg-cyan-200 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-100"
          onClick={() => applyScheme(customDraft)}
        >
          {t("fontSchemeSaveCurrent")}
        </button>
      </PanelBlock>

      {pickerCategory ? (
        <FontPickerDialog
          category={pickerCategory}
          selectedFamily={pickerCategory === "cjk" ? customDraft.cjkFontFamily : customDraft.latinFontFamily}
          systemFonts={systemFonts}
          status={systemFontStatus}
          onSelect={selectCustomFont}
          onClose={() => setPickerCategory(null)}
          t={t}
        />
      ) : null}
    </section>
  );
}

function PanelBlock({
  title,
  children,
  blockRef
}: {
  title: string;
  children: React.ReactNode;
  blockRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={blockRef} className="grid gap-4 rounded-xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-4">
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
  label,
  value,
  chooseLabel,
  onChoose
}: {
  label: string;
  value: string;
  chooseLabel: string;
  onChoose: () => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="app-text-primary text-sm font-medium">{label}</p>
      <button
        type="button"
        onClick={onChoose}
        className="app-button flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm"
      >
        <span className="min-w-0 break-words">{value}</span>
        <span className="shrink-0 text-xs text-cyan-100">{chooseLabel}</span>
      </button>
    </div>
  );
}

function FontPickerDialog({
  category,
  selectedFamily,
  systemFonts,
  status,
  onSelect,
  onClose,
  t
}: {
  category: FontCategory;
  selectedFamily: string;
  systemFonts: SystemFontOption[];
  status: string;
  onSelect: (font: FontFamilyOption) => void;
  onClose: () => void;
  t: ReturnType<typeof createT>;
}) {
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="font-picker-title"
        data-testid={`font-picker-${category}`}
        className="settings-surface flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border"
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
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("fontSchemeSearchPlaceholder")}
            className="field-shell h-11 w-full rounded-lg px-3 text-sm"
          />
          {recommended.length > 0 ? (
            <FontOptionGroup title={t("fontSchemeRecommendedFonts")} fonts={recommended} selectedFamily={selectedFamily} onSelect={onSelect} />
          ) : null}
          {allFonts.length > 0 ? (
            <FontOptionGroup title={t("fontSchemeAllFonts")} fonts={allFonts} selectedFamily={selectedFamily} onSelect={onSelect} />
          ) : null}
          {filtered.length === 0 ? <p className="app-text-muted rounded-lg border border-[rgb(var(--panel-border))] p-4 text-sm">{t("customFontNoResults")}</p> : null}
          {status ? <p className="app-text-subtle text-sm">{status}</p> : null}
        </div>
      </section>
    </div>,
    document.body
  );
}

function FontOptionGroup({
  title,
  fonts,
  selectedFamily,
  onSelect
}: {
  title: string;
  fonts: FontFamilyOption[];
  selectedFamily: string;
  onSelect: (font: FontFamilyOption) => void;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="app-text-primary text-sm font-semibold">{title}</h3>
      <div className="grid gap-2" role="listbox">
        {fonts.map((font) => {
          const selected = selectedFamily === font.family;
          return (
            <button
              key={font.id}
              type="button"
              role="option"
              aria-selected={selected}
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
    </div>
  );
}

function MiniFontPreview({ scheme }: { scheme: FontScheme }) {
  return (
    <div className="relative isolate mt-4 overflow-hidden rounded-lg border border-white/10 p-3 text-white">
      <FontPreviewBackground />
      <div className="relative z-10">
        <p className="truncate text-sm font-black" style={familyStyle(scheme.cjkFontFamily)}>共に歩んだ旅路を辿れば</p>
        <p className="mt-1 truncate text-[11px] text-white/65" style={familyStyle(scheme.latinFontFamily)}>tomoni ayunda tabiji wo tadoreba</p>
      </div>
    </div>
  );
}

function buildFontOptions(category: FontCategory, systemFonts: SystemFontOption[]) {
  const recommended = RECOMMENDED_FONTS.filter((font) => font.category === category);
  const discovered = systemFonts
    .filter((font) => (category === "cjk" ? isCjkFont(font) : !isCjkFont(font)))
    .map((font, index): FontFamilyOption => ({
      id: `system-${category}-${font.family}-${index}`,
      family: font.family,
      label: font.label,
      category,
      preview: category === "cjk" ? "共に歩んだ旅路を辿れば" : "tomoni ayunda tabiji wo tadoreba"
    }));
  const seen = new Set<string>();
  return [...recommended, ...discovered].filter((font) => {
    const key = font.family.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isCjkFont(font: Pick<SystemFontOption, "family" | "label">) {
  return /(han|cjk|yahei|simsun|simhei|fangsong|kaiti|jhenghei|mingliu|meiryo|gothic|mincho|malgun|gulim|batang|宋|黑|楷|仿宋|圆|明朝|ゴシック|명조|고딕)/i.test(
    `${font.family} ${font.label}`
  );
}

function cjkFont(id: string, family: string): FontFamilyOption {
  return { id, family, label: family, category: "cjk", preview: "共に歩んだ旅路を辿れば" };
}

function latinFont(id: string, family: string): FontFamilyOption {
  return { id, family, label: family, category: "latin", preview: "tomoni ayunda tabiji wo tadoreba" };
}

function familyStyle(family: string) {
  return { fontFamily: `${quoteSingleFontFamily(family)}, sans-serif` };
}

function presetName(presetId: FontPresetId, t: ReturnType<typeof createT>) {
  return t(presetId === "source-han-sans" ? "fontSchemeSourceHanSansName" : "fontSchemeSourceHanSerifName");
}

function presetDescription(presetId: FontPresetId, t: ReturnType<typeof createT>) {
  return t(presetId === "source-han-sans" ? "fontSchemeSourceHanSansDescription" : "fontSchemeSourceHanSerifDescription");
}
