"use client";

import { useEffect, useMemo, useState } from "react";
import { FontSchemePanel } from "@/components/editor/font-scheme/FontSchemePanel";
import { ColorControls } from "@/components/editor/style-panel/ColorControls";
import {
  FieldLabel,
  Section,
  SegmentedControl,
  SelectField,
  SettingRow,
  TextInput,
  ToggleRow
} from "@/components/ui/controls";
import { PRESET_CARD_SIZES } from "@/lib/card-size";
import { getLyricsCardDesktopApi, type SystemFontOption } from "@/lib/desktop-api";
import { canBrowserUseFont, quoteSingleFontFamily, sanitizeCssFontFamilyName } from "@/lib/fonts";
import type { createT } from "@/lib/i18n";
import type {
  CardAlign,
  CardLayoutMode,
  CardRatio,
  CardStyle,
  ContentMode,
  FontScheme
} from "@/lib/types";

type StylePanelProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  onFontSchemePreviewChange?: (scheme: FontScheme | null) => void;
  t: ReturnType<typeof createT>;
};

export function StylePanel(props: StylePanelProps) {
  return (
    <div className="grid gap-4">
      <FontSchemeSettingsPanel {...props} />
      <LayoutSettingsPanel {...props} />
      <VisualSettingsPanel {...props} />
    </div>
  );
}

export function FontSchemeSettingsPanel({ style, onStyleChange, onFontSchemePreviewChange, t }: StylePanelProps) {
  return (
    <Section
      title={t("step.fontScheme")}
      description={t("fontSchemeDescription")}
      variant="plain"
      className="border-t-0 pt-0"
    >
      <FontSchemePanel
        style={style}
        onStyleChange={onStyleChange}
        onPreviewSchemeChange={onFontSchemePreviewChange}
        showHeader={false}
        t={t}
      />
    </Section>
  );
}

