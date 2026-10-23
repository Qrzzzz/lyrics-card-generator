"use client";

import { PrecisionSlider } from "@/components/ui/PrecisionSlider";
import { productivityCopy } from "@/lib/editor-productivity-copy";
import { FontSchemePanel } from "@/components/editor/font-scheme/FontSchemePanel";
import { ColorControls } from "@/components/editor/style-panel/ColorControls";
import {
  SegmentedControl,
  TextInput
} from "@/components/ui/controls";
import { SettingsLayout, SettingsGrid, SettingsGroup, SettingsField, SettingsToggle } from "@/components/editor/style-panel/SettingsLayout";
import { BackgroundControls } from "./style-panel/BackgroundControls";
import { AUTO_HEIGHT_MIN, PRESET_CARD_SIZES } from "@/lib/card-size";
import {
  LANDSCAPE_LYRICS_WIDTH_MAX,
  LANDSCAPE_LYRICS_WIDTH_MIN,
  LANDSCAPE_REQUESTED_HEIGHT_MAX,
  LANDSCAPE_REQUESTED_HEIGHT_MIN,
  normalizeLandscapeLayoutSettings
} from "@/lib/landscape-plan";
import type { createT } from "@/lib/i18n";
import { separatorCopy } from "@/lib/lyric-separator-copy";
import {
  LYRIC_LINE_HEIGHT_MAX,
  LYRIC_LINE_HEIGHT_MIN,
  LYRIC_LINE_HEIGHT_STEP
} from "@/lib/lyric-typography";
import type {
  CardAlign,
  CardLayoutMode,
  CardRatio,
  CardStyle,
  ContentMode,
  FontScheme,
  Locale,
  SongInfo
} from "@/lib/types";

type StylePanelProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  song?: SongInfo;
  onSongChange?: (song: SongInfo) => void;
  onFontSchemePreviewChange?: (scheme: FontScheme | null) => void;
  onFontSchemeEditingChange?: (editing: boolean) => void;
  locale: Locale;
  t: ReturnType<typeof createT>;
};

export function FontSchemeSettingsPanel({
  style,
  onStyleChange,
  onFontSchemePreviewChange,
  onFontSchemeEditingChange,
  locale,
  t
}: StylePanelProps) {
  return (
    <SettingsLayout>
      <TypographySettings style={style} onStyleChange={onStyleChange} locale={locale} t={t} />
      <SettingsGroup title={t("fontSchemeTitle")}>
        <p className="app-text-subtle text-xs leading-5">{t("fontSchemeDescription")}</p>
        <FontSchemePanel
          style={style}
          onStyleChange={onStyleChange}
          onPreviewSchemeChange={onFontSchemePreviewChange}
          onEditingChange={onFontSchemeEditingChange}
          showHeader={false}
          locale={locale}
          t={t}
        />
      </SettingsGroup>
      <SettingsGroup title={t("textColor")} className="editor-choice-group">
        <ColorControls style={style} onStyleChange={onStyleChange} t={t} />
      </SettingsGroup>
    </SettingsLayout>
  );
}

