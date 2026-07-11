import { PRESET_CARD_SIZES } from "@/lib/card-size";
import { DEFAULT_FONT_SCHEME } from "@/lib/font-schemes";
import { messages } from "@/lib/i18n";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { AppState, Locale } from "@/lib/types";

export const DEFAULT_LYRICS = [
  "And I know now",
  "Even if I tried to change",
  "That somehow",
  "You'd end up with her anyway"
].join("\n");

export const DEFAULT_TRANSLATION = [
  "我如今才明白",
  "纵使我拼尽全力改写结局",
  "命运兜兜转转",
  "你终究还是会走向她"
].join("\n");

export const DEFAULT_INSTRUMENTAL_TEXT: Record<Locale, string> = {
  zh: "纯音乐",
  "zh-TW": "純音樂",
  en: "Instrumental Track",
  fr: "Morceau instrumental",
  ja: "インストゥルメンタル",
  es: "Pista instrumental"
};

export const defaultState: AppState = {
  locale: "zh",
  url: "",
  song: {
    source: "unknown",
    title: "",
    artist: "",
    album: "",
    explicit: false,
    originalCoverUrl: "",
    coverUrl: "",
    proxiedCoverUrl: "",
    originalUrl: ""
  },
  lyrics: "",
  translationText: "",
  translationEnabled: false,
  style: {
    backgroundMode: "palette",
    extractedPalette: DEFAULT_PALETTE,
    layoutMode: "portrait",
    ratio: "custom",
    width: 1040,
    height: 1080,
    autoHeight: true,
    font: "sans-heavy",
    fontScheme: { ...DEFAULT_FONT_SCHEME },
    customFontEnabled: false,
    customFontFamily: "",
    customFontLabel: "",
    customFontWeight: 400,
    customFontStyle: "normal",
    lyricFontSize: 60,
    lineHeight: 1.4,
    align: "left",
    textColorMode: "preset",
    textColorPreset: "white",
    customTextColor: "#FFFFFF",
    resolvedTextColor: "#FFFFFF",
    translationEnabled: false,
    translationText: "",
    translationScale: 0.75,
    allowTwoLineTitle: false,
    contentMode: "lyrics",
    instrumentalText: DEFAULT_INSTRUMENTAL_TEXT.zh,
    showCover: true,
    showSongInfo: true,
    showAlbumName: true,
    showGeneratedWatermark: false,
    showSharedBy: false,
    sharedByText: "",
    showWatermark: false,
    showPlatformBadge: false,
    showFineGrid: false,
    fineGridDensity: "medium",
    coverCropScale: 1,
    watermark: messages.zh.madeWith
  },
  lastPortraitSize: {
    ratio: "custom",
    width: 1040,
    height: 1080,
    autoHeight: true
  },
  lastLandscapeSize: {
    ratio: "16:9",
    width: PRESET_CARD_SIZES["16:9"].width,
    height: PRESET_CARD_SIZES["16:9"].height,
    autoHeight: false
  },
  palette: DEFAULT_PALETTE,
  paletteWarning: ""
};