function CustomFontPanel({ style, onStyleChange, t }: StylePanelProps) {
  const desktopApi = getLyricsCardDesktopApi();
  const [fonts, setFonts] = useState<SystemFontOption[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fontMayFallback, setFontMayFallback] = useState(false);
  const selectedFont = sanitizeCssFontFamilyName(style.customFontFamily);
  const selectedWeight = style.customFontWeight ?? 400;
  const selectedStyle = style.customFontStyle ?? "normal";
  const customFontActive = !style.fontScheme && Boolean(style.customFontEnabled && selectedFont);
  const selectedOption = fonts.find(
    (font) => font.family === selectedFont && font.fontWeight === selectedWeight && font.fontStyle === selectedStyle
  );
  const selectedLabel = style.customFontLabel || selectedOption?.label || selectedFont;
  const filteredFonts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return fonts;
    }

    return fonts.filter((font) => `${font.label} ${font.family}`.toLowerCase().includes(query));
  }, [fonts, search]);

  function setCustomFontEnabled(enabled: boolean) {
    if (!enabled) {
      onStyleChange({
        ...style,
        fontScheme: undefined,
        customFontEnabled: false
      });
      setFontMayFallback(false);
      return;
    }

    const nextFont = selectedFont
      ? {
          label: selectedLabel || selectedFont,
          family: selectedFont,
          fontWeight: selectedWeight,
          fontStyle: selectedStyle
        }
      : fonts[0];
    if (!nextFont?.family) {
      setStatus(t("customFontChooseFirst"));
      return;
    }

    onStyleChange({
      ...style,
      fontScheme: undefined,
      customFontFamily: nextFont.family,
      customFontLabel: nextFont.label,
      customFontWeight: nextFont.fontWeight,
      customFontStyle: nextFont.fontStyle,
      customFontEnabled: true
    });
    setStatus("");
  }

  function selectCustomFont(font: SystemFontOption) {
    const nextFamily = sanitizeCssFontFamilyName(font.family);
    if (!nextFamily) {
      return;
    }

    onStyleChange({
      ...style,
      fontScheme: undefined,
      customFontFamily: nextFamily,
      customFontLabel: font.label,
      customFontWeight: font.fontWeight,
      customFontStyle: font.fontStyle,
      customFontEnabled: true
    });
    setStatus("");
  }

  useEffect(() => {
    let active = true;

    if (!desktopApi) {
      setFonts([]);
      setStatus(t("systemFontDesktopOnly"));
      return;
    }

    setStatus(t("systemFontLoading"));
    desktopApi
      .listSystemFonts()
      .then((nextFonts) => {
        if (!active) {
          return;
        }

        setFonts(nextFonts);
        setStatus(nextFonts.length > 0 ? "" : t("systemFontEmpty"));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setStatus(error instanceof Error ? error.message : t("systemFontFailed"));
      });

    return () => {
      active = false;
    };
  }, [desktopApi, t]);

  useEffect(() => {
    if (!customFontActive) {
      setFontMayFallback(false);
      return;
    }

    setFontMayFallback(!canBrowserUseFont(selectedFont, selectedWeight, selectedStyle));
  }, [customFontActive, selectedFont, selectedStyle, selectedWeight]);

  useEffect(() => {
    if (!style.customFontEnabled || style.fontScheme || !selectedFont || fonts.length === 0) {
      return;
    }

    const matchingFont =
      fonts.find(
        (font) =>
          font.family === selectedFont && font.fontWeight === selectedWeight && font.fontStyle === selectedStyle
      ) ?? fonts.find((font) => font.label === selectedFont || font.family === selectedFont);

    if (
      !matchingFont ||
      (style.customFontFamily === matchingFont.family &&
        style.customFontLabel === matchingFont.label &&
        selectedWeight === matchingFont.fontWeight &&
        selectedStyle === matchingFont.fontStyle)
    ) {
      return;
    }

    onStyleChange({
      ...style,
      fontScheme: undefined,
      customFontFamily: matchingFont.family,
      customFontLabel: matchingFont.label,
      customFontWeight: matchingFont.fontWeight,
      customFontStyle: matchingFont.fontStyle
    });
  }, [fonts, onStyleChange, selectedFont, selectedStyle, selectedWeight, style]);

  return (
    <div className="grid gap-4 rounded-xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <p className="app-text-primary text-sm font-semibold">{t("customFont")}</p>
          {customFontActive ? (
            <p className="app-text-subtle text-xs">
              {t("customFontActive")}: {selectedLabel}
            </p>
          ) : null}
        </div>
        <div className="w-full sm:max-w-xs">
          <ToggleRow label={t("enableCustomFont")} checked={customFontActive} onChange={setCustomFontEnabled} size="sm" />
        </div>
      </div>

      <FieldLabel label={t("fontSearch")} disabled={!desktopApi || fonts.length === 0}>
        <TextInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("fontSearchPlaceholder")}
          disabled={!desktopApi || fonts.length === 0}
        />
      </FieldLabel>

      {desktopApi && fonts.length > 0 ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="app-text-primary font-medium">{t("systemFonts")}</span>
            <span className="app-text-subtle text-xs">
              {t("customFontResultCount", { shown: filteredFonts.length, total: fonts.length })}
            </span>
          </div>
          {filteredFonts.length > 0 ? (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[rgb(var(--panel-border))] p-1" role="listbox">
              {filteredFonts.map((font) => {
                const active =
                  customFontActive &&
                  selectedFont === font.family &&
                  selectedWeight === font.fontWeight &&
                  selectedStyle === font.fontStyle;
                return (
                  <button
                    key={`${font.label}-${font.family}-${font.fontWeight}-${font.fontStyle}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => selectCustomFont(font)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      active
                        ? "border-[var(--app-accent)] bg-[rgb(var(--button-bg-hover))] app-text-primary"
                        : "border-transparent app-text-muted hover:border-[rgb(var(--panel-border))] hover:bg-[rgb(var(--button-bg-hover))]"
                    }`}
                    style={{
                      fontFamily: `${quoteSingleFontFamily(font.family)}, system-ui, sans-serif`,
                      fontWeight: font.fontWeight,
                      fontStyle: font.fontStyle
                    }}
                  >
                    <span className="block">{font.label}</span>
                    {font.label !== font.family ? (
                      <span className="app-text-subtle block text-xs">{font.family}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="app-text-subtle rounded-lg border border-[rgb(var(--panel-border))] p-3 text-sm">
              {t("customFontNoResults")}
            </p>
          )}
        </div>
      ) : null}

      {status ? <p className="app-text-subtle text-sm">{status}</p> : null}
      {fontMayFallback && customFontActive ? (
        <p className="text-sm text-amber-300" role="status">
          {t("customFontMayFallback")}
        </p>
      ) : null}
    </div>
  );
}

export function LayoutSettingsPanel({ style, onStyleChange, t }: StylePanelProps) {
  const isInstrumental = style.contentMode === "instrumental";
  const layoutMode = isInstrumental ? "portrait" : style.layoutMode ?? "portrait";
  const instrumentalLayoutLockedHint = t("instrumentalLayoutLockedHint");

  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  function updateContentMode(contentMode: ContentMode) {
    if (contentMode === "instrumental") {
      const squareSize = PRESET_CARD_SIZES["1:1"];
      onStyleChange({
        ...style,
        contentMode: "instrumental",
        layoutMode: "portrait",
        ratio: "1:1",
        width: squareSize.width,
        height: squareSize.height,
        autoHeight: true,
        translationEnabled: false,
        translationText: "",
        frameVariant: style.frameStyleEnabled && style.frameVariant !== "fullBleed" ? "auto" : style.frameVariant
      });
      return;
    }

    onStyleChange({
      ...style,
      contentMode: "lyrics"
    });
  }

  function updateRatio(ratio: CardRatio) {
    if (style.contentMode === "instrumental") {
      const squareSize = PRESET_CARD_SIZES["1:1"];
      onStyleChange({
        ...style,
        layoutMode: "portrait",
        ratio: "1:1",
        width: squareSize.width,
        height: squareSize.height,
        autoHeight: false
      });
      return;
    }

    if (ratio === "custom") {
      onStyleChange({ ...style, ratio, width: style.width || 1080, height: style.height || 1480, autoHeight: true });
      return;
    }

    const preset = PRESET_CARD_SIZES[ratio];
    onStyleChange({ ...style, ratio, width: preset.width, height: preset.height, autoHeight: false });
  }

  function updateLayoutMode(layoutMode: CardLayoutMode) {
    if (style.contentMode === "instrumental" && layoutMode === "landscape") {
      return;
    }

    if (layoutMode === (style.layoutMode ?? "portrait")) {
      return;
    }

    onStyleChange({
      ...style,
      layoutMode,
      frameVariant: style.frameStyleEnabled && style.frameVariant !== "fullBleed" ? "auto" : style.frameVariant
    });
  }

  return (
    <Section title={t("layout")} eyebrow={t("style")} variant="plain" contentClassName="gap-0">
      <SettingRow label={t("contentType")}>
        <SelectField value={style.contentMode} onChange={(event) => updateContentMode(event.target.value as ContentMode)}>
          <option value="lyrics">{t("lyricsMode")}</option>
          <option value="instrumental">{t("instrumentalMode")}</option>
        </SelectField>
      </SettingRow>

      <SettingRow label={t("layoutMode")} description={isInstrumental ? instrumentalLayoutLockedHint : undefined}>
        <SegmentedControl
          value={layoutMode}
          onValueChange={(value) => updateLayoutMode(value as CardLayoutMode)}
          options={[
            { value: "portrait", label: t("portraitLayout") },
            {
              value: "landscape",
              label: t("landscapeLayout"),
              disabled: isInstrumental,
              title: isInstrumental ? instrumentalLayoutLockedHint : undefined
            }
          ]}
          aria-label={t("layoutMode")}
        />
      </SettingRow>

      <SettingRow label={t("sizeMode")} description={isInstrumental ? t("instrumentalSizeLockedHint") : undefined}>
        <SelectField
          value={isInstrumental ? "1:1" : style.ratio}
          disabled={isInstrumental}
          onChange={(event) => updateRatio(event.target.value as CardRatio)}
        >
          {layoutMode === "landscape" ? (
            <>
              <option value="16:9">{t("sixteenNine")}</option>
              <option value="21:9">{t("twentyOneNine")}</option>
              <option value="3:2">{t("threeTwo")}</option>
            </>
          ) : (
            <>
              <option value="1:1">{t("square")}</option>
              <option value="4:5">{t("social")}</option>
              <option value="9:16">{t("story")}</option>
            </>
          )}
          <option value="custom">{t("custom")}</option>
        </SelectField>
      </SettingRow>

      {!isInstrumental && style.ratio === "custom" ? (
        <div className="my-3 grid gap-4 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
          <div className="app-text-subtle flex items-center justify-between gap-3 text-sm">
            <span>{t("customCanvas")}</span>
            <span className="app-text-primary font-semibold">
              {style.width} x {style.height}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label={t("width")} hint={`${style.width}px`}>
              <TextInput
                type="range"
                min={layoutMode === "landscape" ? 1080 : 720}
                max={layoutMode === "landscape" ? 3000 : 1440}
                step={20}
                value={style.width}
                onChange={(event) => update("width", Number(event.target.value))}
              />
            </FieldLabel>
            <FieldLabel label={t("height")} hint={style.autoHeight ? t("auto") : `${style.height}px`}>
              <TextInput
                type="range"
                min={720}
                max={layoutMode === "landscape" ? 1600 : 3200}
                step={20}
                value={style.height}
                disabled={style.autoHeight}
                onChange={(event) => update("height", Number(event.target.value))}
              />
            </FieldLabel>
          </div>
          <ToggleRow label={t("autoHeight")} checked={style.autoHeight} onChange={(checked) => update("autoHeight", checked)} />
        </div>
      ) : null}

      {style.contentMode === "lyrics" ? (
        <>
          <SettingRow label={t("fontSize")} description={`${style.lyricFontSize}px`}>
            <TextInput
              type="range"
              min={36}
              max={72}
              value={style.lyricFontSize}
              onChange={(event) => update("lyricFontSize", Number(event.target.value))}
            />
          </SettingRow>
          <SettingRow label={t("lineHeight")} description={style.lineHeight.toFixed(2)}>
            <TextInput
              type="range"
              min={1.1}
              max={1.75}
              step={0.05}
              value={style.lineHeight}
              onChange={(event) => update("lineHeight", Number(event.target.value))}
            />
          </SettingRow>
          <SettingRow label={t("alignment")}>
            <SelectField value={style.align} onChange={(event) => update("align", event.target.value as CardAlign)}>
              <option value="left">{t("left")}</option>
              <option value="center">{t("center")}</option>
            </SelectField>
          </SettingRow>
        </>
      ) : null}

      {style.contentMode === "lyrics" && style.translationEnabled ? (
        <SettingRow label={t("translationScale")} description={style.translationScale.toFixed(2)}>
          <TextInput
            type="range"
            min={0.6}
            max={0.9}
            step={0.01}
            value={style.translationScale}
            onChange={(event) => update("translationScale", Number(event.target.value))}
          />
        </SettingRow>
      ) : null}

      {style.contentMode === "lyrics" && layoutMode === "landscape" ? (
        <div className="my-3 grid gap-3 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
          <p className="app-text-primary text-sm font-semibold">{t("landscapeLayoutSettings")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label={t("landscapeCoverSize")} hint="auto">
              <TextInput value="520px base" readOnly />
            </FieldLabel>
            <FieldLabel label={t("landscapeContentWidth")} hint="auto">
              <TextInput value="920px base" readOnly />
            </FieldLabel>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

export function VisualSettingsPanel({ style, onStyleChange, t }: StylePanelProps) {
  const frameVisible = style.frameStyleEnabled && style.frameVariant !== "fullBleed";

  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  function updateFrameVisibility(enabled: boolean) {
    onStyleChange({
      ...style,
      frameStyleEnabled: enabled,
      frameVariant: enabled ? "auto" : "fullBleed",
      showFrame: enabled,
      showShadow: enabled
    });
  }

  function updateGeneratedWatermark(enabled: boolean) {
    onStyleChange({ ...style, showGeneratedWatermark: enabled, showWatermark: enabled });
  }

  return (
    <div className="grid gap-5">
      <Section title={t("textColor")} variant="plain" contentClassName="gap-0">
        <ColorControls style={style} onStyleChange={onStyleChange} t={t} />
      </Section>

      <Section title={t("background")} variant="plain" contentClassName="gap-0">
        <SettingRow label={t("coverCrop")} description={style.coverCropScale.toFixed(2)}>
          <TextInput
            type="range"
            min={1}
            max={2}
            step={0.01}
            value={style.coverCropScale}
            onChange={(event) => update("coverCropScale", Number(event.target.value))}
          />
        </SettingRow>

        <ToggleRow
          label={t("backgroundGrid")}
          checked={style.showFineGrid === true}
          onChange={(checked) => update("showFineGrid", checked)}
        />
        {style.showFineGrid === true ? (
          <SettingRow label={t("backgroundGridDensity")}>
            <SegmentedControl
              value={(style.fineGridDensity ?? "medium") as "sparse" | "medium" | "dense"}
              onValueChange={(value) => update("fineGridDensity", value)}
              options={[
                { value: "sparse", label: t("gridSparse") },
                { value: "medium", label: t("gridMedium") },
                { value: "dense", label: t("gridDense") }
              ]}
              aria-label={t("backgroundGridDensity")}
            />
          </SettingRow>
        ) : null}
      </Section>

      <Section title={t("step.visual")} variant="plain" contentClassName="gap-0">
        <ToggleRow label={t("cover")} checked={style.showCover} onChange={(checked) => update("showCover", checked)} />
        <ToggleRow label={t("showSongInfo")} checked={style.showSongInfo} onChange={(checked) => update("showSongInfo", checked)} />
        <ToggleRow label={t("showAlbumName")} checked={style.showAlbumName} onChange={(checked) => update("showAlbumName", checked)} />
        <ToggleRow label={t("allowTwoLineTitle")} checked={style.allowTwoLineTitle} onChange={(checked) => update("allowTwoLineTitle", checked)} />
        <ToggleRow label={t("showGeneratedWatermark")} checked={style.showGeneratedWatermark} onChange={updateGeneratedWatermark} />
        <ToggleRow
          label={t("showPlatformLogo")}
          checked={style.showPlatformBadge}
          onChange={(checked) => update("showPlatformBadge", checked)}
        />
        <ToggleRow label={t("showSharedBy")} checked={style.showSharedBy} onChange={(checked) => update("showSharedBy", checked)} />

        <SettingRow label={t("showFrame")}>
          <SegmentedControl
            value={frameVisible ? "frame" : "fullBleed"}
            onValueChange={(value) => updateFrameVisibility(value === "frame")}
            options={[
              { value: "frame", label: t("frameAndShadow") },
              { value: "fullBleed", label: t("fullBleed") }
            ]}
            aria-label={t("showFrame")}
          />
        </SettingRow>

        {style.showSharedBy ? (
          <SettingRow label={t("sharedBy")}>
            <TextInput
              value={style.sharedByText}
              onChange={(event) => update("sharedByText", event.target.value)}
              placeholder={t("sharedByPlaceholder")}
            />
          </SettingRow>
        ) : null}
      </Section>
    </div>
  );
}

