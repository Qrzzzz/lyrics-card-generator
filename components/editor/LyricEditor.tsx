"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorHeaderActions } from "@/components/editor/EditorHeader";
import {
  DeferredExamplesSurface,
  DeferredHistorySurface,
  DeferredSettingsSurface
} from "@/components/editor/DeferredEditorSurfaces";
import { ExportCelebration } from "@/components/effects/ExportCelebration";
import { AppToast, type ToastNotice, type ToastTone } from "@/components/feedback/AppToast";
import {
  DEFAULT_INSTRUMENTAL_TEXT,
  defaultState
} from "@/components/editor/editor-defaults";
import { useEditorSteps } from "@/components/editor/useEditorSteps";
import {
  useEditorAiTranslation
} from "@/components/editor/hooks/useEditorAiTranslation";
import {
  useEditorActions,
  type SongLinkAutoParseVisitIntent
} from "@/components/editor/hooks/useEditorActions";
import { useEditorPreferences } from "@/components/editor/hooks/useEditorPreferences";
import { AppMotionProvider } from "@/components/motion/AppMotionProvider";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PreviewPane } from "@/components/editor/PreviewPane";
import { ExportCardHost } from "@/components/editor/ExportCardHost";
import { AutoWidthMeasurementHost } from "@/components/editor/AutoWidthMeasurementHost";
import { LandscapeLayoutMeasurementHost } from "@/components/editor/LandscapeLayoutMeasurementHost";
import { SettingsStepper, type SettingsStep } from "@/components/editor/SettingsStepper";
import type { SettingsTabId } from "@/components/settings/settings-model";
import { FirstLaunchLanguageDialog } from "@/components/settings/FirstLaunchLanguageDialog";
import {
  useCoverPalette,
  useResolvedTextColor,
  useSongCoverObjectUrlLifecycle,
  useSyncedCoverProxy
} from "@/components/editor/hooks/useLyricEditorEffects";
import { resolveEditorThemeTokens } from "@/components/editor/resolveEditorThemeTokens";
import { useMeasuredAutoCanvasWidth } from "@/components/editor/hooks/useMeasuredAutoCanvasWidth";
import { useMeasuredLandscapeLayout } from "@/components/editor/hooks/useMeasuredLandscapeLayout";
import {
  getLiveExportCardValidation,
  useExportCardReadiness,
} from "@/components/editor/hooks/useExportCardReadiness";
import { ClickSpark } from "@/components/layout/ClickSpark";
import { DesktopTitleBar } from "@/components/layout/DesktopTitleBar";
import { DynamicAppBackground } from "@/components/layout/DynamicAppBackground";
import { createT } from "@/lib/i18n";
import { proxiedImageUrl } from "@/lib/image-utils";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import { settingsCopy } from "@/lib/settings/copy";
import { systemDialogCopy } from "@/lib/system-dialog-copy";
import { showSystemConfirm } from "@/lib/system-dialog";
import { resolveUiAccentColor } from "@/lib/settings/accent";
import {
  DEFAULT_USER_SETTINGS,
  getExportPixelRatio,
  type ExportFormatId,
  type ExportQualityId
} from "@/lib/settings/types";
import { resolveEffectiveUiThemeId } from "@/lib/settings/user-settings";
import type { AppState, FontScheme, Locale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { snapshotAsAppState } from "@/lib/export-snapshot";
import { resolveExportSafetyMessage } from "@/lib/export-safety";
import { getExportLyricLineStatus } from "@/lib/lyrics-document";
import { cloneLyricDocument, reconcileLyricDocumentV2 } from "@/lib/lyrics-document-v2";
import { hasCurrentLandscapePlan } from "@/lib/landscape-measurement-key";
import type { TranslationValue } from "@/lib/editor/editor-document-state-adapter";
import { useStableEvent } from "@/components/editor/hooks/useStableEvent";
import type { AISettingsSummary } from "@/lib/ai/types";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";

type ActiveSurface = "editor" | "examples" | "history" | "settings";
type DeferredSurface = Exclude<ActiveSurface, "editor">;

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
  recordRenderBoundary("LyricEditor");
  const [state, setState] = useState<AppState>(() => ({
    ...defaultState,
    lyricDocument: cloneLyricDocument(defaultState.lyricDocument)
  }));
  const [currentStep, setCurrentStep] = useState(0);
  const [songLinkAutoParseVisitIntent, setSongLinkAutoParseVisitIntent] = useState<SongLinkAutoParseVisitIntent>({
    id: 0,
    allowAutoParse: true
  });
  const [fontSchemePreview, setFontSchemePreview] = useState<FontScheme | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [activeSurface, setActiveSurface] = useState<ActiveSurface>("editor");
  const [mountedSurfaces, setMountedSurfaces] = useState<Record<DeferredSurface, boolean>>({
    examples: false,
    history: false,
    settings: false
  });
  const [requestedSettingsTab, setRequestedSettingsTab] = useState<SettingsTabId>();
  const [previewMeasurementKey, setPreviewMeasurementKey] = useState(0);
  const [exportFormat, setExportFormat] = useState<ExportFormatId>(DEFAULT_USER_SETTINGS.defaultExportFormat);
  const [exportQuality, setExportQuality] = useState<ExportQualityId>(DEFAULT_USER_SETTINGS.defaultExportQuality);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const exportCardRef = useRef<HTMLElement | null>(null);
  const autoWidthMeasurementRef = useRef<HTMLDivElement | null>(null);
  const landscapeMeasurementRef = useRef<HTMLDivElement | null>(null);
  const captureCardRef = useRef<HTMLElement | null>(null);
  const previewCardRef = useRef<HTMLElement | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(0);
  const examplesButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const surfaceReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  // Ref bridges let document actions consult AI lifecycle state without creating hook-order cycles.
  const aiTranslationBusyRef = useRef(false);
  const invalidateDocumentAsyncRef = useRef<(
    reason?: "document" | "ai-start"
  ) => TranslationValue | undefined>(() => undefined);
  const t = useMemo(() => createT(state.locale), [state.locale]);
  const systemShouldReduceMotion = useReducedMotion() ?? false;
  const isExamplesSurfaceOpen = activeSurface === "examples";
  const isHistorySurfaceOpen = activeSurface === "history";
  const isSettingsSurfaceOpen = activeSurface === "settings";
  const isEditorSurfaceActive = activeSurface === "editor";

  // Inject the resolved palette into render/export state without mutating the editable document.
  const parsedState = useMemo(
    () => ({
      ...state,
      style: {
        ...state.style,
        landscapePlan: hasCurrentLandscapePlan(state) ? state.style.landscapePlan : undefined,
        extractedPalette: state.palette ?? DEFAULT_PALETTE
      }
    }),
    [state]
  );
  const coverForPalette = state.song.proxiedCoverUrl || proxiedImageUrl(state.song.coverUrl);
  const canFetchLyrics = Boolean(state.song.originalUrl && state.song.title.trim());

  const applyLocale = useCallback((locale: Locale) => {
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
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      setToast(null);
      return;
    }

    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message: normalizedMessage, tone });
  }, []);

  const openSurface = useCallback((surface: DeferredSurface) => {
    setMountedSurfaces((current) => current[surface]
      ? current
      : { ...current, [surface]: true });
    setActiveSurface(surface);
  }, []);

  const openExamples = useCallback(() => openSurface("examples"), [openSurface]);
  const openHistory = useCallback(() => openSurface("history"), [openSurface]);
  const openSettings = useCallback((tab?: SettingsTabId) => {
    setRequestedSettingsTab(tab);
    openSurface("settings");
  }, [openSurface]);

  const closeExamples = useCallback(() => {
    surfaceReturnFocusRef.current = examplesButtonRef.current;
    setActiveSurface("editor");
  }, []);

  const closeHistory = useCallback(() => {
    surfaceReturnFocusRef.current = historyButtonRef.current;
    setActiveSurface("editor");
  }, []);

  const closeSettings = useCallback(() => {
    surfaceReturnFocusRef.current = settingsButtonRef.current;
    setActiveSurface("editor");
  }, []);

  useSyncedCoverProxy(state, setState);
  useCoverPalette(coverForPalette, setState);
  useResolvedTextColor(state, setState);
  const autoWidthReadiness = useMeasuredAutoCanvasWidth(state, setState, autoWidthMeasurementRef);
  const landscapeLayoutReadiness = useMeasuredLandscapeLayout(state, setState, landscapeMeasurementRef);
  const {
    store: exportReadinessStore,
    lineStatus: exportLineStatus
  } = useExportCardReadiness({
    state: parsedState,
    setState,
    exportCardRef,
    isAutoWidthStable: autoWidthReadiness.isStable && landscapeLayoutReadiness.isStable
  });
  const {
    userSettings,
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

  const {
    celebrationKey,
    isCompleteExporting,
    clearTransitionKey,
    activeExportSnapshot,
    documentRevision,
    isDocumentTransactionPending,
    manualSaveButtonState,
    createSongLinkAutoParseVisitIntent,
    beginSongImport,
    clearAllContent,
    handleStyleChange: applyStyleChange,
    beginAITranslation,
    getCurrentDocumentSnapshot,
    applyAIPartial,
    commitAITranslation,
    setUrl,
    applyParsedSong,
    applyLocalAudio,
    applySearchedSong,
    saveSongInfo,
    setSong,
    setLyrics,
    setTranslationEnabled,
    setTranslationText,
    setLyricsDocument,
    applyFetchedLyrics,
    loadExample,
    reimportHistory,
    saveManualArchive,
    handleHistoryRecordRemoved,
    handleHistoryCleared,
    completeAndExport
  } = useEditorActions({
    parsedState,
    setState,
    cardRef: captureCardRef,
    exportPixelRatio,
    exportFormat,
    getExportBlockMessage: (snapshot) => {
      const validationState = snapshot ? snapshotAsAppState(snapshot, parsedState) : parsedState;
      const validation = getLiveExportCardValidation(
        validationState,
        snapshot ? captureCardRef.current : exportCardRef.current,
        snapshot ? true : autoWidthReadiness.isStable && landscapeLayoutReadiness.isStable
      );
      return validation.blockingReason
        ? resolveExportSafetyMessage(validation.blockingReason, validation.lineStatus.totalLineCount, t, validation.lineStatus.maxLineCount)
        : undefined;
    },
    exampleLoadedMessage: settingsCopy[state.locale].exampleLoaded,
    clearAlreadyEmptyMessage: settingsCopy[state.locale].clearAlreadyEmpty,
    exportBusyMessage: t("exportBusy"),
    exportFailedMessage: t("exportFailed"),
    exportImageTooLargeMessage: t("exportImageTooLarge"),
    confirmReplaceDocument: () => {
      const dialogCopy = systemDialogCopy[state.locale];
      return showSystemConfirm({
        type: "warning",
        title: dialogCopy.appTitle,
        message: dialogCopy.replaceDocumentTitle,
        detail: t("replaceDocumentConfirm"),
        confirmLabel: dialogCopy.replace,
        cancelLabel: dialogCopy.cancel
      });
    },
    onNotify: showToast,
    onCloseExamples: closeExamples,
    onCloseHistory: closeHistory,
    onClearTransientState: () => setFontSchemePreview(null),
    onInvalidateDocument: (reason) => invalidateDocumentAsyncRef.current(reason),
    isManualSaveBlocked: () => aiTranslationBusyRef.current
  });

  useSongCoverObjectUrlLifecycle(
    state.song.coverUrl,
    activeExportSnapshot?.song.coverUrl
  );

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setExportFormat(userSettings.defaultExportFormat);
  }, [userSettings.defaultExportFormat]);

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
    if (!isExamplesSurfaceOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        surfaceReturnFocusRef.current = examplesButtonRef.current;
        setActiveSurface("editor");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExamplesSurfaceOpen]);

  useEffect(() => {
    if (!isEditorSurfaceActive || !surfaceReturnFocusRef.current) return;
    // Return focus only after the editor surface is interactive again.
    const returnFocus = surfaceReturnFocusRef.current;
    surfaceReturnFocusRef.current = null;
    setRequestedSettingsTab(undefined);
    const frame = window.requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
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
    invalidateAITranslation,
    setAISettings
  } = useEditorAiTranslation({
    locale: state.locale,
    lyrics: state.lyrics,
    beginAITranslation,
    getCurrentDocumentSnapshot,
    applyPartial: applyAIPartial,
    commitTerminal: commitAITranslation,
    onNotify: showToast,
    onRequireSettings: () => openSettings("ai")
  });
  aiTranslationBusyRef.current = isAITranslating;
  invalidateDocumentAsyncRef.current = invalidateAITranslation;

  function handleStyleChange(nextStyle: AppState["style"]) {
    if (
      (state.style.layoutMode ?? "portrait") !== "landscape" &&
      (nextStyle.layoutMode ?? "portrait") === "landscape"
    ) {
      const landscapeStatus = getExportLyricLineStatus({
        lyricDocument: reconcileLyricDocumentV2(
          state.lyricDocument,
          state.lyrics,
          nextStyle.translationText
        ),
        translationEnabled: nextStyle.translationEnabled,
        contentMode: nextStyle.contentMode,
        layoutMode: "landscape"
      });
      if (!landscapeStatus.canExport) {
        showToast(t("landscapeLineLimitExceeded", { total: landscapeStatus.totalLineCount }), "warning");
        setCurrentStep(1);
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>("[data-testid='lyrics-editor-original']")?.focus({ preventScroll: true });
        });
        return;
      }
    }
    applyStyleChange(nextStyle);
  }

  function changeEditorStep(nextStep: number) {
    if (nextStep === 0 && currentStep !== 0) {
      setSongLinkAutoParseVisitIntent(createSongLinkAutoParseVisitIntent());
    }
    setCurrentStep(nextStep);
  }

  const settingsSteps: SettingsStep[] = useEditorSteps({
    state,
    t,
    canFetchLyrics,
    themeColor: resolvedAccentColor,
    isExporting: isCompleteExporting,
    exportReadinessStore,
    exportFormat,
    exportQuality,
    lyricsLayout: {
      lineStatus: exportLineStatus
    },
    documentRevision,
    songLinkAutoParseVisitIntent,
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
      onSaveSongInfo: saveSongInfo,
      onSongChange: setSong,
      onUseFetchedLyrics: applyFetchedLyrics,
      onLyricsChange: setLyrics,
      onTranslationEnabledChange: setTranslationEnabled,
      onTranslationTextChange: setTranslationText,
      onLyricsDocumentChange: setLyricsDocument,
      onOpenAiTranslate: openAITranslate,
      onCloseAiTranslate: closeAITranslate,
      onCancelAiTranslate: cancelAITranslation,
      onConfirmAiTranslate: translateWithAI,
      onStyleChange: handleStyleChange,
      onFontSchemePreviewChange: setFontSchemePreview,
      onExportFormatChange: setExportFormat,
      onExportQualityChange: setExportQuality,
      onExport: completeAndExport
    }
  });
  const loadExampleEvent = useStableEvent(loadExample);
  const reimportHistoryEvent = useStableEvent(reimportHistory);
  const recordRemovedEvent = useStableEvent(handleHistoryRecordRemoved);
  const historyClearedEvent = useStableEvent(handleHistoryCleared);
  const localeChangeEvent = useStableEvent(setLocale);
  const settingsPreviewEvent = useStableEvent(previewUserSettings);
  const settingsChangeEvent = useStableEvent(updateUserSettings);
  const settingsSavedEvent = useStableEvent((settings: AISettingsSummary, message?: string) => {
    setAISettings(settings);
    showToast(message || aiCopy.settingsSaved, "success");
  });
  const activeSettingsStep = settingsSteps[currentStep] ?? settingsSteps[0];
  const activePresentation = activeSettingsStep?.presentation ?? "preview-workbench";
  const isLyricsWorkspace = activePresentation === "lyrics-workspace";
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
      <DynamicAppBackground palette={state.palette} settings={userSettings} />
      <ClickSpark enabled={userSettings.sparkCursorEnabled} themeColor={resolvedAccentColor}>
        <main className="app-main-content lyric-editor-main relative z-10 min-h-screen px-4 py-5 sm:px-6 lg:px-8">
          <div className="lyric-editor-stage relative mx-auto min-w-0 max-w-[1520px] overflow-clip">
            <DeferredExamplesSurface
              mounted={mountedSurfaces.examples}
              isActive={isExamplesSurfaceOpen}
              locale={state.locale}
              onLoad={loadExampleEvent}
              onClose={closeExamples}
              transition={activeSurfaceTransition}
            />
            {isDesktopShell ? (
              <DeferredHistorySurface
                mounted={mountedSurfaces.history}
                isActive={isHistorySurfaceOpen}
                locale={state.locale}
                transition={activeSurfaceTransition}
                reduceMotion={shouldReduceMotion}
                onClose={closeHistory}
                onReplay={reimportHistoryEvent}
                onNotify={showToast}
                onRecordRemoved={recordRemovedEvent}
                onHistoryCleared={historyClearedEvent}
              />
            ) : null}

            <motion.div
              ref={editorSurfaceRef}
              data-testid="editor-surface"
              data-surface-work="running"
              aria-hidden={!isEditorSurfaceActive}
              className={cn(
                "relative z-10 h-full min-h-0",
                isLyricsWorkspace ? "overflow-hidden" : "overflow-y-auto",
                isEditorSurfaceActive ? "pointer-events-auto" : "pointer-events-none"
              )}
              animate={{
                x: isSettingsSurfaceOpen ? "-100%" : "0%",
                y: isExamplesSurfaceOpen || isHistorySurfaceOpen ? "100%" : "0%",
                opacity: isEditorSurfaceActive ? 1 : shouldReduceMotion ? 0 : 0.35,
                scale: isEditorSurfaceActive ? 1 : shouldReduceMotion ? 1 : 0.985
              }}
              initial={false}
              inert={!isEditorSurfaceActive ? true : undefined}
              transition={activeSurfaceTransition}
              onAnimationStart={() => {
                editorSurfaceRef.current?.setAttribute("data-surface-work", "running");
              }}
              onAnimationComplete={() => {
                if (isEditorSurfaceActive) {
                  editorSurfaceRef.current?.setAttribute("data-surface-work", "running");
                  // A returning preview must remeasure after its sliding surface reaches final geometry.
                  setPreviewMeasurementKey((key) => key + 1);
                } else {
                  // Decorative work is paused only after the editor is fully offscreen,
                  // so the existing exit pixels and timing remain unchanged.
                  editorSurfaceRef.current?.setAttribute("data-surface-work", "paused");
                }
              }}
            >
              <div
                className={cn(
                  "grid min-w-0 max-w-full gap-5",
                  isLyricsWorkspace && "h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-2"
                )}
                data-editor-presentation={activePresentation}
                data-lyrics-viewport-mode={isLyricsWorkspace ? "immersive" : undefined}
              >
                <div className={cn("grid min-w-0 max-w-full gap-5", isLyricsWorkspace && "h-full min-h-0")}>
                  <MotionPanel
                    className={cn(
                      "grid min-w-0 gap-4",
                      isLyricsWorkspace && "h-full min-h-0",
                      "order-1"
                    )}
                  >
                    <SettingsStepper
                      steps={settingsSteps}
                      currentStep={currentStep}
                      onStepChange={changeEditorStep}
                      backText={t("step.back")}
                      nextText={t("step.next")}
                      themeColor={resolvedAccentColor}
                      compactChrome
                      workbenchResizeLabel={t("step.resizeWorkbench")}
                      headerActions={
                        <EditorHeaderActions
                          locale={state.locale}
                          density="compact"
                          placement="stepper"
                          onOpenExamples={openExamples}
                          onOpenHistory={isDesktopShell ? openHistory : undefined}
                          onManualSave={isDesktopShell ? () => void saveManualArchive() : undefined}
                          manualSaveState={manualSaveButtonState}
                          manualSaveDisabled={isAITranslating || isDocumentTransactionPending}
                          onClearAll={clearAllContent}
                          onOpenSettings={openSettings}
                          examplesButtonRef={examplesButtonRef}
                          historyButtonRef={historyButtonRef}
                          settingsButtonRef={settingsButtonRef}
                        />
                      }
                      companionAside={
                        showVisiblePreview ? (
                          <PreviewPane
                            isPreviewVisible={isPreviewVisible}
                            onPreviewVisibleChange={setIsPreviewVisible}
                            song={parsedState.song}
                            lyricDocument={parsedState.lyricDocument}
                            style={parsedState.style}
                            coverArtwork={parsedState.coverArtwork}
                            cardRef={previewCardRef}
                            fontSchemePreview={fontSchemePreview}
                            clearTransitionKey={clearTransitionKey}
                            measurementKey={previewMeasurementKey}
                            pressureEnabled={currentStep >= 2}
                            locale={state.locale}
                            t={t}
                          />
                        ) : activeSettingsStep?.aside
                      }
                    />
                  </MotionPanel>
                </div>
              </div>
            </motion.div>

            <ExportCardHost
              song={parsedState.song}
              lyricDocument={parsedState.lyricDocument}
              style={parsedState.style}
              coverArtwork={parsedState.coverArtwork}
              exportCardRef={exportCardRef}
              locale={parsedState.locale}
            />
            <AutoWidthMeasurementHost state={state} hostRef={autoWidthMeasurementRef} />
            <LandscapeLayoutMeasurementHost state={state} hostRef={landscapeMeasurementRef} />
            {/* Snapshot capture is isolated from both the visible preview and live readiness host. */}
            {activeExportSnapshot ? (
              <ExportCardHost
                song={activeExportSnapshot.song as AppState["song"]}
                lyricDocument={activeExportSnapshot.lyricDocument}
                style={activeExportSnapshot.style as AppState["style"]}
                coverArtwork={activeExportSnapshot.coverArtwork as AppState["coverArtwork"]}
                exportCardRef={captureCardRef}
                locale={activeExportSnapshot.locale}
                snapshotId={activeExportSnapshot.id}
              />
            ) : null}

            <DeferredSettingsSurface
              mounted={mountedSurfaces.settings}
              isActive={isSettingsSurfaceOpen}
              requestedTab={requestedSettingsTab}
              locale={state.locale}
              userSettings={userSettings}
              isDesktopShell={isDesktopShell}
              transition={activeSurfaceTransition}
              onLocaleChange={localeChangeEvent}
              onUserSettingsPreview={settingsPreviewEvent}
              onUserSettingsChange={settingsChangeEvent}
              onClose={closeSettings}
              onSaved={settingsSavedEvent}
              onNotify={showToast}
            />
          </div>
        </main>
      </ClickSpark>
      <FirstLaunchLanguageDialog open={isFirstLaunchOpen} locale={state.locale} onChoose={chooseFirstLaunchLanguage} />
      <AppToast notice={toast} />
        <ExportCelebration burstKey={celebrationKey} accentColor={resolvedAccentColor} />
      </div>
    </AppMotionProvider>
  );
}
