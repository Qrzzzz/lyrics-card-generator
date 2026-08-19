"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { ExportCardHost } from "@/components/editor/ExportCardHost";
import { AutoWidthMeasurementHost } from "@/components/editor/AutoWidthMeasurementHost";
import { AppToast, type ToastNotice, type ToastTone } from "@/components/feedback/AppToast";
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
import { useMeasuredAutoCanvasWidth } from "@/components/editor/hooks/useMeasuredAutoCanvasWidth";
import {
  getLiveExportCardValidation,
  useExportCardReadiness
} from "@/components/editor/hooks/useExportCardReadiness";
import {
  useCoverPalette,
  useResolvedTextColor
} from "@/components/editor/hooks/useLyricEditorEffects";
import { clearLyricContent, hasClearableLyricContent } from "@/lib/clear-content";
import { applyEditorStyleChange } from "@/lib/editor/apply-style-change";
import { exportNodeAsImage } from "@/lib/export-image";
import { createExportSnapshot, snapshotAsAppState, type ExportSnapshot } from "@/lib/export-snapshot";
import { resolveExportSafetyMessage } from "@/lib/export-safety";
import {
  ExportTransactionMutex,
  runExportTransaction,
  waitForExportSnapshotNode
} from "@/lib/export-transaction";
import { createT } from "@/lib/i18n";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import { resolveUiAccentColor } from "@/lib/settings/accent";
import { documentLanguageForLocale } from "@/lib/locale-language";
import {
  DEFAULT_USER_SETTINGS,
  getExportPixelRatio,
  type ExportFormatId,
  type ExportQualityId,
  type UserSettings
} from "@/lib/settings/types";
import type {
  AppState,
  CardStyle,
  FontScheme,
  SongInfo
} from "@/lib/types";
import { WebLiteFontPanel } from "@/web-lite/WebLiteFontPanel";
import { WebLiteHeader } from "@/web-lite/WebLiteHeader";
import { WebLiteLyricInput } from "@/web-lite/WebLiteLyricInput";
import { WebLiteSongInfo } from "@/web-lite/WebLiteSongInfo";
import {
  detectWebLiteLocale,
  isWebLiteLocale,
  webLiteCopy,
  type WebLiteLocale
} from "@/web-lite/copy";

const PREFERENCES_KEY = "lyrics-card-web-lite-preferences-v1";
const EXPORT_QUALITY_OPTIONS = ["medium", "high"] as const;
// Web Lite intentionally pins desktop-only capabilities to a portable browser-safe subset.
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
  exportFormat: ExportFormatId;
  exportQuality: Extract<ExportQualityId, "medium" | "high">;
};

