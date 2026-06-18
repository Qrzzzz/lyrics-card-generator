"use client";

import { useEffect, useMemo, useState } from "react";
import { ColorControls } from "@/components/editor/style-panel/ColorControls";
import { SegmentButton } from "@/components/editor/style-panel/SegmentButton";
import { Input, Label, Section, Select, SwitchRow } from "@/components/ui/controls";
import { PRESET_CARD_SIZES } from "@/lib/card-size";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { FONT_OPTIONS } from "@/lib/fonts";
import type { createT } from "@/lib/i18n";
import type {
  CardAlign,
  CardFont,
  CardLayoutMode,
  CardRatio,
  CardStyle,
  ContentMode
} from "@/lib/types";

type StylePanelProps = {
  style: CardStyle;
  onStyleChange: (style: CardStyle) => void;
  t: ReturnType<typeof createT>;
};

export function StylePanel(props: StylePanelProps) {
  return (
    <div className="grid gap-4">
      <LayoutSettingsPanel {...props} />
      <VisualSettingsPanel {...props} />
    </div>
  );
}

export function LayoutSettingsPanel({ style, onStyleChange, t }: StylePanelProps) {
  const layoutMode = style.layoutMode ?? "portrait";
  const [fontPanelOpen, setFontPanelOpen] = useState(false);

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

    onStyleChange({
      ...style,
      layoutMode,
      frameVariant: style.frameStyleEnabled && style.frameVariant !== "fullBleed" ? "auto" : style.frameVariant
    });
  }

  return (
    <Section title={t("layout")} eyebrow={t("style")}>
      <div className="grid gap-2">
        <div className="app-text-primary text-sm font-medium">{t("layoutMode")}</div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("layoutMode")}>
          <SegmentButton
            active={layoutMode === "portrait"}
            label={t("portraitLayout")}
            onClick={() => updateLayoutMode("portrait")}
            dataAttribute="portrait"
          />
          <SegmentButton
            active={layoutMode === "landscape"}
            label={t("landscapeLayout")}
            onClick={() => updateLayoutMode("landscape")}
            dataAttribute="landscape"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Label label={t("sizeMode")}>
          <Select value={style.ratio} onChange={(event) => updateRatio(event.target.value as CardRatio)}>
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
          </Select>
        </Label>
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0 flex-1">
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
            <button
              type="button"
              title={t("customFont")}
              aria-label={t("customFont")}
              onClick={() => setFontPanelOpen((open) => !open)}
              className="app-button inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition"
            >
              {t("customFont")}
            </button>
          </div>
        </div>
      </div>

      {fontPanelOpen ? <CustomFontPanel style={style} onStyleChange={onStyleChange} t={t} /> : null}

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
                min={layoutMode === "landscape" ? 1080 : 720}
                max={layoutMode === "landscape" ? 3000 : 1440}
                step={20}
                value={style.width}
                onChange={(event) => update("width", Number(event.target.value))}
              />
            </Label>
            <Label label={t("height")} hint={style.autoHeight ? t("auto") : `${style.height}px`}>
              <Input
                type="range"
                min={720}
                max={layoutMode === "landscape" ? 1600 : 3200}
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

      {layoutMode === "landscape" ? (
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
    </Section>
  );
}

function CustomFontPanel({ style, onStyleChange, t }: StylePanelProps) {
  const desktopApi = getLyricsCardDesktopApi();
  const [fonts, setFonts] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const filteredFonts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return fonts.slice(0, 80);
    }

    return fonts.filter((font) => font.toLowerCase().includes(query)).slice(0, 80);
  }, [fonts, search]);

  function update<K extends keyof CardStyle>(key: K, value: CardStyle[K]) {
    onStyleChange({ ...style, [key]: value });
  }

  useEffect(() => {
    let active = true;

    if (!desktopApi) {
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

  return (
    <div className="grid gap-3 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="app-text-primary text-sm font-semibold">{t("customFont")}</p>
        <SwitchRow
          label={t("enableCustomFont")}
          checked={Boolean(style.customFontEnabled)}
          onChange={(checked) => update("customFontEnabled", checked)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label label={t("fontSearch")}>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("fontSearchPlaceholder")}
            disabled={!desktopApi || fonts.length === 0}
          />
        </Label>
        <Label label={t("manualFontFamily")}>
          <Input
            value={style.customFontFamily ?? ""}
            onChange={(event) => update("customFontFamily", event.target.value)}
            placeholder="Microsoft YaHei"
          />
        </Label>
      </div>

      {desktopApi && fonts.length > 0 ? (
        <Label label={t("systemFonts")}>
          <Select
            value={style.customFontFamily ?? ""}
            onChange={(event) => {
              const customFontFamily = event.target.value;
              onStyleChange({
                ...style,
                customFontFamily,
                customFontEnabled: customFontFamily ? true : style.customFontEnabled
              });
            }}
          >
            <option value="">{t("chooseFont")}</option>
            {filteredFonts.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </Select>
        </Label>
      ) : null}

      {status ? <p className="app-text-subtle text-sm">{status}</p> : null}
    </div>
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
    <Section title={t("step.visual")} eyebrow={t("background")}>
      <Label label={t("coverCrop")} hint={style.coverCropScale.toFixed(2)}>
        <Input
          type="range"
          min={1}
          max={2}
          step={0.01}
          value={style.coverCropScale}
          onChange={(event) => update("coverCropScale", Number(event.target.value))}
        />
      </Label>

      <ColorControls style={style} onStyleChange={onStyleChange} t={t} />

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
      </div>

      <div className="grid gap-3 rounded-lg border border-[rgb(var(--panel-border))] bg-[rgb(var(--panel-bg))] p-3">
        <div className="app-text-primary text-sm font-medium">{t("showFrame")}</div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("showFrame")}>
          <SegmentButton
            active={frameVisible}
            label={t("frameAndShadow")}
            onClick={() => updateFrameVisibility(true)}
            dataAttribute="frame"
          />
          <SegmentButton
            active={!frameVisible}
            label={t("fullBleed")}
            onClick={() => updateFrameVisibility(false)}
            dataAttribute="fullBleed"
          />
        </div>
      </div>

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