export function LayoutSettingsPanel({ style, onStyleChange, locale, t }: StylePanelProps) {
  const isInstrumental = style.contentMode === "instrumental";
  const layoutMode = isInstrumental ? "portrait" : style.layoutMode ?? "portrait";
  const instrumentalLayoutLockedHint = t("instrumentalLayoutLockedHint");
  const sizeModeOptions = [
    { value: "1:1", label: t("square") },
    { value: "custom", label: t("custom") }
  ];
  const landscapeSettings = normalizeLandscapeLayoutSettings(style.landscapeLayout);

  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  function updateContentMode(contentMode: ContentMode) {
    if (contentMode === "instrumental") {
      // Instrumental rendering owns a fixed square portrait geometry and has no translation column.
      const squareSize = PRESET_CARD_SIZES["1:1"];
      onStyleChange({
        ...style,
        contentMode: "instrumental",
        layoutMode: "portrait",
        ratio: "1:1",
        width: squareSize.width,
        height: squareSize.height,
        autoWidth: false,
        autoHeight: false,
        translationEnabled: false
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
        autoWidth: false,
        autoHeight: false
      });
      return;
    }

    if (ratio === "custom") {
      onStyleChange({ ...style, ratio, width: style.width || 1080, height: style.height || 1480, autoWidth: false, autoHeight: true });
      return;
    }

    // A preset atomically owns dimensions and disables both automatic sizing modes.
    const preset = PRESET_CARD_SIZES[ratio];
    onStyleChange({ ...style, ratio, width: preset.width, height: preset.height, autoWidth: false, autoHeight: false });
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
      layoutMode
    });
  }

  function updateAutoHeight(autoHeight: boolean) {
    onStyleChange({
      ...style,
      autoHeight,
      height: autoHeight ? style.height : Math.max(style.height, 720)
    });
  }

  function updateAutoWidth(autoWidth: boolean) {
    onStyleChange({
      ...style,
      autoWidth
    });
  }

  function updateLandscape<K extends keyof typeof landscapeSettings>(key: K, value: (typeof landscapeSettings)[K]) {
    onStyleChange({
      ...style,
      landscapeLayout: { ...landscapeSettings, [key]: value },
      landscapePlan: undefined
    });
  }

  return (
    <SettingsLayout>
      <div data-setting-target="background"><BackgroundControls style={style} onStyleChange={onStyleChange} locale={locale} /></div>
      <SettingsGroup title={t("settings.canvas")}>
        <SettingsGrid data-testid="layout-settings-grid">
          <SettingsField label={t("contentType")}>
            <SegmentedControl<ContentMode>
              orientation="horizontal"
              value={style.contentMode}
              onChange={updateContentMode}
              options={[
                { value: "lyrics", label: t("lyricsMode") },
                { value: "instrumental", label: t("instrumentalMode") }
              ]}
              aria-label={t("contentType")}
            />
          </SettingsField>
          <SettingsField label={t("layoutMode")} description={isInstrumental ? instrumentalLayoutLockedHint : undefined}>
            <SegmentedControl
              orientation="horizontal"
              value={layoutMode}
              onValueChange={(value) => updateLayoutMode(value as CardLayoutMode)}
              options={[
                { value: "portrait", label: t("portraitLayout") },
                { value: "landscape", label: t("landscapeLayout"), disabled: isInstrumental, title: isInstrumental ? instrumentalLayoutLockedHint : undefined }
              ]}
              aria-label={t("layoutMode")}
            />
          </SettingsField>
          {layoutMode === "portrait" ? (
            <SettingsField label={t("sizeMode")} description={isInstrumental ? t("instrumentalSizeLockedHint") : undefined}>
              <SegmentedControl<CardRatio>
                aria-label={t("sizeMode")}
                value={isInstrumental ? "1:1" : style.ratio}
                onChange={updateRatio}
                options={sizeModeOptions.map((option) => ({ ...option, value: option.value as CardRatio, disabled: isInstrumental }))}
              />
            </SettingsField>
          ) : null}
        </SettingsGrid>
      </SettingsGroup>

      {!isInstrumental && layoutMode === "portrait" && style.ratio === "custom" ? (
        <SettingsGroup title={t("customCanvas")} summary={`${style.width} × ${style.height}`}>
          <SettingsGrid>
            <SettingsToggle label={t("autoWidth")} checked={style.autoWidth === true} onChange={updateAutoWidth}>
              <SettingsField label={t("width")} value={style.autoWidth ? `${t("auto")} · ${style.width}px` : `${style.width}px`}>
                <PrecisionSlider locale={locale} settingId="width" resetValue={1040} unit="px" aria-label={t("width")} min={720} max={1440} step={1}
                  value={style.width} disabled={style.autoWidth}
                  onValueChange={(value) => update("width", value)} />
              </SettingsField>
            </SettingsToggle>
            <SettingsToggle label={t("autoHeight")} checked={style.autoHeight} onChange={updateAutoHeight}>
              <SettingsField label={t("height")} value={style.autoHeight ? t("auto") : `${style.height}px`}>
                <PrecisionSlider locale={locale} settingId="height" resetValue={1080} unit="px" aria-label={t("height")} min={style.autoHeight ? AUTO_HEIGHT_MIN : 720} max={3200} step={1}
                  value={style.height} disabled={style.autoHeight}
                  onValueChange={(value) => update("height", value)} />
              </SettingsField>
            </SettingsToggle>
          </SettingsGrid>
        </SettingsGroup>
      ) : null}

      {!isInstrumental && layoutMode === "landscape" ? (
        <SettingsGroup title={t("landscapeLayoutSettings")}
          summary={style.landscapePlan ? `${style.landscapePlan.canvas.width} × ${style.landscapePlan.canvas.height}` : t("auto")}>
          <SettingsGrid>
            <SettingsToggle label={t("autoWidth")} checked={landscapeSettings.autoLyricsWidth}
              onChange={(checked) => updateLandscape("autoLyricsWidth", checked)}>
              {!landscapeSettings.autoLyricsWidth ? (
                <SettingsField label={t("landscapeLyricsWidth")} value={`${landscapeSettings.lyricsWidth}px`}>
                  <PrecisionSlider locale={locale} settingId="landscapeLyricsWidth" resetValue={880} unit="px" aria-label={t("landscapeLyricsWidth")} min={LANDSCAPE_LYRICS_WIDTH_MIN} max={LANDSCAPE_LYRICS_WIDTH_MAX} step={1}
                    value={landscapeSettings.lyricsWidth}
                    onValueChange={(value) => updateLandscape("lyricsWidth", value)} />
                </SettingsField>
              ) : null}
            </SettingsToggle>
            <SettingsToggle label={t("autoHeight")} checked={landscapeSettings.autoHeight}
              onChange={(checked) => updateLandscape("autoHeight", checked)}>
              {!landscapeSettings.autoHeight ? (
                <SettingsField label={t("landscapeRequestedHeight")} value={`${landscapeSettings.requestedHeight}px`}>
                  <PrecisionSlider locale={locale} settingId="landscapeRequestedHeight" resetValue={1080} unit="px" aria-label={t("landscapeRequestedHeight")} min={LANDSCAPE_REQUESTED_HEIGHT_MIN} max={LANDSCAPE_REQUESTED_HEIGHT_MAX} step={1}
                    value={landscapeSettings.requestedHeight}
                    onValueChange={(value) => updateLandscape("requestedHeight", value)} />
                </SettingsField>
              ) : null}
            </SettingsToggle>
          </SettingsGrid>
        </SettingsGroup>
      ) : null}

      <BackgroundGridSettings style={style} onStyleChange={onStyleChange} locale={locale} t={t} />
    </SettingsLayout>
  );
}

