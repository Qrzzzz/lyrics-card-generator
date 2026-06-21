export type SongSource = "qq" | "netease" | "apple" | "unknown";
export type Locale = "zh" | "zh-TW" | "en" | "fr" | "ja" | "es";

export type SongInfo = {
  source: SongSource;
  title: string;
  artist: string;
  album?: string;
  originalCoverUrl?: string;
  coverUrl?: string;
  proxiedCoverUrl?: string;
  originalUrl?: string;
  finalUrl?: string;
  parseMethod?: string;
};

export type CardLayoutMode = "portrait" | "landscape";
export type CardRatio = "1:1" | "4:5" | "9:16" | "16:9" | "21:9" | "3:2" | "custom";
export type FrameVariant = "auto" | "portraitGlass" | "landscapeClean" | "fullBleed";
export type CardFont = "sans-heavy" | "serif-heavy" | "system-sans" | "system-serif";
export type CardAlign = "left" | "center";
export type TextColorMode = "auto" | "preset" | "custom";
export type TextColorPreset =
  | "white"
  | "black"
  | "warmWhite"
  | "cream"
  | "charcoal"
  | "softBlue"
  | "softGold";

export type PaletteKind = "colorful" | "monochrome" | "neutral" | "low-variance";
export type ContentMode = "lyrics" | "instrumental";

export type FontPresetId = "source-han-sans" | "source-han-serif";
export type FontSchemeMode = "preset" | "custom";

export type FontScheme = {
  mode: FontSchemeMode;
  presetId?: FontPresetId;
  cjkFontFamily: string;
  latinFontFamily: string;
};

export type ExtractedPalette = {
  colors: string[];
  primary: string;
  secondary?: string;
  accent?: string;
  dark: string;
  light: string;
  muted: string;
  averageLuminance: number;
  averageSaturation: number;
  hueVariance: number;
  isLightCover: boolean;
  kind: PaletteKind;
};

export type CardStyle = {
  backgroundMode: "palette" | "gradient";
  extractedPalette?: ExtractedPalette;
  layoutMode: CardLayoutMode;
  ratio: CardRatio;
  width: number;
  height: number;
  autoHeight: boolean;
  font: CardFont;
  fontScheme?: FontScheme;
  customFontEnabled?: boolean;
  customFontFamily?: string;
  customFontLabel?: string;
  customFontWeight?: number;
  customFontStyle?: "normal" | "italic";
  lyricFontSize: number;
  lineHeight: number;
  align: CardAlign;
  textColorMode: TextColorMode;
  textColorPreset: TextColorPreset;
  customTextColor: string;
  resolvedTextColor: string;
  translationEnabled: boolean;
  translationText: string;
  translationScale: number;
  allowTwoLineTitle: boolean;
  contentMode: ContentMode;
  instrumentalText: string;
  showCover: boolean;
  showSongInfo: boolean;
  showGeneratedWatermark: boolean;
  showSharedBy: boolean;
  sharedByText: string;
  showWatermark: boolean;
  showPlatformBadge: boolean;
  frameStyleEnabled: boolean;
  frameVariant?: FrameVariant;
  showFrame: boolean;
  showShadow: boolean;
  coverCropScale: number;
  watermark: string;
};

export type BackgroundAnalysis = {
  luminance: number;
  isLight: boolean;
  suggestedTextColor: string;
  overlayOpacity: number;
};

export type AppState = {
  locale: Locale;
  url: string;
  song: SongInfo;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  style: CardStyle;
  lastPortraitSize?: { width: number; height: number; ratio: CardRatio };
  lastLandscapeSize?: { width: number; height: number; ratio: CardRatio };
  palette?: ExtractedPalette;
  paletteWarning?: string;
};

export type ParsedSongData = SongInfo & {
  originalUrl: string;
  lyrics?: string;
};

export type LyricsCandidate = {
  lyrics: string;
  source: "lrclib" | "netease-web" | "qq-web" | "apple-none" | "unknown";
  confidence: number;
  notice: string;
};
