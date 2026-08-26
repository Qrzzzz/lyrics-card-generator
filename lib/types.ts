export type SongSource = "qq" | "netease" | "apple" | "spotify" | "unknown";
export type Locale = "zh" | "zh-TW" | "en" | "fr" | "ja" | "es";

export type SongInfo = {
  source: SongSource;
  title: string;
  artist: string;
  album?: string;
  explicit?: boolean;
  originalCoverUrl?: string;
  coverUrl?: string;
  proxiedCoverUrl?: string;
  originalUrl?: string;
  finalUrl?: string;
  parseMethod?: string;
};

export type CardLayoutMode = "portrait" | "landscape";
export type CardRatio = "1:1" | "4:5" | "9:16" | "16:9" | "21:9" | "3:2" | "custom";
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
export type PaletteRole = "base" | "subject" | "transition" | "highlight";
export type ContentMode = "lyrics" | "instrumental";
export type BackgroundGridDensity = "sparse" | "medium" | "dense";

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
  /** Optional v5.10+ spatial metadata; legacy consumers can ignore it. */
  analysis?: CoverPaletteAnalysis;
};

export type NormalizedPalettePoint = {
  x: number;
  y: number;
};

export type PaletteSpatialCell = NormalizedPalettePoint & {
  width: number;
  height: number;
  /** Share of the cover's total effective alpha assigned to this region in this cell. */
  coverage: number;
};

export type PaletteRegionAnalysis = {
  id: string;
  color: string;
  /** Assigned sample count divided by all samples, including transparent samples. */
  area: number;
  /** Alpha-weighted coverage divided by the image's total effective-alpha coverage. */
  visibleShare: number;
  meanAlpha: number;
  relativeLuminance: number;
  perceptualLightness: number;
  chroma: number;
  hue: number | null;
  salience: number;
  centroid: NormalizedPalettePoint;
  bounds: NormalizedPalettePoint & { width: number; height: number };
  cells: PaletteSpatialCell[];
};

export type PaletteRoleReference = {
  role: PaletteRole;
  color: string;
  regionId?: string;
  source: "region" | "perceptual-mix";
  anchor: NormalizedPalettePoint;
};

export type CoverPaletteAnalysis = {
  version: 1;
  /** FNV-1a hash of dimensions plus canonical RGBA samples. */
  seed: string;
  sourceWidth: number;
  sourceHeight: number;
  sampleWidth: number;
  sampleHeight: number;
  /** Fraction of sampled positions with non-zero effective alpha. */
  visibleCoverage: number;
  /** Mean alpha across the complete sampled cover, including transparent positions. */
  meanAlpha: number;
  regions: PaletteRegionAnalysis[];
  roles: {
    base: PaletteRoleReference;
    subject: PaletteRoleReference;
    transition: PaletteRoleReference;
    highlights: PaletteRoleReference[];
  };
};

export type CoverArtworkAnalysis = {
  sourceUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
  hasTransparency: boolean;
  status: "ready" | "error";
};

export type CardStyle = {
  backgroundMode: "palette" | "gradient";
  extractedPalette?: ExtractedPalette;
  layoutMode: CardLayoutMode;
  ratio: CardRatio;
  width: number;
  height: number;
  autoWidth: boolean;
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
  allowMultiLineTitle: boolean;
  contentMode: ContentMode;
  instrumentalText: string;
  showCover: boolean;
  showSongInfo: boolean;
  showAlbumName: boolean;
  showGeneratedWatermark: boolean;
  showSharedBy: boolean;
  sharedByText: string;
  showWatermark: boolean;
  showPlatformBadge: boolean;
  showFineGrid: boolean;
  fineGridDensity: BackgroundGridDensity;
  coverCropScale: number;
  watermark: string;
  /** Independent free-ratio landscape settings; legacy width/height remain portrait-only. */
  landscapeLayout?: LandscapeLayoutSettings;
  /** DOM-measured immutable geometry used by preview and export. */
  landscapePlan?: LandscapeLayoutPlan;
};

export type CardSizeSnapshot = Pick<CardStyle, "ratio" | "width" | "height"> & {
  autoWidth?: boolean;
  autoHeight?: boolean;
};

/**
 * Landscape sizing is deliberately separate from CardStyle.width/height.
 * Those legacy fields continue to describe the portrait canvas only.
 */
export type LandscapeLayoutSettings = {
  autoLyricsWidth: boolean;
  lyricsWidth: number;
  autoHeight: boolean;
  requestedHeight: number;
};

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Immutable geometry shared by visible preview and every export host. */
export type LandscapeLayoutPlan = {
  version: 1;
  measurementKey: string;
  canvas: { width: number; height: number };
  safeRect: LayoutRect;
  leftColumnRect: LayoutRect;
  coverRect: LayoutRect;
  metadataRect: LayoutRect;
  accessoriesRect?: LayoutRect;
  lyricsRect: LayoutRect;
  lyricsNaturalHeight: number;
  leftScale: number;
  flexibleGap: number;
  score: number;
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
  /** v6 content source of truth. Legacy text fields below are derived projections. */
  lyricDocument: import("@/lib/lyrics-document-v2").LyricDocumentV2;
  /** @deprecated Read-only compatibility projection of lyricDocument. */
  lyrics: string;
  /** @deprecated Read-only compatibility projection of lyricDocument. */
  translationText: string;
  translationEnabled: boolean;
  style: CardStyle;
  lastPortraitSize?: CardSizeSnapshot;
  lastPortraitCustomSize?: CardSizeSnapshot;
  lastLandscapeSize?: CardSizeSnapshot;
  palette?: ExtractedPalette;
  paletteWarning?: string;
  coverArtwork?: CoverArtworkAnalysis;
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