export function TypographySettings({ style, onStyleChange, locale, t }: StylePanelProps) {
  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) { onStyleChange({ ...style, [key]: value }); }
  return <>
      {style.contentMode === "lyrics" ? (
        <SettingsGroup title={t("settings.typography")}>
          <SettingsGrid>
            <SettingsField label={t("fontSize")} value={`${style.lyricFontSize}px`}>
              <PrecisionSlider locale={locale} settingId="fontSize" resetValue={60} unit="px" aria-label={t("fontSize")} min={36} max={72} value={style.lyricFontSize}
                onValueChange={(value) => update("lyricFontSize", value)} />
            </SettingsField>
            <SettingsField label={t("lineHeight")} value={style.lineHeight.toFixed(2)} description={t("lineHeightDescription")}>
              <PrecisionSlider locale={locale} settingId="lineHeight" resetValue={1.8} aria-label={t("lineHeight")} min={LYRIC_LINE_HEIGHT_MIN} max={LYRIC_LINE_HEIGHT_MAX} step={LYRIC_LINE_HEIGHT_STEP}
                value={style.lineHeight} onValueChange={(value) => update("lineHeight", value)} />
            </SettingsField>
            <SettingsField label={t("alignment")}>
              <SegmentedControl<CardAlign> aria-label={t("alignment")} value={style.align}
                onChange={(value) => update("align", value)}
                options={[{ value: "left", label: t("left") }, { value: "center", label: t("center") }]} />
            </SettingsField>
            {style.translationEnabled ? (
              <SettingsField label={t("translationScale")} value={style.translationScale.toFixed(2)}>
                <PrecisionSlider locale={locale} settingId="translationScale" resetValue={0.75} aria-label={t("translationScale")} min={0.6} max={0.9} step={0.01}
                  value={style.translationScale} onValueChange={(value) => update("translationScale", value)} />
              </SettingsField>
            ) : null}
          </SettingsGrid>
          {style.contentMode === "lyrics" ? (
            <SettingsField label={separatorCopy[locale].label} description={separatorCopy[locale].hint}>
                <SegmentedControl data-testid="separator-style-settings" value={style.separatorStyle ?? "dot"}
                  onValueChange={(value) => update("separatorStyle", value)}
                  options={[
                    { value: "dot", label: `·  ${separatorCopy[locale].dot}` },
                    { value: "line", label: `—  ${separatorCopy[locale].line}` }
                  ]}
                  aria-label={separatorCopy[locale].label} />
              <button type="button" className="app-button control-focus rounded px-2 py-1 text-xs"
                onClick={() => window.dispatchEvent(new CustomEvent("lyrics-card:navigate", { detail: { step: 1, toolId: "separator" } }))}>
                {productivityCopy[locale].separatorInsert}
              </button>
            </SettingsField>
          ) : null}
        </SettingsGroup>
      ) : null}
  </>;
}