export function WebLiteEditor() {
  const initialPreferences = useMemo(readPreferences, []);
  const [state, setState] = useState<AppState>(() => createInitialState(initialPreferences.locale));
  const [currentStep, setCurrentStep] = useState(0);
  const [fontSchemePreview, setFontSchemePreview] = useState<FontScheme | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [exportFormat, setExportFormat] = useState<ExportFormatId>(initialPreferences.exportFormat);
  const [exportQuality, setExportQuality] = useState<Extract<ExportQualityId, "medium" | "high">>(
    initialPreferences.exportQuality
  );
  const [isExporting, setIsExporting] = useState(false);
  const [activeExportSnapshot, setActiveExportSnapshot] = useState<ExportSnapshot | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [clearTransitionKey, setClearTransitionKey] = useState(0);
  const [hasPendingSongInput, setHasPendingSongInput] = useState(false);
  const [coverResetGeneration, setCoverResetGeneration] = useState(0);
  const cardRef = useRef<HTMLElement | null>(null);
  const exportCardRef = useRef<HTMLElement | null>(null);
  const autoWidthMeasurementRef = useRef<HTMLDivElement | null>(null);
  const captureCardRef = useRef<HTMLElement | null>(null);
  const exportMutexRef = useRef(new ExportTransactionMutex());
  // Refs keep the export transaction isolated from subsequent live-editor renders.
  const exportRevisionRef = useRef(0);
  const previousExportStateRef = useRef<AppState | null>(null);
  const toastIdRef = useRef(0);
  const localCoverObjectUrlRef = useRef<string | undefined>(undefined);
  const coverValidationGenerationRef = useRef(0);
  const locale: WebLiteLocale = state.locale;
  const copy = webLiteCopy[locale];
  const t = useMemo(() => createT(locale), [locale]);
  const activeCover = state.song.proxiedCoverUrl || state.song.coverUrl || "";

  useCoverPalette(activeCover, setState);
  useResolvedTextColor(state, setState);
  const autoWidthReadiness = useMeasuredAutoCanvasWidth(state, setState, autoWidthMeasurementRef);

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
  // The revision follows semantic state identity without scheduling another render.
  if (previousExportStateRef.current !== parsedState) {
    previousExportStateRef.current = parsedState;
    exportRevisionRef.current += 1;
  }
  const { store: exportReadinessStore } = useExportCardReadiness({
    state: parsedState,
    setState,
    exportCardRef,
    isAutoWidthStable: autoWidthReadiness.isStable
  });
  const accentColor = resolveUiAccentColor({
    settings: WEB_LITE_SETTINGS,
    palette: state.palette
  });

  useEffect(() => {
    document.documentElement.lang = documentLanguageForLocale(locale);
    document.title = copy.documentTitle;
    document.body.dataset.uiTheme = "dark";
    document.body.dataset.desktopShell = "false";

    return () => {
      delete document.body.dataset.uiTheme;
      delete document.body.dataset.desktopShell;
    };
  }, [copy.documentTitle, locale]);

  useEffect(() => {
    const preferences: WebLitePreferences = {
      version: 1,
      locale,
      exportFormat,
      exportQuality
    };

    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Web Lite remains fully usable when storage is blocked.
    }
  }, [exportFormat, exportQuality, locale]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3600);
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
      // Preserve user-authored instrumental copy while translating untouched defaults.
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

  function showToast(message: string, tone: ToastTone) {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, tone });
  }

  function clearAllContent() {
    if (!hasClearableLyricContent(state) && !hasPendingSongInput) {
      showToast(copy.clearAlreadyEmpty, "success");
      return;
    }

    invalidateCoverValidationAndResetSongInfo();
    revokeLocalCoverObjectUrl();
    setFontSchemePreview(null);
    setClearTransitionKey((key) => key + 1);
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
    // Ignore validation that completed after the input, cover, or editor was reset.
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
    // AppState and CardStyle retain mirrored translation fields for desktop compatibility.
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
    const liveValidation = getLiveExportCardValidation(
      parsedState,
      exportCardRef.current,
      autoWidthReadiness.isStable
    );
    const liveBlockingMessage = liveValidation.blockingReason
      ? resolveExportSafetyMessage(liveValidation.blockingReason, liveValidation.lineStatus.totalLineCount, t)
      : (() => {
          const readiness = exportReadinessStore.getSnapshot();
          return readiness.blockingReason
            ? resolveExportSafetyMessage(readiness.blockingReason, readiness.lineStatus.totalLineCount, t)
            : undefined;
        })();
    if (liveBlockingMessage) {
      showToast(liveBlockingMessage, "warning");
      return;
    }

    // Capture an immutable document revision before mounting the offscreen export card.
    const snapshot = createExportSnapshot(
      parsedState,
      getExportPixelRatio(exportQuality),
      exportRevisionRef.current,
      exportFormat
    );
    // The mutex serializes mount, validation, capture, and guaranteed unmount as one transaction.
    const result = await runExportTransaction({
      mutex: exportMutexRef.current,
      snapshot,
      mountSnapshot: async (mountedSnapshot, signal) => {
        setIsExporting(true);
        setActiveExportSnapshot(mountedSnapshot);
        return waitForExportSnapshotNode(() => captureCardRef.current, mountedSnapshot.id, signal);
      },
      validateSnapshot: (mountedSnapshot) => {
        const snapshotState = snapshotAsAppState(mountedSnapshot, parsedState);
        const validation = getLiveExportCardValidation(snapshotState, captureCardRef.current);
        return validation.blockingReason
          ? resolveExportSafetyMessage(validation.blockingReason, validation.lineStatus.totalLineCount, t)
          : null;
      },
      captureSnapshot: (mountedSnapshot, node, signal) => exportNodeAsImage(
        node,
        mountedSnapshot.fileName,
        mountedSnapshot.format,
        mountedSnapshot.width,
        mountedSnapshot.height,
        mountedSnapshot.pixelRatio,
        signal
      ),
      unmountSnapshot: () => {
        setActiveExportSnapshot(null);
        setIsExporting(false);
      }
    });

    if (result.ok) {
      showToast(copy.exportReady, "success");
    } else if (result.kind === "busy") {
      showToast(t("exportBusy"), "warning");
    } else if (result.kind === "blocked") {
      showToast(result.reason, "warning");
    } else {
      console.error("[Lyrics Card Generator Web Lite] export failed", result.error);
      showToast(copy.exportFailed, "error");
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
          onTransientStateChange={setHasPendingSongInput}
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
        <WebLiteLyricInput
          lyrics={state.lyrics}
          onLyricsChange={setLyrics}
          translationEnabled={state.style.translationEnabled}
          translationText={state.style.translationText}
          onTranslationEnabledChange={setTranslationEnabled}
          onTranslationTextChange={setTranslationText}
          onSplitAlternatingLyrics={splitAlternatingLyrics}
          themeColor={accentColor}
          contentMode={state.style.contentMode}
          locale={locale}
          t={t}
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
      isComplete: true,
      primaryAction: {
        label: t("step.complete"),
        onClick: completeAndExport,
        disabled: isExporting,
        readinessStore: exportReadinessStore
      },
      content: (
        <ExportPanel
          t={t}
          accentColor={accentColor}
          exportFormat={exportFormat}
          onExportFormatChange={setExportFormat}
          exportQuality={exportQuality}
          onExportQualityChange={(quality) => {
            if (quality === "medium" || quality === "high") {
              setExportQuality(quality);
            }
          }}
          qualityOptions={EXPORT_QUALITY_OPTIONS}
          qualityLabels={{ medium: copy.exportStandard, high: copy.exportHigh }}
          isExporting={isExporting}
          readinessStore={exportReadinessStore}
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

              <div className="grid min-w-0 max-w-full gap-5">
                <MotionPanel className="grid min-w-0 gap-4">
                  <SettingsStepper
                    steps={steps}
                    currentStep={currentStep}
                    onStepChange={setCurrentStep}
                    backText={t("step.back")}
                    nextText={t("step.next")}
                    themeColor={accentColor}
                    companionAside={
                      <PreviewPane
                        isPreviewVisible={isPreviewVisible}
                        onPreviewVisibleChange={setIsPreviewVisible}
                        song={parsedState.song}
                        lyrics={parsedState.lyrics}
                        style={parsedState.style}
                        coverArtwork={parsedState.coverArtwork}
                        cardRef={cardRef}
                        fontSchemePreview={fontSchemePreview}
                        clearTransitionKey={clearTransitionKey}
                        pressureEnabled={currentStep >= 2}
                        locale={locale}
                        t={t}
                      />
                    }
                  />
                </MotionPanel>
              </div>
            </div>
          </div>
        </div>
      </main>

      <ExportCardHost
        song={parsedState.song}
        lyrics={parsedState.lyrics}
        style={parsedState.style}
        coverArtwork={parsedState.coverArtwork}
        exportCardRef={exportCardRef}
        locale={parsedState.locale}
      />
      <AutoWidthMeasurementHost state={state} hostRef={autoWidthMeasurementRef} />
      {/* Snapshot exports use a separate DOM tree so live preview changes cannot alter capture pixels. */}
      {activeExportSnapshot ? (
        <ExportCardHost
          song={activeExportSnapshot.song as SongInfo}
          lyrics={activeExportSnapshot.lyrics}
          style={activeExportSnapshot.style as CardStyle}
          coverArtwork={activeExportSnapshot.coverArtwork as AppState["coverArtwork"]}
          exportCardRef={captureCardRef}
          locale={activeExportSnapshot.locale}
          snapshotId={activeExportSnapshot.id}
        />
      ) : null}

      <AppToast notice={toast} />
    </div>
  );
}

function createInitialState(locale: WebLiteLocale): AppState {
  // Clone the nested song, style, size, and palette objects that Web Lite mutates during a session.
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
  const browserLocale = detectWebLiteLocale(
    typeof navigator !== "undefined" ? navigator.languages?.[0] || navigator.language : "en"
  );
  const fallback: WebLitePreferences = {
    version: 1,
    locale: browserLocale,
    exportFormat: "png",
    exportQuality: "high"
  };

  // Server rendering and unavailable storage both fall back to detected, validated defaults.
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || "{}") as Partial<WebLitePreferences>;
    return {
      version: 1,
      locale: isWebLiteLocale(parsed.locale) ? parsed.locale : fallback.locale,
      exportFormat: parsed.exportFormat === "webp" || parsed.exportFormat === "jpg" ? parsed.exportFormat : "png",
      exportQuality: parsed.exportQuality === "medium" || parsed.exportQuality === "high" ? parsed.exportQuality : "high"
    };
  } catch {
    return fallback;
  }
}
