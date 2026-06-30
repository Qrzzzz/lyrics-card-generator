"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { ExamplesDialog } from "@/components/editor/ExamplesDialog";
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
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { FirstLaunchLanguageDialog } from "@/components/settings/FirstLaunchLanguageDialog";
import {
  useCoverPalette,
  useResolvedTextColor,
  useSyncedCoverProxy
} from "@/components/editor/hooks/useLyricEditorEffects";
import { useEditorThemeTokens } from "@/components/editor/hooks/useEditorThemeTokens";
import { useMeasuredAutoCanvasHeight } from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";
import { ClickSpark } from "@/components/layout/ClickSpark";
import { DesktopTitleBar } from "@/components/layout/DesktopTitleBar";
import { DynamicAppBackground } from "@/components/layout/DynamicAppBackground";
import { createT } from "@/lib/i18n";
import { proxiedImageUrl } from "@/lib/image-utils";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import { settingsCopy } from "@/lib/settings/copy";
import type { AppState, FontScheme, Locale } from "@/lib/types";

export function LyricEditor() {
  const [state, setState] = useState<AppState>(defaultState);
  const [currentStep, setCurrentStep] = useState(0);
  const [fontSchemePreview, setFontSchemePreview] = useState<FontScheme | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [isExamplesOpen, setIsExamplesOpen] = useState(false);
  const [toast, setToast] = useState("");
  const cardRef = useRef<HTMLElement | null>(null);
  const t = useMemo(() => createT(state.locale), [state.locale]);

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
    isSettingsOpen,
    isFirstLaunchOpen,
    openSettings,
    closeSettings,
    previewUserSettings,
    commitUserSettings: updateUserSettings,
    setLocale,
    chooseFirstLaunchLanguage
  } = useEditorPreferences({
    currentLocale: state.locale,
    applyLocale
  });
  const {
    celebrationKey,
    isCompleteExporting,
    clearAllContent,
    handleStyleChange,
    setTranslation,
    setUrl,
    applyParsedSong,
    applyLocalAudio,
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
    exportPixelRatio: userSettings.defaultExportPixelRatio,
    exampleLoadedMessage: settingsCopy[state.locale].exampleLoaded,
    onNotify: setToast,
    onCloseExamples: () => setIsExamplesOpen(false),
    onClearTransientState: () => setFontSchemePreview(null)
  });

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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
    onRequireSettings: openSettings
  });

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

  const editorThemeColor = state.palette?.primary ?? DEFAULT_PALETTE.primary;
  const settingsSteps: SettingsStep[] = useEditorSteps({
    state,
    parsedState,
    t,
    canFetchLyrics,
    themeColor: editorThemeColor,
    cardRef,
    isExporting: isCompleteExporting,
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
      onExport: completeAndExport
    }
  });
  const { themeAccent, resolvedThemeTokens, customThemeTokens } = useEditorThemeTokens({
    userSettings,
    palette: state.palette
  });

  return (
    <div
      className="app-shell min-h-screen"
      data-ui-theme={userSettings.uiTheme}
      data-desktop-shell={isDesktopShell ? "true" : "false"}
      style={{
        "--app-font-family": userSettings.uiFontFamily || undefined,
        "--app-accent": themeAccent,
        ...resolvedThemeTokens,
        ...customThemeTokens
      } as unknown as React.CSSProperties}
    >
      <DesktopTitleBar locale={state.locale} />
      <DynamicAppBackground palette={state.palette} settings={userSettings} imageUrl={backgroundImageUrl} />
      <ClickSpark enabled={userSettings.sparkCursorEnabled} themeColor={themeAccent}>
    <main className="app-main-content relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-[calc(100vw-2rem)] max-w-[1520px] min-w-0 gap-5 sm:w-full">
        <EditorHeader locale={state.locale} t={t} onOpenExamples={() => setIsExamplesOpen(true)} onClearAll={clearAllContent} onOpenSettings={openSettings} />

        <div className="grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
          <MotionPanel className="order-2 grid min-w-0 gap-4 lg:order-1">
            <SettingsStepper
              steps={settingsSteps}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              backText={t("step.back")}
              nextText={t("step.next")}
              themeColor={editorThemeColor}
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
    </main>
      </ClickSpark>
      <SettingsDialog
        open={isSettingsOpen}
        locale={state.locale}
        userSettings={userSettings}
        onLocaleChange={setLocale}
        onUserSettingsPreview={previewUserSettings}
        onUserSettingsChange={updateUserSettings}
        onClose={closeSettings}
        onSaved={(settings, message) => {
          setAISettings(settings);
          setToast(message || aiCopy.settingsSaved);
        }}
      />
      <ExamplesDialog open={isExamplesOpen} locale={state.locale} onClose={() => setIsExamplesOpen(false)} onLoad={loadExample} />
      <FirstLaunchLanguageDialog open={isFirstLaunchOpen} locale={state.locale} onChoose={chooseFirstLaunchLanguage} />
      {toast ? (
        <div role="status" className="status-info fixed bottom-5 left-1/2 z-[130] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
          {toast}
        </div>
      ) : null}
      <ExportCelebration burstKey={celebrationKey} accentColor={editorThemeColor} />
    </div>
  );
}
