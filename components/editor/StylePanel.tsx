"use client";

import { PRESET_CARD_SIZES } from "@/lib/card-size";
import { TEXT_COLOR_PRESETS } from "@/lib/color-analysis";
import { FONT_OPTIONS } from "@/lib/fonts";
import type { createT, MessageKey } from "@/lib/i18n";
import type {
  CardAlign,
  CardFont,
  CardLayoutMode,
  CardRatio,
  CardStyle,
  ContentMode,
  FrameVariant,
  TextColorMode,
  TextColorPreset
} from "@/lib/types";
import { Input, Label, Section, Select, SwitchRow } from "@/components/ui/controls";

const TEXT_PRESET_LABEL_KEYS: Record<TextColorPreset, MessageKey> = {
  white: "pureWhite",
  black: "pureBlack",
  warmWhite: "warmWhite",
  cream: "cream",
  charcoal: "charcoal",
  softBlue: "softBlue",
  softGold: "softGold"
};

export function StylePanel({
  style,
  onStyleChange,
  t
}: {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  t: ReturnType<typeof createT>;
}) {
  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  function updateRatio(ratio: CardRatio) {
    if (ratio === "custom") {
      onStyleChange({ ...style, ratio, width: style.width || 1080, height: style.height || 1480 });
      return;
    }

    const preset = PRESET_CARD_SIZES[ratio];
    onStyleChange({ ...style, ratio, width: preset.width, height: preset.height, autoHeight: false });
  }

  function updateLayoutMode(layoutMode: CardLayoutMode) {
    if (layoutMode === (style.layoutMode ?? "portrait")) {
      return;
    }

    onStyleChange({ ...style, layoutMode });
  }

  function updateFrameStyle(enabled: boolean) {
    onStyleChange({ ...style, frameStyleEnabled: enabled, showFrame: enabled, showShadow: enabled });
  }

  function updateGeneratedWatermark(enabled: boolean) {
    onStyleChange({ ...style, showGeneratedWatermark: enabled, showWatermark: enabled });
  }

  return (
    <Section title={t("style")} eyebrow={t("layout")}>
      <Label label={t("layoutMode")}>
        <Select value={style.layoutMode ?? "portrait"} onChange={(event) => updateLayoutMode(event.target.value as CardLayoutMode)}>
          <option value="portrait">{t("portraitLayout")}</option>
          <option value="landscape">{t("landscapeLayout")}</option>
        </Select>
      </Label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Label label={t("sizeMode")}>
          <Select value={style.ratio} onChange={(event) => updateRatio(event.target.value as CardRatio)}>
            {(style.layoutMode ?? "portrait") === "landscape" ? (
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
          </Select>
        </Label>
        <Label label={t("font")}>
          <Select value={style.font} onChange={(event) => update("font", event.target.value as CardFont)}>
            {FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </Select>
        </Label>
      </div>

      {style.ratio === "custom" ? (
        <div className="grid gap-4 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
          <div className="app-text-subtle flex items-center justify-between gap-3 text-sm">
            <span>{t("customCanvas")}</span>
            <span className="app-text-primary font-semibold">
              {style.width} x {style.height}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label label={t("width")} hint={`${style.width}px`}>
              <Input
                type="range"
                min={(style.layoutMode ?? "portrait") === "landscape" ? 1080 : 720}
                max={(style.layoutMode ?? "portrait") === "landscape" ? 3000 : 1440}
                step={20}
                value={style.width}
                onChange={(event) => update("width", Number(event.target.value))}
              />
            </Label>
            <Label label={t("height")} hint={style.autoHeight ? t("auto") : `${style.height}px`}>
              <Input
                type="range"
                min={720}
                max={(style.layoutMode ?? "portrait") === "landscape" ? 1600 : 2400}
                step={20}
                value={style.height}
                disabled={style.autoHeight}
                onChange={(event) => update("height", Number(event.target.value))}
              />
            </Label>
          </div>
          <SwitchRow label={t("autoHeight")} checked={style.autoHeight} onChange={(checked) => update("autoHeight", checked)} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Label label={t("contentType")}>
          <Select value={style.contentMode} onChange={(event) => update("contentMode", event.target.value as ContentMode)}>
            <option value="lyrics">{t("lyricsMode")}</option>
            <option value="instrumental">{t("instrumentalMode")}</option>
          </Select>
        </Label>
        <Label label={t("fontSize")} hint={`${style.lyricFontSize}px`}>
          <Input
            type="range"
            min={36}
            max={72}
            value={style.lyricFontSize}
            onChange={(event) => update("lyricFontSize", Number(event.target.value))}
          />
        </Label>
        <Label label={t("lineHeight")} hint={style.lineHeight.toFixed(2)}>
          <Input
            type="range"
            min={1.1}
            max={1.75}
            step={0.05}
            value={style.lineHeight}
            onChange={(event) => update("lineHeight", Number(event.target.value))}
          />
        </Label>
      </div>

      <Label label={t("alignment")}>
        <Select value={style.align} onChange={(event) => update("align", event.target.value as CardAlign)}>
          <option value="left">{t("left")}</option>
          <option value="center">{t("center")}</option>
        </Select>
      </Label>

      {style.contentMode === "instrumental" ? (
        <Label label={t("instrumentalText")}>
          <Input
            value={style.instrumentalText}
            onChange={(event) => update("instrumentalText", event.target.value)}
            placeholder={t("instrumentalTextPlaceholder")}
          />
        </Label>
      ) : null}

      {style.contentMode === "lyrics" && style.translationEnabled ? (
        <Label label={t("translationScale")} hint={style.translationScale.toFixed(2)}>
          <Input
            type="range"
            min={0.6}
            max={0.9}
            step={0.01}
            value={style.translationScale}
            onChange={(event) => update("translationScale", Number(event.target.value))}
          />
        </Label>
      ) : null}

      <Label label={t("coverCrop")} hint={style.coverCropScale.toFixed(2)}>
        <Input
          type="range"
          min={1.35}
          max={2}
          step={0.01}
          value={style.coverCropScale}
          onChange={(event) => update("coverCropScale", Number(event.target.value))}
        />
      </Label>

      {(style.layoutMode ?? "portrait") === "landscape" ? (
        <div className="grid gap-3 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
          <p className="app-text-primary text-sm font-semibold">{t("landscapeLayoutSettings")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label label={t("landscapeCoverSize")} hint="auto">
              <Input value="520px base" readOnly />
            </Label>
            <Label label={t("landscapeContentWidth")} hint="auto">
              <Input value="920px base" readOnly />
            </Label>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <Label label={t("textColor")}>
            <Select
              value={style.textColorMode}
              onChange={(event) => update("textColorMode", event.target.value as TextColorMode)}
            >
              <option value="auto">{t("auto")}</option>
              <option value="preset">{t("preset")}</option>
              <option value="custom">{t("custom")}</option>
            </Select>
          </Label>
          <Label label={t("preset")}>
            <Select
              value={style.textColorPreset}
              disabled={style.textColorMode !== "preset"}
              onChange={(event) => update("textColorPreset", event.target.value as TextColorPreset)}
            >
              {Object.keys(TEXT_COLOR_PRESETS).map((value) => (
                <option key={value} value={value}>
                  {t(TEXT_PRESET_LABEL_KEYS[value as TextColorPreset])}
                </option>
              ))}
            </Select>
          </Label>
          <Label label={t("custom")} hint={style.resolvedTextColor}>
            <Input
              type="color"
              value={style.customTextColor}
              disabled={style.textColorMode !== "custom"}
              onInput={(event) => update("customTextColor", event.currentTarget.value)}
              onChange={(event) => update("customTextColor", event.target.value)}
              className="h-11 p-1"
            />
          </Label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SwitchRow label={t("cover")} checked={style.showCover} onChange={(checked) => update("showCover", checked)} />
        <SwitchRow label={t("showSongInfo")} checked={style.showSongInfo} onChange={(checked) => update("showSongInfo", checked)} />
        <SwitchRow label={t("allowTwoLineTitle")} checked={style.allowTwoLineTitle} onChange={(checked) => update("allowTwoLineTitle", checked)} />
        <SwitchRow label={t("showGeneratedWatermark")} checked={style.showGeneratedWatermark} onChange={updateGeneratedWatermark} />
        <SwitchRow
          label={t("showPlatformLogo")}
          checked={style.showPlatformBadge}
          onChange={(checked) => update("showPlatformBadge", checked)}
        />
        <SwitchRow label={t("showSharedBy")} checked={style.showSharedBy} onChange={(checked) => update("showSharedBy", checked)} />
        <SwitchRow label={t("frameAndShadow")} checked={style.frameStyleEnabled} onChange={updateFrameStyle} />
      </div>

      {style.frameStyleEnabled ? (
        <Label label={t("layoutCompatibility")}>
          <Select
            value={style.frameVariant ?? "auto"}
            onChange={(event) => update("frameVariant", event.target.value as FrameVariant)}
          >
            <option value="auto">{t("frameStyleAuto")}</option>
            <option value="portraitGlass">{t("frameStylePortrait")}</option>
            <option value="landscapeClean">{t("frameStyleLandscape")}</option>
            <option value="fullBleed">{t("fullBleed")}</option>
          </Select>
        </Label>
      ) : null}

      {style.showSharedBy ? (
        <Label label={t("sharedBy")}>
          <Input
            value={style.sharedByText}
            onChange={(event) => update("sharedByText", event.target.value)}
            placeholder={t("sharedByPlaceholder")}
          />
        </Label>
      ) : null}
    </Section>
  );
}
