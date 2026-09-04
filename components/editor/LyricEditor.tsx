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
import { AppToast } from "@/components/feedback/AppToast";
import { SettingsPersistenceNotice } from "@/components/feedback/SettingsPersistenceNotice";
import { useToastQueue } from "@/components/feedback/useToastQueue";
import {
  DEFAULT_INSTRUMENTAL_TEXT,
  applyNewCardFooterDefaults,
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
import { useEditorAutosave } from "@/components/editor/hooks/useEditorAutosave";
import { AppMotionProvider } from "@/components/motion/AppMotionProvider";
import { MotionPanel } from "@/components/motion/MotionPanel";
import { PreviewPane } from "@/components/editor/PreviewPane";
import { ExportCardHost } from "@/components/editor/ExportCardHost";
import { AutoWidthMeasurementHost } from "@/components/editor/AutoWidthMeasurementHost";
import { LandscapeLayoutMeasurementHost } from "@/components/editor/LandscapeLayoutMeasurementHost";
import { SettingsStepper, type SettingsStep } from "@/components/editor/SettingsStepper";
import type { SettingsTabId } from "@/components/settings/settings-model";
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
import type { AppState, FontScheme, Locale, SongInfo } from "@/lib/types";
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
import { hasAuthoredDocument } from "@/lib/editor/document-transactions";
import type {
  SettingsPersistenceIssue,
  SettingsPersistenceSource
} from "@/lib/settings/persistence-issue";

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
    locale: "en",
    lyricDocument: cloneLyricDocument(defaultState.lyricDocument)
  }));
  const newCardDefaultsAppliedRef = useRef(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [landscapeLineLimitNoticeRevision, setLandscapeLineLimitNoticeRevision] = useState<number | null>(null);
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
  const [songInfoDraft, setSongInfoDraft] = useState<SongInfo>();
  const [restoredSongInfoDraft, setRestoredSongInfoDraft] = useState<{ song: SongInfo; generation: number } | null>(null);
  const [settingsPersistenceIssues, setSettingsPersistenceIssues] = useState<
    Partial<Record<SettingsPersistenceSource, SettingsPersistenceIssue>>
  >({});
  const {
    notices: toastNotices,
    announcement: toastAnnouncement,
    notify: showToast
  } = useToastQueue();
  const handleSettingsPersistenceIssueChange = useCallback((
    source: SettingsPersistenceSource,
    issue: SettingsPersistenceIssue | null
  ) => {
    setSettingsPersistenceIssues((current) => {
      if (issue) return { ...current, [source]: issue };
      if (!(source in current)) return current;
      const next = { ...current };
      delete next[source];
      return next;
    });
  }, []);
  const exportCardRef = useRef<HTMLElement | null>(null);
  const autoWidthMeasurementRef = useRef<HTMLDivElement | null>(null);
  const landscapeMeasurementRef = useRef<HTMLDivElement | null>(null);
  const captureCardRef = useRef<HTMLElement | null>(null);
  const previewCardRef = useRef<HTMLElement | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
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
  const landscapeCandidateLineStatus = useMemo(() => getExportLyricLineStatus({
    lyricDocument: reconcileLyricDocumentV2(
      state.lyricDocument,
      state.lyrics,
      state.style.translationText
    ),
    translationEnabled: state.style.translationEnabled,
    contentMode: state.style.contentMode,
    layoutMode: "landscape"
  }), [
    state.lyricDocument,
    state.lyrics,
    state.style.contentMode,
    state.style.translationEnabled,
    state.style.translationText
  ]);
  const landscapeLineLimitNotice = useMemo(() => (
    landscapeLineLimitNoticeRevision === null || landscapeCandidateLineStatus.canExport
      ? null
      : {
          revision: landscapeLineLimitNoticeRevision,
          total: landscapeCandidateLineStatus.totalLineCount,
          max: landscapeCandidateLineStatus.maxLineCount
        }
  ), [landscapeCandidateLineStatus, landscapeLineLimitNoticeRevision]);
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
  const dismissLandscapeLineLimitNotice = useCallback(() => {
    setLandscapeLineLimitNoticeRevision(null);
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
  useEffect(() => {
    if (landscapeLineLimitNoticeRevision !== null && landscapeCandidateLineStatus.canExport) {
      setLandscapeLineLimitNoticeRevision(null);
    }
  }, [landscapeCandidateLineStatus.canExport, landscapeLineLimitNoticeRevision]);
  const {
    userSettings,
    isDesktopShell,
    preferencesLoaded,
    previewUserSettings,
    commitUserSettings: updateUserSettings,
    setLocale
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

  useEffect(() => {
    if (!preferencesLoaded || newCardDefaultsAppliedRef.current) return;
    newCardDefaultsAppliedRef.current = true;
    setState((current) => hasAuthoredDocument(current)
      ? current
      : applyNewCardFooterDefaults(current, userSettings));
  }, [preferencesLoaded, userSettings]);

  const autosaveView = useMemo(() => ({ step: currentStep, exportFormat, exportQuality, songInfoDraft }),
    [currentStep, exportFormat, exportQuality, songInfoDraft]);
  const autosave = useEditorAutosave({
    state, view: autosaveView,
    enabled: preferencesLoaded ? isDesktopShell && userSettings.importHistoryLimit !== "none" : undefined,
    onRestore: (restored, view) => {
      newCardDefaultsAppliedRef.current = true;
      setState(restored);
      setCurrentStep(view.step);
      setExportFormat(view.exportFormat);
      setExportQuality(view.exportQuality);
      setSongInfoDraft(view.songInfoDraft);
      setRestoredSongInfoDraft(view.songInfoDraft ? { song: view.songInfoDraft, generation: Date.now() } : null);
      setSongLinkAutoParseVisitIntent({ id: 0, allowAutoParse: false });
    }
  });

  const {
    celebrationKey,
    isCompleteExporting,
    activeOutputAction,
    clearTransitionKey,
    activeExportSnapshot,
    documentRevision,
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
    handleHistoryRecordRemoved,
    handleHistoryCleared,
    completeAndExport,
    copyImageToClipboard,
    flushRemoteHistory
  } = useEditorActions({
    autosave,
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
    copyImageSuccessMessage: t("imageCopied"),
    copyImageFailedMessage: t("copyImageFailed"),
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
    onClearTransientState: () => { setFontSchemePreview(null); setSongInfoDraft(undefined); },
    onInvalidateDocument: (reason) => invalidateDocumentAsyncRef.current(reason),
    isManualSaveBlocked: () => aiTranslationBusyRef.current
  });

  useSongCoverObjectUrlLifecycle(
    state.song.coverUrl,
    activeExportSnapshot?.song.coverUrl
  );

  useEffect(() => {
    setExportFormat(userSettings.defaultExportFormat);
  }, [userSettings.defaultExportFormat]);

  useEffect(() => {
    setExportQuality(userSettings.defaultExportQuality);
  }, [userSettings.defaultExportQuality]);

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
      const nextLandscapeStatus = getExportLyricLineStatus({
        lyricDocument: reconcileLyricDocumentV2(
          state.lyricDocument,
          state.lyrics,
          nextStyle.translationText
        ),
        translationEnabled: nextStyle.translationEnabled,
        contentMode: nextStyle.contentMode,
        layoutMode: "landscape"
      });
      if (!nextLandscapeStatus.canExport) {
        setLandscapeLineLimitNoticeRevision((current) => (current ?? 0) + 1);
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
    restoredSongInfoDraft,
    onSongInfoDraftChange: setSongInfoDraft,
    state,
    t,
    canFetchLyrics,
    themeColor: resolvedAccentColor,
    isExporting: isCompleteExporting,
    activeOutputAction,
    exportReadinessStore,
    exportFormat,
    exportQuality,
    lyricsLayout: {
      lineStatus: exportLineStatus,
      landscapeLineLimitNotice,
      onDismissLandscapeLineLimitNotice: dismissLandscapeLineLimitNotice
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
      onExport: completeAndExport,
      onCopyImage: copyImageToClipboard
    }
  });
  const loadExampleEvent = useStableEvent(loadExample);
  const reimportHistoryEvent = useStableEvent(reimportHistory);
  const flushRemoteHistoryEvent = useStableEvent(flushRemoteHistory);
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
        aria-busy={!preferencesLoaded}
        data-preferences-loaded={preferencesLoaded ? "true" : "false"}
        data-ui-theme={effectiveUiThemeId}
        data-desktop-shell={isDesktopShell ? "true" : "false"}
        data-reduce-motion={!preferencesLoaded || shouldReduceMotion ? "true" : "false"}
        style={{
          visibility: preferencesLoaded ? undefined : "hidden",
          "--app-font-family": userSettings.uiFontFamily || undefined,
          "--app-accent": resolvedAccentColor,
          ...resolvedThemeTokens,
          ...customThemeTokens
        } as unknown as React.CSSProperties}
      >
      <DesktopTitleBar locale={state.locale} autosaveStatus={autosave.status}
        onRetryAutosave={() => void autosave.retry().catch(() => undefined)} />
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
                onBeforeTransfer={flushRemoteHistoryEvent}
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
              inert={!isEditorSurfaceActive || (isDesktopShell && !autosave.ready) ? true : undefined}
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
                      onNavigationBlocked={(message) => showToast(message, "warning")}
                      headerActions={
                        <EditorHeaderActions
                          locale={state.locale}
                          density="compact"
                          placement="stepper"
                          onOpenExamples={openExamples}
                          onOpenHistory={isDesktopShell ? openHistory : undefined}
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
              onPersistenceIssueChange={handleSettingsPersistenceIssueChange}
            />
          </div>
        </main>
      </ClickSpark>
      <SettingsPersistenceNotice issues={settingsPersistenceIssues} />
      <AppToast notices={toastNotices} announcement={toastAnnouncement} />
        <ExportCelebration burstKey={celebrationKey} accentColor={resolvedAccentColor} />
      </div>
    </AppMotionProvider>
  );
}
