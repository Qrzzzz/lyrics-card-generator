"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { LyricInput } from "@/components/editor/LyricInput";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PreviewPane } from "@/components/editor/PreviewPane";
import { SettingsStepper, type SettingsStep } from "@/components/editor/SettingsStepper";
import {
  LayoutSettingsPanel,
  VisualSettingsPanel
} from "@/components/editor/StylePanel";
import {
  DEFAULT_INSTRUMENTAL_TEXT,
  defaultState
} from "@/components/editor/editor-defaults";
import { useMeasuredAutoCanvasHeight } from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";
import {
  useCoverPalette,
  useResolvedTextColor
} from "@/components/editor/hooks/useLyricEditorEffects";
import { getCardSize } from "@/lib/card-size";
import { clearLyricContent } from "@/lib/clear-content";
import { applyEditorStyleChange } from "@/lib/editor/apply-style-change";
import { exportNodeAsPng } from "@/lib/export-image";
import { createT } from "@/lib/i18n";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import { resolveUiAccentColor } from "@/lib/settings/accent";
import {
  DEFAULT_USER_SETTINGS,
  getExportPixelRatio,
  type ExportQualityId,
  type UserSettings
} from "@/lib/settings/types";
import type {
  AppState,
  CardStyle,
  FontScheme,
  SongInfo
} from "@/lib/types";
import { sanitizeFilePart } from "@/lib/utils";
import { WebLiteFontPanel } from "@/web-lite/WebLiteFontPanel";
import { WebLiteHeader } from "@/web-lite/WebLiteHeader";
import { WebLiteSongInfo } from "@/web-lite/WebLiteSongInfo";
import {
  webLiteCopy,
  type WebLiteLocale
} from "@/web-lite/copy";

const PREFERENCES_KEY = "lyrics-card-web-lite-preferences-v1";
const EXPORT_QUALITY_OPTIONS = ["medium", "high"] as const;
const WEB_LITE_SETTINGS: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  sparkCursorEnabled: false,
  uiThemeMode: "dark",
  uiAcrylicEnabled: false,
  uiAccentMode: "album-dynamic",
  appBackground: {
    ...DEFAULT_USER_SETTINGS.appBackground,
    mode: "solid",
    solidColor: "#08090C"
  },
  defaultExportQuality: "high",
  defaultExportPixelRatio: 2,
  firstLaunchLanguageSelected: true
};

type WebLitePreferences = {
  version: 1;
  locale: WebLiteLocale;
  exportQuality: Extract<ExportQualityId, "medium" | "high">;
};

