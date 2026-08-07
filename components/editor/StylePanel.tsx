"use client";

import { FontSchemePanel } from "@/components/editor/font-scheme/FontSchemePanel";
import { ColorControls } from "@/components/editor/style-panel/ColorControls";
import {
  AdaptiveSettingsGrid,
  FieldLabel,
  RangeSlider,
  Section,
  SegmentedControl,
  SettingRow,
  TextInput,
  ToggleRow
} from "@/components/ui/controls";
import { AUTO_HEIGHT_MIN, PRESET_CARD_SIZES } from "@/lib/card-size";
import type { createT } from "@/lib/i18n";
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
  SongInfo
} from "@/lib/types";

type StylePanelProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  song?: SongInfo;
  onSongChange?: (song: SongInfo) => void;
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
    <div className="grid gap-5">
      <Section
        title={t("fontSchemeTitle")}
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

      <Section title={t("textColor")} variant="plain" contentClassName="gap-0">
        <ColorControls style={style} onStyleChange={onStyleChange} t={t} />
      </Section>
    </div>
  );
}

export function LayoutSettingsPanel({ style, onStyleChange, t }: StylePanelProps) {
  const isInstrumental = style.contentMode === "instrumental";
  const layoutMode = isInstrumental ? "portrait" : style.layoutMode ?? "portrait";
  const instrumentalLayoutLockedHint = t("instrumentalLayoutLockedHint");
  const [instrumentalModeTitle, instrumentalModeQualifier] = t("instrumentalMode").split(/\s*\/\s*/, 2);
  const sizeModeOptions =
    layoutMode === "landscape"
      ? [
          { value: "16:9", label: t("sixteenNine") },
          { value: "21:9", label: t("twentyOneNine") },
          { value: "3:2", label: t("threeTwo") },
          { value: "custom", label: t("custom") }
        ]
      : [
          { value: "1:1", label: t("square") },
          { value: "custom", label: t("custom") }
        ];

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
        translationEnabled: false,
        translationText: ""
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

  return (
    <Section title={t("layout")} eyebrow={t("style")} variant="plain" contentClassName="gap-0">
      <AdaptiveSettingsGrid kind="rows" data-testid="layout-settings-grid">
      <SettingRow label={t("contentType")}>
        <SegmentedControl<ContentMode>
          value={style.contentMode}
          onChange={updateContentMode}
          options={[
            { value: "lyrics", label: t("lyricsMode") },
            {
              value: "instrumental",
              title: t("instrumentalMode"),
              label: (
                <span className="flex flex-col items-center justify-center leading-tight">
                  <span className="whitespace-nowrap">{instrumentalModeTitle}</span>
                  {instrumentalModeQualifier ? (
                    <span className="whitespace-nowrap text-[10px] font-medium opacity-70">
                      {instrumentalModeQualifier}
                    </span>
                  ) : null}
                </span>
              )
            }
          ]}
          aria-label={t("contentType")}
          size="sm"
          className="w-full max-w-[280px] justify-self-end [&_.segmented-control__item]:px-2 [&_.segmented-control__item]:text-[13px]"
        />
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
        <SegmentedControl<CardRatio>
          aria-label={t("sizeMode")}
          value={isInstrumental ? "1:1" : style.ratio}
          onChange={updateRatio}
          columns={layoutMode === "landscape" ? 4 : 2}
          size="sm"
          options={sizeModeOptions.map((option) => ({ ...option, disabled: isInstrumental })) as Array<{
            value: CardRatio;
            label: string;
            disabled: boolean;
          }>}
        />
      </SettingRow>

      {!isInstrumental && style.ratio === "custom" ? (
        <div className="settings-adaptive-span-all my-3 grid gap-4 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
          <div className="app-text-subtle flex items-center justify-between gap-3 text-sm">
            <span>{t("customCanvas")}</span>
            <span className="app-text-primary font-semibold">
              {style.width} x {style.height}
            </span>
          </div>
          <AdaptiveSettingsGrid kind="pairs" className="gap-4">
            <FieldLabel label={t("width")} hint={style.autoWidth ? `${t("auto")} · ${style.width}px` : `${style.width}px`}>
              <RangeSlider
                aria-label={t("width")}
                min={layoutMode === "landscape" ? 1080 : 720}
                max={layoutMode === "landscape" ? 3000 : 1440}
                step={20}
                value={style.width}
                disabled={style.autoWidth}
                onChange={(event) => update("width", Number(event.target.value))}
              />
            </FieldLabel>
            <FieldLabel label={t("height")} hint={style.autoHeight ? t("auto") : `${style.height}px`}>
              <RangeSlider
                aria-label={t("height")}
                min={style.autoHeight ? AUTO_HEIGHT_MIN : 720}
                max={layoutMode === "landscape" ? 1600 : 3200}
                step={20}
                value={style.height}
                disabled={style.autoHeight}
                onChange={(event) => update("height", Number(event.target.value))}
              />
            </FieldLabel>
          </AdaptiveSettingsGrid>
          {layoutMode === "portrait" && style.contentMode === "lyrics" ? (
            <ToggleRow label={t("autoWidth")} checked={style.autoWidth === true} onChange={updateAutoWidth} />
          ) : null}
          <ToggleRow label={t("autoHeight")} checked={style.autoHeight} onChange={updateAutoHeight} />
        </div>
      ) : null}

      {style.contentMode === "lyrics" ? (
        <>
          <SettingRow label={t("fontSize")} description={`${style.lyricFontSize}px`}>
            <RangeSlider
              aria-label={t("fontSize")}
              min={36}
              max={72}
              value={style.lyricFontSize}
              onChange={(event) => update("lyricFontSize", Number(event.target.value))}
            />
          </SettingRow>
          <SettingRow label={t("lineHeight")} description={style.lineHeight.toFixed(2)}>
            <RangeSlider
              aria-label={t("lineHeight")}
              min={LYRIC_LINE_HEIGHT_MIN}
              max={LYRIC_LINE_HEIGHT_MAX}
              step={LYRIC_LINE_HEIGHT_STEP}
              value={style.lineHeight}
              onChange={(event) => update("lineHeight", Number(event.target.value))}
            />
          </SettingRow>
          <SettingRow label={t("alignment")}>
            <SegmentedControl<CardAlign>
              aria-label={t("alignment")}
              value={style.align}
              onChange={(value) => update("align", value)}
              options={[
                { value: "left", label: t("left") },
                { value: "center", label: t("center") }
              ]}
            />
          </SettingRow>
        </>
      ) : null}

      {style.contentMode === "lyrics" && style.translationEnabled ? (
        <SettingRow label={t("translationScale")} description={style.translationScale.toFixed(2)}>
          <RangeSlider
            aria-label={t("translationScale")}
            min={0.6}
            max={0.9}
            step={0.01}
            value={style.translationScale}
            onChange={(event) => update("translationScale", Number(event.target.value))}
          />
        </SettingRow>
      ) : null}

      {style.contentMode === "lyrics" && layoutMode === "landscape" ? (
        <div className="settings-adaptive-span-all my-3 grid gap-3 rounded-md border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
          <p className="app-text-primary text-sm font-semibold">{t("landscapeLayoutSettings")}</p>
          <AdaptiveSettingsGrid kind="pairs" className="gap-4">
            <FieldLabel label={t("landscapeCoverSize")} hint="auto">
              <TextInput value="520px base" readOnly />
            </FieldLabel>
            <FieldLabel label={t("landscapeContentWidth")} hint="auto">
              <TextInput value="920px base" readOnly />
            </FieldLabel>
          </AdaptiveSettingsGrid>
        </div>
      ) : null}
      </AdaptiveSettingsGrid>
    </Section>
  );
}

