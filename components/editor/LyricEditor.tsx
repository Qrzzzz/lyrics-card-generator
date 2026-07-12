"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { ExamplesFloor } from "@/components/editor/ExamplesFloor";
import { ExportCelebration } from "@/components/effects/ExportCelebration";
import { AppToast, type ToastNotice } from "@/components/feedback/AppToast";
import {
  DEFAULT_INSTRUMENTAL_TEXT,
  defaultState
} from "@/components/editor/editor-defaults";
import { useEditorSteps } from "@/components/editor/useEditorSteps";
import {
  useEditorAiTranslation
} from "@/components/editor/hooks/useEditorAiTranslation";
import { useEditorActions } from "@/components/editor/hooks/useEditorActions";
import { useEditorPreferences } from "@/components/editor/hooks/useEditorPreferences";
import { AppMotionProvider } from "@/components/motion/AppMotionProvider";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PreviewPane } from "@/components/editor/PreviewPane";
import { ExportCardHost } from "@/components/editor/ExportCardHost";
import { SettingsStepper, type SettingsStep } from "@/components/editor/SettingsStepper";
import { SettingsSurface } from "@/components/settings/SettingsSurface";
import type { SettingsTabId } from "@/components/settings/settings-model";
import { FirstLaunchLanguageDialog } from "@/components/settings/FirstLaunchLanguageDialog";
import {
  useCoverPalette,
  useResolvedTextColor,
  useSyncedCoverProxy
} from "@/components/editor/hooks/useLyricEditorEffects";
import { resolveEditorThemeTokens } from "@/components/editor/resolveEditorThemeTokens";
import { useMeasuredAutoCanvasHeight } from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";
import {
  getLiveExportCardValidation,
  useExportCardReadiness,
  type ExportCardBlockingReason
} from "@/components/editor/hooks/useExportCardReadiness";
import { ClickSpark } from "@/components/layout/ClickSpark";
import { DesktopTitleBar } from "@/components/layout/DesktopTitleBar";
import { DynamicAppBackground } from "@/components/layout/DynamicAppBackground";
import { createT } from "@/lib/i18n";
import { proxiedImageUrl } from "@/lib/image-utils";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import { settingsCopy } from "@/lib/settings/copy";
import { resolveUiAccentColor } from "@/lib/settings/accent";
import { DEFAULT_USER_SETTINGS, getExportPixelRatio, type ExportQualityId } from "@/lib/settings/types";
import { resolveEffectiveUiThemeId } from "@/lib/settings/user-settings";
import type { AppState, FontScheme, Locale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { snapshotAsAppState } from "@/lib/export-snapshot";
import { resolveExportSafetyMessage } from "@/lib/export-safety";

type ActiveSurface = "editor" | "examples" | "settings";

const surfaceTransition: Transition = {
  type: "spring",
  stiffness: 165,
  damping: 28,
  mass: 1.05,
  restDelta: 0.001
};

const reducedSurfaceTransition: Transition = {
  duration: 0.01
};

export function LyricEditor() {
  const [state, setState] = useState<AppState>(defaultState);
  const [currentStep, setCurrentStep] = useState(0);
  const [fontSchemePreview, setFontSchemePreview] = useState<FontScheme | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [activeSurface, setActiveSurface] = useState<ActiveSurface>("editor");
  const [requestedSettingsTab, setRequestedSettingsTab] = useState<SettingsTabId>();
  const [exportQuality, setExportQuality] = useState<ExportQualityId>(DEFAULT_USER_SETTINGS.defaultExportQuality);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const exportCardRef = useRef<HTMLElement | null>(null);
  const captureCardRef = useRef<HTMLElement | null>(null);
  const previewCardRef = useRef<HTMLElement | null>(null);
  const toastIdRef = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const headerRailRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreSettingsFocusRef = useRef(false);
  const invalidateDocumentAsyncRef = useRef<() => void>(() => undefined);
  const [headerDockY, setHeaderDockY] = useState(0);
  const t = useMemo(() => createT(state.locale), [state.locale]);
  const systemShouldReduceMotion = useReducedMotion() ?? false;
  const isExamplesSurfaceOpen = activeSurface === "examples";
  const isSettingsSurfaceOpen = activeSurface === "settings";
  const isEditorSurfaceActive = activeSurface === "editor";

  const parsedState = useMemo(
    () => ({
      ...state,
      style: {
        ...state.style,
        extractedPalette: state.palette ?? DEFAULT_PALETTE
      }
    }),
    [state]
  );
  const coverForPalette = state.song.proxiedCoverUrl || proxiedImageUrl(state.song.coverUrl);
  const canFetchLyrics = Boolean(state.song.originalUrl && state.song.title.trim());

  useSyncedCoverProxy(state, setState);
  useCoverPalette(coverForPalette, setState);
  useResolvedTextColor(state, setState);
  useMeasuredAutoCanvasHeight(state, setState, exportCardRef);
  const exportReadiness = useExportCardReadiness({ state: parsedState, exportCardRef });
  const exportBlockMessage = exportReadiness.blockingReason
    ? resolveExportSafetyMessage(exportReadiness.blockingReason, exportReadiness.lineStatus.totalLineCount, t)
    : undefined;
  const {
    userSettings,
    backgroundImageUrl,
    isDesktopShell,
    isFirstLaunchOpen,
    preferencesLoaded,
    previewUserSettings,
    commitUserSettings: updateUserSettings,
    setLocale,
    chooseFirstLaunchLanguage
  } = useEditorPreferences({
    currentLocale: state.locale,
    applyLocale
  });
  const shouldReduceMotion = userSettings.reduceMotionEnabled || systemShouldReduceMotion;
  const activeSurfaceTransition = shouldReduceMotion ? reducedSurfaceTransition : surfaceTransition;
  const resolvedAccentColor = resolveUiAccentColor({
    settings: userSettings,
    palette: state.palette
  });
  const effectiveUiThemeId = resolveEffectiveUiThemeId(userSettings);
  const exportPixelRatio = getExportPixelRatio(exportQuality);

  function showToast(message: string) {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      setToast(null);
      return;
    }

    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message: normalizedMessage });
  }

  const {
    celebrationKey,
    isCompleteExporting,
    clearTransitionKey,
    activeExportSnapshot,
    documentRevision,
    beginSongImport,
    clearAllContent,
    handleStyleChange,
    setTranslation,
    setUrl,
    applyParsedSong,
    applyLocalAudio,
    applySearchedSong,
    setSong,
    setLyrics,
    setTranslationEnabled,
    setTranslationText,
    splitAlternatingLyrics,
    applyFetchedLyrics,
    loadExample,
    completeAndExport
  } = useEditorActions({
    parsedState,
    setState,
    cardRef: captureCardRef,
    exportPixelRatio,
    exportBlockMessage,
    getExportBlockMessage: (snapshot) => {
      const validationState = snapshot ? snapshotAsAppState(snapshot, parsedState) : parsedState;
      const validation = getLiveExportCardValidation(
        validationState,
        snapshot ? captureCardRef.current : exportCardRef.current
      );
      return validation.blockingReason
        ? resolveExportSafetyMessage(validation.blockingReason, validation.lineStatus.totalLineCount, t)
        : undefined;
    },
    exampleLoadedMessage: settingsCopy[state.locale].exampleLoaded,
    clearAlreadyEmptyMessage: settingsCopy[state.locale].clearAlreadyEmpty,
    exportBusyMessage: t("exportBusy"),
    exportFailedMessage: (detail) => t("exportFailed", { detail }),
    confirmReplaceDocument: () => window.confirm(t("replaceDocumentConfirm")),
    onNotify: showToast,
    onCloseExamples: () => setActiveSurface("editor"),
    onClearTransientState: () => setFontSchemePreview(null),
    onInvalidateDocument: () => invalidateDocumentAsyncRef.current()
  });

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setExportQuality(userSettings.defaultExportQuality);
  }, [userSettings.defaultExportQuality]);

  useEffect(() => {
    setState((current) => {
      const showGeneratedWatermark = userSettings.defaultShowGeneratedWatermark;
      const showSharedBy = userSettings.defaultShowSharedBy;
      const sharedByText = userSettings.defaultSharedByText;
      if (
        current.style.showGeneratedWatermark === showGeneratedWatermark &&
        current.style.showWatermark === showGeneratedWatermark &&
        current.style.showSharedBy === showSharedBy &&
        current.style.sharedByText === sharedByText
      ) {
        return current;
      }

      return {
        ...current,
        style: {
          ...current.style,
          showGeneratedWatermark,
          showWatermark: showGeneratedWatermark,
          showSharedBy,
          sharedByText
        }
      };
    });
  }, [
    userSettings.defaultShowGeneratedWatermark,
    userSettings.defaultShowSharedBy,
    userSettings.defaultSharedByText
  ]);

  useEffect(() => {
    const measureDockY = () => {
      const stage = stageRef.current;
      const headerRail = headerRailRef.current;

      if (!stage || !headerRail) {
        return;
      }

      setHeaderDockY(Math.max(0, stage.clientHeight - headerRail.offsetHeight));
    };

    measureDockY();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureDockY);
      return () => window.removeEventListener("resize", measureDockY);
    }

    const observer = new ResizeObserver(measureDockY);
    if (stageRef.current) {
      observer.observe(stageRef.current);
    }
    if (headerRailRef.current) {
      observer.observe(headerRailRef.current);
    }
    window.addEventListener("resize", measureDockY);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureDockY);
    };
  }, []);

  useEffect(() => {
    if (!isExamplesSurfaceOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveSurface("editor");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExamplesSurfaceOpen]);

  useEffect(() => {
    if (!isEditorSurfaceActive || !restoreSettingsFocusRef.current) return;
    restoreSettingsFocusRef.current = false;
    setRequestedSettingsTab(undefined);
    const frame = window.requestAnimationFrame(() => settingsButtonRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [isEditorSurfaceActive]);

  const {
    aiCopy,
    aiSettings,
    isAITranslateOpen,
    isAITranslating,
    aiStreamingText,
    aiReasoningText,
    aiTranslationPhase,
    aiError,
    openAITranslate,
    closeAITranslate,
    translateWithAI,
    cancelAITranslation,
    setAISettings
  } = useEditorAiTranslation({
    locale: state.locale,
    lyrics: state.lyrics,
    translation: {
      text: state.style.translationText,
      enabled: state.style.translationEnabled
    },
    setTranslation,
    onNotify: showToast,
    onRequireSettings: () => openSettings("ai")
  });
  invalidateDocumentAsyncRef.current = cancelAITranslation;

  function openSettings(tab?: SettingsTabId) {
    setRequestedSettingsTab(tab);
    setActiveSurface("settings");
  }

  function closeSettings() {
    restoreSettingsFocusRef.current = true;
    setActiveSurface("editor");
  }

  function applyLocale(locale: Locale) {
    setState((current) => {
      const previousDefaultInstrumentalTexts = Object.values(DEFAULT_INSTRUMENTAL_TEXT);
      const shouldUpdateInstrumentalText = previousDefaultInstrumentalTexts.includes(current.style.instrumentalText);

      return {
        ...current,
        locale,
        style: {
          ...current.style,
          instrumentalText: shouldUpdateInstrumentalText ? DEFAULT_INSTRUMENTAL_TEXT[locale] : current.style.instrumentalText
        }
      };
    });
  }

  const settingsSteps: SettingsStep[] = useEditorSteps({
    state,
    t,
    canFetchLyrics,
    themeColor: resolvedAccentColor,
    isExporting: isCompleteExporting,
    exportBlockingMessage: exportBlockMessage,
    exportQuality,
    lyricsLayout: {
      lineStatus: exportReadiness.lineStatus
    },
    documentRevision,
    ai: {
      isOpen: isAITranslateOpen,
      isTranslating: isAITranslating,
      streamingText: aiStreamingText,
      reasoningText: aiReasoningText,
      phase: aiTranslationPhase,
      error: aiError,
      defaultStyle: aiSettings.defaultStyle,
      reasoningEnabled: aiSettings.reasoningEnabled,
      promptLibrary: aiSettings.promptLibrary
    },
    handlers: {
      onUrlChange: setUrl,
      onBeginSongImport: beginSongImport,
      onSearchedSongResolved: applySearchedSong,
      onSongParsed: applyParsedSong,
      onLocalAudioParsed: applyLocalAudio,
      onSongChange: setSong,
      onUseFetchedLyrics: applyFetchedLyrics,
      onLyricsChange: setLyrics,
      onTranslationEnabledChange: setTranslationEnabled,
      onTranslationTextChange: setTranslationText,
      onSplitAlternatingLyrics: splitAlternatingLyrics,
      onOpenAiTranslate: openAITranslate,
      onCloseAiTranslate: closeAITranslate,
      onCancelAiTranslate: cancelAITranslation,
      onConfirmAiTranslate: translateWithAI,
      onStyleChange: handleStyleChange,
      onFontSchemePreviewChange: setFontSchemePreview,
      onExportQualityChange: setExportQuality,
      onExport: completeAndExport
    }
  });
  const activeSettingsStep = settingsSteps[currentStep] ?? settingsSteps[0];
  const activePresentation = activeSettingsStep?.presentation ?? "preview-workbench";
  const isLyricsWorkspace = activePresentation === "lyrics-workspace";
  const isLyricsImmersive = isLyricsWorkspace;
  const usesCompactLyricsChrome = isLyricsWorkspace;
  const showVisiblePreview = activePresentation === "preview-workbench";

  const { resolvedThemeTokens, customThemeTokens } = resolveEditorThemeTokens({
    userSettings,
    palette: state.palette
  });

  return (
    <AppMotionProvider reduceMotion={userSettings.reduceMotionEnabled} ready={preferencesLoaded}>
      <div
        className="app-shell min-h-screen"
        data-ui-theme={effectiveUiThemeId}
        data-desktop-shell={isDesktopShell ? "true" : "false"}
        data-reduce-motion={!preferencesLoaded || shouldReduceMotion ? "true" : "false"}
        style={{
          "--app-font-family": userSettings.uiFontFamily || undefined,
          "--app-accent": resolvedAccentColor,
          ...resolvedThemeTokens,
          ...customThemeTokens
        } as unknown as React.CSSProperties}
      >
      <DesktopTitleBar locale={state.locale} />
      <DynamicAppBackground palette={state.palette} settings={userSettings} imageUrl={backgroundImageUrl} />
      <ClickSpark enabled={userSettings.sparkCursorEnabled} themeColor={resolvedAccentColor}>
        <main className="app-main-content lyric-editor-main relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
          <div ref={stageRef} className="lyric-editor-stage relative mx-auto min-w-0 max-w-[1520px] overflow-clip">
            <ExamplesFloor
              isActive={isExamplesSurfaceOpen}
              locale={state.locale}
              onLoad={loadExample}
              transition={activeSurfaceTransition}
            />

            <motion.div
              data-testid="editor-surface"
              aria-hidden={!isEditorSurfaceActive}
              className={cn(
                "relative z-10 h-full min-h-0",
                isLyricsWorkspace ? "overflow-hidden" : "overflow-y-auto",
                isEditorSurfaceActive ? "pointer-events-auto" : "pointer-events-none"
              )}
              animate={{
                x: isSettingsSurfaceOpen ? "-100%" : "0%",
                y: isExamplesSurfaceOpen ? "100%" : "0%",
                opacity: isEditorSurfaceActive ? 1 : shouldReduceMotion ? 0 : 0.35,
                scale: isEditorSurfaceActive ? 1 : shouldReduceMotion ? 1 : 0.985
              }}
              initial={false}
              inert={!isEditorSurfaceActive ? true : undefined}
              transition={activeSurfaceTransition}
            >
              <div
                className={cn(
                  "grid min-w-0 max-w-full gap-5",
                  isLyricsWorkspace && "h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]",
                  isLyricsImmersive && "grid-rows-[minmax(0,1fr)] gap-0"
                )}
                data-editor-presentation={activePresentation}
                data-lyrics-viewport-mode={isLyricsWorkspace ? "immersive" : undefined}
              >
                <div className={cn(isExamplesSurfaceOpen && "invisible", isLyricsImmersive && "hidden")}>
                  <EditorHeader
                    locale={state.locale}
                    t={t}
                    mode="normal"
                    density={usesCompactLyricsChrome ? "compact" : "normal"}
                    onOpenExamples={() => setActiveSurface("examples")}
                    onClearAll={clearAllContent}
                    onOpenSettings={openSettings}
                    settingsButtonRef={settingsButtonRef}
                  />
                </div>

                <div
                  className={cn(
                    "grid min-w-0 max-w-full gap-5",
                    isLyricsWorkspace && "h-full min-h-0",
                    isLyricsWorkspace
                      ? "grid-cols-1"
                      : showVisiblePreview
                        ? "lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]"
                        : "min-[960px]:grid-cols-[minmax(0,1fr)_320px] min-[1180px]:grid-cols-[minmax(0,1fr)_360px] min-[1440px]:grid-cols-[minmax(0,1fr)_400px]"
                  )}
                >
                  <MotionPanel
                    className={cn(
                      "grid min-w-0 gap-4",
                      isLyricsWorkspace && "h-full min-h-0",
                      showVisiblePreview ? "order-2 lg:order-1" : "order-1"
                    )}
                  >
                    <SettingsStepper
                      steps={settingsSteps}
                      currentStep={currentStep}
                      onStepChange={setCurrentStep}
                      backText={t("step.back")}
                      nextText={t("step.next")}
                      themeColor={resolvedAccentColor}
                      compactChrome={usesCompactLyricsChrome}
                    />
                  </MotionPanel>

                  {showVisiblePreview ? (
                    <PreviewPane
                      isPreviewVisible={isPreviewVisible}
                      onPreviewVisibleChange={setIsPreviewVisible}
                      song={parsedState.song}
                      lyrics={parsedState.lyrics}
                      style={parsedState.style}
                      cardRef={previewCardRef}
                      fontSchemePreview={fontSchemePreview}
                      clearTransitionKey={clearTransitionKey}
                      locale={state.locale}
                      t={t}
                    />
                  ) : activeSettingsStep?.aside ? (
                    <MotionPanel
                      className={cn(
                        "order-2 min-h-0 min-w-0 self-start",
                        isLyricsWorkspace && "h-full self-stretch"
                      )}
                    >
                      {activeSettingsStep.aside}
                    </MotionPanel>
                  ) : null}
                </div>
              </div>
            </motion.div>

            <ExportCardHost
              song={parsedState.song}
              lyrics={parsedState.lyrics}
              style={parsedState.style}
              exportCardRef={exportCardRef}
              locale={parsedState.locale}
            />
            {activeExportSnapshot ? (
              <ExportCardHost
                song={activeExportSnapshot.song as AppState["song"]}
                lyrics={activeExportSnapshot.lyrics}
                style={activeExportSnapshot.style as AppState["style"]}
                exportCardRef={captureCardRef}
                locale={activeExportSnapshot.locale}
                snapshotId={activeExportSnapshot.id}
              />
            ) : null}

            <SettingsSurface
              isActive={isSettingsSurfaceOpen}
              requestedTab={requestedSettingsTab}
              locale={state.locale}
              userSettings={userSettings}
              transition={activeSurfaceTransition}
              onLocaleChange={setLocale}
              onUserSettingsPreview={previewUserSettings}
              onUserSettingsChange={updateUserSettings}
              onClose={closeSettings}
              onSaved={(settings, message) => {
                setAISettings(settings);
                showToast(message || aiCopy.settingsSaved);
              }}
              onNotify={showToast}
            />

            <motion.div
              aria-hidden={!isExamplesSurfaceOpen}
              ref={headerRailRef}
              className={[
                "absolute left-0 right-0 z-30",
                isExamplesSurfaceOpen ? "pointer-events-auto" : "pointer-events-none"
              ].join(" ")}
              style={{ top: 0 }}
              animate={{
                y: isExamplesSurfaceOpen ? headerDockY : 0,
                opacity: isExamplesSurfaceOpen ? 1 : 0
              }}
              initial={false}
              inert={!isExamplesSurfaceOpen ? true : undefined}
              transition={activeSurfaceTransition}
            >
              <EditorHeader
                locale={state.locale}
                t={t}
                mode={isExamplesSurfaceOpen ? "examplesDocked" : "normal"}
                onOpenExamples={() => setActiveSurface("examples")}
                onClearAll={clearAllContent}
                onOpenSettings={openSettings}
                onCloseSurface={() => setActiveSurface("editor")}
              />
            </motion.div>
          </div>
        </main>
      </ClickSpark>
      <FirstLaunchLanguageDialog open={isFirstLaunchOpen} locale={state.locale} onChoose={chooseFirstLaunchLanguage} />
      <AppToast notice={toast} accentColor={resolvedAccentColor} />
        <ExportCelebration burstKey={celebrationKey} accentColor={resolvedAccentColor} />
      </div>
    </AppMotionProvider>
  );
}