export function WebLiteEditor() {
  const initialPreferences = useMemo(readPreferences, []);
  const [state, setState] = useState<AppState>(() => createInitialState(initialPreferences.locale));
  const [currentStep, setCurrentStep] = useState(0);
  const [fontSchemePreview, setFontSchemePreview] = useState<FontScheme | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [exportQuality, setExportQuality] = useState<Extract<ExportQualityId, "medium" | "high">>(
    initialPreferences.exportQuality
  );
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState("");
  const [coverResetGeneration, setCoverResetGeneration] = useState(0);
  const cardRef = useRef<HTMLElement | null>(null);
  const localCoverObjectUrlRef = useRef<string | undefined>(undefined);
  const coverValidationGenerationRef = useRef(0);
  const locale: WebLiteLocale = state.locale === "en" ? "en" : "zh";
  const copy = webLiteCopy[locale];
  const t = useMemo(() => createT(locale), [locale]);
  const activeCover = state.song.proxiedCoverUrl || state.song.coverUrl || "";

  useCoverPalette(activeCover, setState);
  useResolvedTextColor(state, setState);
  useMeasuredAutoCanvasHeight(state, setState, cardRef);

  const parsedState = useMemo(
    () => ({
      ...state,
      style: {
        ...state.style,
        showPlatformBadge: false,
        extractedPalette: state.palette ?? DEFAULT_PALETTE
      }
    }),
    [state]
  );
  const accentColor = resolveUiAccentColor({
    settings: WEB_LITE_SETTINGS,
    palette: state.palette
  });

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = locale === "zh" ? "歌词卡片生成器 · Web Lite" : "Lyrics Card Generator · Web Lite";
    document.body.dataset.uiTheme = "dark";
    document.body.dataset.desktopShell = "false";

    return () => {
      delete document.body.dataset.uiTheme;
      delete document.body.dataset.desktopShell;
    };
  }, [locale]);

  useEffect(() => {
    const preferences: WebLitePreferences = {
      version: 1,
      locale,
      exportQuality
    };

    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Web Lite remains fully usable when storage is blocked.
    }
  }, [exportQuality, locale]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(
    () => () => {
      if (localCoverObjectUrlRef.current) {
        URL.revokeObjectURL(localCoverObjectUrlRef.current);
      }
    },
    []
  );

  function revokeLocalCoverObjectUrl() {
    if (localCoverObjectUrlRef.current) {
      URL.revokeObjectURL(localCoverObjectUrlRef.current);
      localCoverObjectUrlRef.current = undefined;
    }
  }

  function applyLocale(nextLocale: WebLiteLocale) {
    setState((current) => {
      const shouldUpdateInstrumentalText = Object.values(DEFAULT_INSTRUMENTAL_TEXT).includes(
        current.style.instrumentalText
      );

      return {
        ...current,
        locale: nextLocale,
        style: {
          ...current.style,
          instrumentalText: shouldUpdateInstrumentalText
            ? DEFAULT_INSTRUMENTAL_TEXT[nextLocale]
            : current.style.instrumentalText
        }
      };
    });
  }

  function clearAllContent() {
    invalidateCoverValidationAndResetSongInfo();
    revokeLocalCoverObjectUrl();
    setFontSchemePreview(null);
    setState((current) => {
      const cleared = clearLyricContent(current);
      return {
        ...cleared,
        style: {
          ...cleared.style,
          showPlatformBadge: false
        }
      };
    });
  }

  function setSong(song: SongInfo) {
    setState((current) => ({ ...current, song }));
  }

  function applyLocalCover(file: File) {
    invalidateCoverValidationAndResetSongInfo();
    const objectUrl = URL.createObjectURL(file);
    revokeLocalCoverObjectUrl();
    localCoverObjectUrlRef.current = objectUrl;
    setState((current) => ({
      ...current,
      song: {
        ...current.song,
        originalCoverUrl: "",
        coverUrl: objectUrl,
        proxiedCoverUrl: objectUrl
      }
    }));
  }

  function applyRemoteCover(url: string, requestId: number) {
    if (coverValidationGenerationRef.current !== requestId) {
      return false;
    }

    revokeLocalCoverObjectUrl();
    setState((current) => ({
      ...current,
      song: {
        ...current.song,
        originalCoverUrl: url,
        coverUrl: url,
        proxiedCoverUrl: url
      }
    }));
    return true;
  }

  function invalidateCoverValidationAndResetSongInfo() {
    coverValidationGenerationRef.current += 1;
    setCoverResetGeneration((generation) => generation + 1);
  }

  function handleStyleChange(nextStyle: CardStyle) {
    setState((current) =>
      applyEditorStyleChange(current, {
        ...nextStyle,
        showPlatformBadge: false
      })
    );
  }

  function setLyrics(lyrics: string) {
    setState((current) => ({ ...current, lyrics }));
  }

  function setTranslationEnabled(enabled: boolean) {
    setState((current) => ({
      ...current,
      translationEnabled: enabled,
      style: { ...current.style, translationEnabled: enabled }
    }));
  }

  function setTranslationText(translationText: string) {
    setState((current) => ({
      ...current,
      translationText,
      style: { ...current.style, translationText }
    }));
  }

  function splitAlternatingLyrics(lyrics: string, translationText: string) {
    setState((current) => ({
      ...current,
      lyrics,
      translationText,
      translationEnabled: true,
      style: {
        ...current.style,
        translationText,
        translationEnabled: true
      }
    }));
  }

  async function completeAndExport() {
    if (!cardRef.current || isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      const size = getCardSize(parsedState.style);
      const fileName = `lyric-card-${sanitizeFilePart(parsedState.song.title)}.png`;
      await exportNodeAsPng(
        cardRef.current,
        fileName,
        size.width,
        size.height,
        getExportPixelRatio(exportQuality)
      );
      setToast(copy.exportReady);
    } catch (error) {
      console.error("[Lyrics Card Generator Web Lite] export failed", error);
      setToast(copy.exportFailed);
    } finally {
      setIsExporting(false);
    }
  }

  const steps: SettingsStep[] = [
    {
      id: "song-info",
      title: copy.songStep,
      description: copy.songStepDescription,
      isComplete: Boolean(
        state.song.title.trim() ||
        state.song.artist.trim() ||
        state.song.album?.trim() ||
        state.song.coverUrl?.trim()
      ),
      content: (
        <WebLiteSongInfo
          song={state.song}
          t={t}
          copy={copy}
          onSongChange={setSong}
          onLocalCover={applyLocalCover}
          onRemoteCover={applyRemoteCover}
          coverResetGeneration={coverResetGeneration}
          validationGenerationRef={coverValidationGenerationRef}
        />
      )
    },
    {
      id: "lyrics",
      title: t("step.lyrics"),
      description: t("manualText"),
      isComplete: state.style.contentMode === "instrumental" || Boolean(state.lyrics.trim()),
      content: (
        <LyricInput
          lyrics={state.lyrics}
          onLyricsChange={setLyrics}
          translationEnabled={state.style.translationEnabled}
          translationText={state.style.translationText}
          onTranslationEnabledChange={setTranslationEnabled}
          onTranslationTextChange={setTranslationText}
          onSplitAlternatingLyrics={splitAlternatingLyrics}
          onAITranslate={() => undefined}
          isAITranslating={false}
          themeColor={accentColor}
          contentMode={state.style.contentMode}
          locale={locale}
          t={t}
          showAiTranslate={false}
        />
      )
    },
    {
      id: "layout",
      title: t("step.layout"),
      description: t("layoutCompatibility"),
      isComplete: true,
      content: <LayoutSettingsPanel style={state.style} onStyleChange={handleStyleChange} t={t} />
    },
    {
      id: "font",
      title: t("step.fontScheme"),
      description: copy.fontDescription,
      isComplete: true,
      content: (
        <WebLiteFontPanel
          style={state.style}
          copy={copy}
          t={t}
          onStyleChange={handleStyleChange}
          onPreviewSchemeChange={setFontSchemePreview}
        />
      )
    },
    {
      id: "visual",
      title: t("step.visual"),
      description: t("background"),
      isComplete: true,
      content: (
        <VisualSettingsPanel
          style={state.style}
          onStyleChange={handleStyleChange}
          song={state.song}
          onSongChange={setSong}
          t={t}
          showPlatformBadgeControl={false}
        />
      )
    },
    {
      id: "export",
      title: t("step.export"),
      description: t("exportHint"),
      isComplete: true,
      primaryAction: {
        label: t("step.complete"),
        onClick: completeAndExport,
        disabled: isExporting
      },
      content: (
        <ExportPanel
          cardRef={cardRef}
          t={t}
          accentColor={accentColor}
          exportQuality={exportQuality}
          onExportQualityChange={(quality) => {
            if (quality === "medium" || quality === "high") {
              setExportQuality(quality);
            }
          }}
          qualityOptions={EXPORT_QUALITY_OPTIONS}
          qualityLabels={{ medium: copy.exportStandard, high: copy.exportHigh }}
          isExporting={isExporting}
          onExport={completeAndExport}
        />
      )
    }
  ];

  return (
    <div
      className="app-shell min-h-screen"
      data-ui-theme="dark"
      data-desktop-shell="false"
      style={{ "--app-accent": accentColor } as React.CSSProperties}
    >
      <div className="absolute inset-0 z-0 overflow-hidden bg-[#08090C]" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(255,255,255,0.055),transparent_32%),radial-gradient(circle_at_92%_22%,rgba(77,91,124,0.11),transparent_30%),linear-gradient(145deg,#0b0c12,#07080d_62%,#090a10)]" />
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.045),transparent_26%,rgba(255,255,255,0.02)_48%,transparent_72%)]" />
      </div>

      <main className="app-main-content lyric-editor-main relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
        <div className="lyric-editor-stage relative mx-auto min-w-0 max-w-[1520px] overflow-hidden">
          <div data-testid="web-lite-editor-surface" className="relative z-10 h-full min-h-0 overflow-y-auto">
            <div className="grid min-w-0 max-w-full gap-5">
              <WebLiteHeader
                locale={locale}
                t={t}
                copy={copy}
                onLocaleChange={applyLocale}
                onClearAll={clearAllContent}
              />

              <div className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
                <MotionPanel className="order-2 grid min-w-0 gap-4 lg:order-1">
                  <SettingsStepper
                    steps={steps}
                    currentStep={currentStep}
                    onStepChange={setCurrentStep}
                    backText={t("step.back")}
                    nextText={t("step.next")}
                    themeColor={accentColor}
                  />
                </MotionPanel>

                <PreviewPane
                  isPreviewVisible={isPreviewVisible}
                  onPreviewVisibleChange={setIsPreviewVisible}
                  song={parsedState.song}
                  lyrics={parsedState.lyrics}
                  style={parsedState.style}
                  cardRef={cardRef}
                  fontSchemePreview={fontSchemePreview}
                  showFontSchemePreview={steps[currentStep]?.id === "font"}
                  locale={locale}
                  t={t}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {toast ? (
        <div
          role="status"
          className="status-info fixed bottom-5 left-1/2 z-[130] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function createInitialState(locale: WebLiteLocale): AppState {
  return {
    ...defaultState,
    locale,
    song: { ...defaultState.song, source: "unknown" },
    style: {
      ...defaultState.style,
      fontScheme: defaultState.style.fontScheme ? { ...defaultState.style.fontScheme } : undefined,
      instrumentalText: DEFAULT_INSTRUMENTAL_TEXT[locale],
      showPlatformBadge: false,
      extractedPalette: { ...DEFAULT_PALETTE, colors: [...DEFAULT_PALETTE.colors] }
    },
    lastPortraitSize: defaultState.lastPortraitSize ? { ...defaultState.lastPortraitSize } : undefined,
    lastLandscapeSize: defaultState.lastLandscapeSize ? { ...defaultState.lastLandscapeSize } : undefined,
    palette: { ...DEFAULT_PALETTE, colors: [...DEFAULT_PALETTE.colors] }
  };
}

function readPreferences(): WebLitePreferences {
  const browserLocale: WebLiteLocale =
    typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  const fallback: WebLitePreferences = {
    version: 1,
    locale: browserLocale,
    exportQuality: "high"
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || "{}") as Partial<WebLitePreferences>;
    return {
      version: 1,
      locale: parsed.locale === "zh" || parsed.locale === "en" ? parsed.locale : fallback.locale,
      exportQuality: parsed.exportQuality === "medium" || parsed.exportQuality === "high" ? parsed.exportQuality : "high"
    };
  } catch {
    return fallback;
  }
}