export function VisualSettingsPanel({
  style,
  onStyleChange,
  song,
  onSongChange,
  t,
  showPlatformBadgeControl = true
}: StylePanelProps & { showPlatformBadgeControl?: boolean }) {
  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  function updateGeneratedWatermark(enabled: boolean) {
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
    <div className="grid gap-5">
      <Section title={t("background")} variant="plain" contentClassName="gap-0">
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
        <AdaptiveSettingsGrid kind="toggles" data-testid="visual-toggle-grid">
        <ToggleRow label={t("cover")} checked={style.showCover} onChange={(checked) => update("showCover", checked)} />
        <ToggleRow label={t("showSongInfo")} checked={style.showSongInfo} onChange={(checked) => update("showSongInfo", checked)} />
        <ToggleRow label={t("explicitBadge")} checked={song?.explicit === true} onChange={updateExplicitBadge} />
        <ToggleRow label={t("showAlbumName")} checked={style.showAlbumName} onChange={(checked) => update("showAlbumName", checked)} />
        <ToggleRow label={t("allowTwoLineTitle")} checked={style.allowTwoLineTitle} onChange={(checked) => update("allowTwoLineTitle", checked)} />
        <ToggleRow label={t("showGeneratedWatermark")} checked={style.showGeneratedWatermark} onChange={updateGeneratedWatermark} />
        {showPlatformBadgeControl ? (
          <ToggleRow
            label={t("showPlatformLogo")}
            checked={style.showPlatformBadge}
            onChange={(checked) => update("showPlatformBadge", checked)}
          />
        ) : null}
        <ToggleRow label={t("showSharedBy")} checked={style.showSharedBy} onChange={(checked) => update("showSharedBy", checked)} />

        {style.showSharedBy ? (
          <SettingRow label={t("sharedBy")} className="settings-adaptive-span-all">
            <TextInput
              value={style.sharedByText}
              onChange={(event) => update("sharedByText", event.target.value)}
              placeholder={t("sharedByPlaceholder")}
            />
          </SettingRow>
        ) : null}
        </AdaptiveSettingsGrid>
      </Section>
    </div>
  );
}