function BackgroundGridSettings({ style, onStyleChange, t }: StylePanelProps) {
  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) { onStyleChange({ ...style, [key]: value }); }
  return <SettingsGroup title={t("settings.backgroundDetails")}><SettingsGrid>
          <SettingsToggle label={t("backgroundGrid")} checked={style.showFineGrid === true}
            onChange={(checked) => update("showFineGrid", checked)}>
            {style.showFineGrid === true ? (
              <SettingsField label={t("backgroundGridDensity")}>
                <SegmentedControl value={(style.fineGridDensity ?? "medium") as "sparse" | "medium" | "dense"}
                  onValueChange={(value) => update("fineGridDensity", value)}
                  options={[
                    { value: "sparse", label: t("gridSparse") },
                    { value: "medium", label: t("gridMedium") },
                    { value: "dense", label: t("gridDense") }
                  ]}
                  aria-label={t("backgroundGridDensity")} />
              </SettingsField>
            ) : null}
          </SettingsToggle>
  </SettingsGrid></SettingsGroup>;
}

export function VisualSettingsPanel({
  style,
  onStyleChange,
  song,
  onSongChange,
  t
}: StylePanelProps) {
  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  function updateProjectSignature(enabled: boolean) {
    // Preserve the legacy watermark field while the newer renderer reads the explicit field.
    onStyleChange({ ...style, showGeneratedWatermark: enabled, showWatermark: enabled });
  }

  function updateExplicitBadge(enabled: boolean) {
    if (!song || !onSongChange) {
      return;
    }

    onSongChange({ ...song, explicit: enabled });
  }

  return (
    <SettingsLayout>
      <SettingsGroup title={t("settings.visibleContent")}>
        <SettingsGrid data-testid="visual-toggle-grid">
          {(style.layoutMode ?? "portrait") === "portrait" ? (
            <SettingsToggle label={t("cover")} checked={style.showCover} onChange={(checked) => update("showCover", checked)} />
          ) : null}
          <SettingsToggle label={t("explicitBadge")} checked={song?.explicit === true} onChange={updateExplicitBadge} />
          <SettingsToggle label={t("showAlbumName")} checked={style.showAlbumName} onChange={(checked) => update("showAlbumName", checked)} />
          {(style.layoutMode ?? "portrait") === "portrait" ? (
            <SettingsToggle label={t("allowMultiLineTitle")} checked={style.allowMultiLineTitle} onChange={(checked) => update("allowMultiLineTitle", checked)} />
          ) : null}
          <SettingsToggle label={t("showGeneratedWatermark")} checked={style.showGeneratedWatermark} onChange={updateProjectSignature} />
          <SettingsToggle label={t("showSharedBy")} checked={style.showSharedBy} onChange={(checked) => update("showSharedBy", checked)}>
            {style.showSharedBy ? (
              <SettingsField label={t("sharedBy")}>
                <TextInput aria-label={t("sharedBy")} value={style.sharedByText}
                  onChange={(event) => update("sharedByText", event.target.value)} placeholder={t("sharedByPlaceholder")} />
              </SettingsField>
            ) : null}
          </SettingsToggle>
        </SettingsGrid>
      </SettingsGroup>
    </SettingsLayout>
  );
}
