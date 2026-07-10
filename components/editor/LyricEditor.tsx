"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { ExamplesFloor } from "@/components/editor/ExamplesFloor";
import { ExportCelebration } from "@/components/effects/ExportCelebration";
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
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PreviewPane } from "@/components/editor/PreviewPane";
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
  const [toast, setToast] = useState("");
  const cardRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const headerRailRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreSettingsFocusRef = useRef(false);
  const [headerDockY, setHeaderDockY] = useState(0);
  const t = useMemo(() => createT(state.locale), [state.locale]);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const isExamplesSurfaceOpen = activeSurface === "examples";
  const isSettingsSurfaceOpen = activeSurface === "settings";
  const isEditorSurfaceActive = activeSurface === "editor";
  const activeSurfaceTransition = shouldReduceMotion ? reducedSurfaceTransition : surfaceTransition;

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
  useMeasuredAutoCanvasHeight(state, setState, cardRef);
  const {
    userSettings,
    backgroundImageUrl,
    isDesktopShell,
    isFirstLaunchOpen,
    previewUserSettings,
    commitUserSettings: updateUserSettings,
    setLocale,
    chooseFirstLaunchLanguage
  } = useEditorPreferences({
    currentLocale: state.locale,
    applyLocale
  });
  const resolvedAccentColor = resolveUiAccentColor({
    settings: userSettings,
    palette: state.palette
  });
  const effectiveUiThemeId = resolveEffectiveUiThemeId(userSettings);
  const exportPixelRatio = getExportPixelRatio(exportQuality);
  const {
    celebrationKey,
    isCompleteExporting,
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
    loadExample,
    completeAndExport
  } = useEditorActions({
    parsedState,
    setState,
    cardRef,
    exportPixelRatio,
    exampleLoadedMessage: settingsCopy[state.locale].exampleLoaded,
    onNotify: setToast,
    onCloseExamples: () => setActiveSurface("editor"),
    onClearTransientState: () => setFontSchemePreview(null)
  });

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setExportQuality(userSettings.defaultExportQuality);
  }, [userSettings.defaultExportQuality]);

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
    const frame = window.requestAnimationFrame(() => settingsButtonRef.current?.focus());
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
    onNotify: setToast,
    onRequireSettings: () => openSettings("ai")
  });

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
    cardRef,
    isExporting: isCompleteExporting,
    exportQuality,
    ai: {
      isOpen: isAITranslateOpen,
      isTranslating: isAITranslating,
      streamingText: aiStreamingText,
      reasoningText: aiReasoningText,
      phase: aiTranslationPhase,
      error: aiError,
      defaultStyle: aiSettings.defaultStyle,
      reasoningEnabled: aiSettings.reasoningEnabled
    },
    handlers: {
      onUrlChange: setUrl,
      onSearchedSongResolved: applySearchedSong,
      onSongParsed: applyParsedSong,
      onLocalAudioParsed: applyLocalAudio,
      onSongChange: setSong,
      onUseFetchedLyrics: setLyrics,
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
  const { resolvedThemeTokens, customThemeTokens } = resolveEditorThemeTokens({
    userSettings,
    palette: state.palette
  });

  return (
    <div
      className="app-shell min-h-screen"
      data-ui-theme={effectiveUiThemeId}
      data-desktop-shell={isDesktopShell ? "true" : "false"}
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
          <div ref={stageRef} className="lyric-editor-stage relative mx-auto min-w-0 max-w-[1520px] overflow-hidden">
            <ExamplesFloor
              isActive={isExamplesSurfaceOpen}
              locale={state.locale}
              onLoad={loadExample}
              transition={activeSurfaceTransition}
            />

            <motion.div
              data-testid="editor-surface"
              aria-hidden={!isEditorSurfaceActive}
              className={[
                "relative z-10 h-full min-h-0 overflow-y-auto",
                isEditorSurfaceActive ? "pointer-events-auto" : "pointer-events-none"
              ].join(" ")}
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
              <div className="grid min-w-0 max-w-full gap-5">
                <div className={isExamplesSurfaceOpen ? "invisible" : ""}>
                  <EditorHeader
                    locale={state.locale}
                    t={t}
                    mode="normal"
                    onOpenExamples={() => setActiveSurface("examples")}
                    onClearAll={clearAllContent}
                    onOpenSettings={openSettings}
                    settingsButtonRef={settingsButtonRef}
                  />
                </div>

                <div className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
                  <MotionPanel className="order-2 grid min-w-0 gap-4 lg:order-1">
                    <SettingsStepper
                      steps={settingsSteps}
                      currentStep={currentStep}
                      onStepChange={setCurrentStep}
                      backText={t("step.back")}
                      nextText={t("step.next")}
                      themeColor={resolvedAccentColor}
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
                    showFontSchemePreview={settingsSteps[currentStep]?.id === "font"}
                    locale={state.locale}
                    t={t}
                  />
                </div>
              </div>
            </motion.div>

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
                setToast(message || aiCopy.settingsSaved);
              }}
              onNotify={setToast}
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
      {toast ? (
        <div role="status" className="status-info fixed bottom-5 left-1/2 z-[130] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
          {toast}
        </div>
      ) : null}
      <ExportCelebration burstKey={celebrationKey} accentColor={resolvedAccentColor} />
    </div>
  );
}
