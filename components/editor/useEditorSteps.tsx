"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DeferredAiTranslatePanel,
  DeferredExportPanel
} from "@/components/editor/DeferredEditorStepPanels";
import { LocalAudioParser } from "@/components/editor/LocalAudioParser";
import { LyricsFetchPanel } from "@/components/editor/LyricsFetchPanel";
import { LyricsWorkspace } from "@/components/editor/LyricsWorkspace";
import { SettingsStep } from "@/components/editor/SettingsStepper";
import { SongImportAside } from "@/components/editor/SongImportAside";
import { SongInfoForm } from "@/components/editor/SongInfoForm";
import { SongLinkParser } from "@/components/editor/SongLinkParser";
import { SongSearchParser } from "@/components/editor/SongSearchParser";
import {
  FontSchemeSettingsPanel,
  LayoutSettingsPanel,
  VisualSettingsPanel
} from "@/components/editor/StylePanel";
import { useStableEvent } from "@/components/editor/hooks/useStableEvent";
import type { ExportFormatId, ExportQualityId } from "@/lib/settings/types";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import type { ExportCardReadinessStore } from "@/components/editor/hooks/export-card-readiness-store";
import type { AISettingsSummary, AITranslationPhase } from "@/lib/ai/types";
import type { createT } from "@/lib/i18n";
import { revokeReplacedBlobUrl } from "@/lib/object-url-lifecycle";
import type { LyricsDocumentSnapshot, LyricsSidebarTab } from "@/lib/lyrics-workbench";
import type { DocumentImportIntent, DocumentImportKind } from "@/lib/editor/document-transactions";
import type { SongLinkAutoParseVisitIntent } from "@/components/editor/hooks/useEditorActions";
import type {
  LinkImportHistoryContext,
  LocalAudioImportHistoryContext,
  ManualCoverImportHistoryContext,
  SearchImportHistoryContext
} from "@/lib/import-history";
import type {
  AppState,
  CardStyle,
  FontScheme,
  ParsedSongData,
  SongInfo
} from "@/lib/types";

export type EditorStepsAiState = {
  isOpen: boolean;
  isTranslating: boolean;
  streamingText: string;
  reasoningText: string;
  phase: AITranslationPhase;
  error: string;
  defaultStyle: AISettingsSummary["defaultStyle"];
  reasoningEnabled: AISettingsSummary["reasoningEnabled"];
  promptLibrary: AISettingsSummary["promptLibrary"];
};

export type EditorStepHandlers = {
  onUrlChange: (url: string) => void;
  onBeginSongImport: (kind: DocumentImportKind) => Promise<DocumentImportIntent | null>;
  onSearchedSongResolved: (
    song: ParsedSongData,
    lyrics: string | undefined,
    intent: DocumentImportIntent,
    context: SearchImportHistoryContext
  ) => boolean;
  onSongParsed: (song: ParsedSongData, intent: DocumentImportIntent, context: LinkImportHistoryContext) => boolean;
  onLocalAudioParsed: (
    song: ParsedSongData,
    embeddedLyrics: string | undefined,
    intent: DocumentImportIntent,
    context: LocalAudioImportHistoryContext
  ) => boolean;
  onSaveSongInfo: (song: SongInfo, context: ManualCoverImportHistoryContext) => void;
  onSongChange: (song: SongInfo) => void;
  onUseFetchedLyrics: (lyrics: string, revision: number, songIdentity: string) => boolean;
  onLyricsChange: (lyrics: string) => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translationText: string) => void;
  onLyricsDocumentChange: (snapshot: LyricsDocumentSnapshot) => void;
  onOpenAiTranslate: () => void;
  onCloseAiTranslate: () => void;
  onCancelAiTranslate: () => void;
  onConfirmAiTranslate: (presetId: string, reasoning: boolean) => void | Promise<void>;
  onStyleChange: (style: CardStyle) => void;
  onFontSchemePreviewChange: (scheme: FontScheme | null) => void;
  onExportFormatChange: (format: ExportFormatId) => void;
  onExportQualityChange: (quality: ExportQualityId) => void;
  onExport: () => void | Promise<void>;
};

type UseEditorStepsInput = {
  state: AppState;
  t: ReturnType<typeof createT>;
  canFetchLyrics: boolean;
  themeColor: string;
  isExporting: boolean;
  exportReadinessStore: ExportCardReadinessStore;
  exportFormat: ExportFormatId;
  exportQuality: ExportQualityId;
  lyricsLayout: {
    lineStatus: ExportLyricLineStatus;
  };
  documentRevision: number;
  songLinkAutoParseVisitIntent: SongLinkAutoParseVisitIntent;
  ai: EditorStepsAiState;
  handlers: EditorStepHandlers;
};

export function useEditorSteps({
  state,
  t,
  canFetchLyrics,
  themeColor,
  isExporting,
  exportReadinessStore,
  exportFormat,
  exportQuality,
  lyricsLayout,
  documentRevision,
  songLinkAutoParseVisitIntent,
  ai,
  handlers
}: UseEditorStepsInput): SettingsStep[] {
  const [songInfoExpanded, setSongInfoExpanded] = useState(false);
  const [lyricsSidebarTab, setLyricsSidebarTab] = useState<LyricsSidebarTab>("cleanup");
  // Manual song info is a document-revision-bound draft until the user explicitly saves it.
  const [songInfoDraft, setSongInfoDraft] = useState<SongInfo>(() => ({ ...state.song }));
  const [songInfoEditRevision, setSongInfoEditRevision] = useState<number | null>(null);
  const [manualCoverPending, setManualCoverPending] = useState(false);
  const songInfoRegionId = useId();
  const songInfoToggleRef = useRef<HTMLButtonElement | null>(null);
  const songInfoDraftCoverRef = useRef(state.song.coverUrl ?? "");
  const manualCoverContextRef = useRef<ManualCoverImportHistoryContext>({ uploaded: false });

  function restoreSongInfoToggleFocus() {
    window.requestAnimationFrame(() => songInfoToggleRef.current?.focus({ preventScroll: true }));
  }

  function discardSongInfoDraft() {
    // Draft-only blob URLs must be retired without revoking the cover owned by live state.
    revokeReplacedBlobUrl(songInfoDraftCoverRef.current, state.song.coverUrl);
  }

  function syncSongInfoDraft(song: SongInfo) {
    songInfoDraftCoverRef.current = song.coverUrl ?? "";
    manualCoverContextRef.current = { uploaded: false };
    setManualCoverPending(false);
    setSongInfoDraft(song);
  }

  function updateSongInfoDraft(song: SongInfo) {
    const nextCoverUrl = song.coverUrl ?? "";
    revokeReplacedBlobUrl(
      songInfoDraftCoverRef.current,
      nextCoverUrl,
      state.song.coverUrl
    );
    songInfoDraftCoverRef.current = nextCoverUrl;
    setSongInfoDraft(song);
  }

  function closeSongInfoEditor() {
    discardSongInfoDraft();
    syncSongInfoDraft(state.song);
    setSongInfoEditRevision(null);
    setSongInfoExpanded(false);
    restoreSongInfoToggleFocus();
  }

  function toggleSongInfoEditor() {
    if (songInfoExpanded) {
      closeSongInfoEditor();
      return;
    }

    syncSongInfoDraft(state.song);
    setSongInfoEditRevision(documentRevision);
    setSongInfoExpanded(true);
  }

  function saveSongInfoEditor() {
    // Never apply a draft opened against a document that has since been replaced.
    if (songInfoEditRevision !== documentRevision) {
      closeSongInfoEditor();
      return;
    }

    onSaveSongInfo({ ...songInfoDraft }, manualCoverContextRef.current);
    manualCoverContextRef.current = { uploaded: false };
    setSongInfoEditRevision(null);
    setSongInfoExpanded(false);
    restoreSongInfoToggleFocus();
  }

  const onUrlChange = useStableEvent(handlers.onUrlChange);
  const onBeginSongImport = useStableEvent(handlers.onBeginSongImport);
  const onSearchedSongResolved = useStableEvent(handlers.onSearchedSongResolved);
  const onSongParsed = useStableEvent(handlers.onSongParsed);
  const onLocalAudioParsed = useStableEvent(handlers.onLocalAudioParsed);
  const onSaveSongInfo = useStableEvent(handlers.onSaveSongInfo);
  const onSongChange = useStableEvent(handlers.onSongChange);
  const onUseFetchedLyrics = useStableEvent(handlers.onUseFetchedLyrics);
  const onLyricsChange = useStableEvent(handlers.onLyricsChange);
  const onTranslationEnabledChange = useStableEvent(handlers.onTranslationEnabledChange);
  const onTranslationTextChange = useStableEvent(handlers.onTranslationTextChange);
  const onLyricsDocumentChange = useStableEvent(handlers.onLyricsDocumentChange);
  const onOpenAiTranslate = useStableEvent(handlers.onOpenAiTranslate);
  const onCloseAiTranslate = useStableEvent(handlers.onCloseAiTranslate);
  const onCancelAiTranslate = useStableEvent(handlers.onCancelAiTranslate);
  const onConfirmAiTranslate = useStableEvent(handlers.onConfirmAiTranslate);
  const onStyleChange = useStableEvent(handlers.onStyleChange);
  const onFontSchemePreviewChange = useStableEvent(handlers.onFontSchemePreviewChange);
  const onExportFormatChange = useStableEvent(handlers.onExportFormatChange);
  const onExportQualityChange = useStableEvent(handlers.onExportQualityChange);
  const onExport = useStableEvent(handlers.onExport);
  const toggleSongInfoEditorEvent = useStableEvent(toggleSongInfoEditor);
  const updateSongInfoDraftEvent = useStableEvent(updateSongInfoDraft);
  const saveSongInfoEditorEvent = useStableEvent(saveSongInfoEditor);
  const closeSongInfoEditorEvent = useStableEvent(closeSongInfoEditor);
  const onManualCoverChange = useStableEvent((context: ManualCoverImportHistoryContext) => {
    manualCoverContextRef.current = context;
  });

  useEffect(() => {
    if (!songInfoExpanded) {
      syncSongInfoDraft(state.song);
      return;
    }

    if (songInfoEditRevision === documentRevision) {
      return;
    }

    // External document changes invalidate the draft and any pending cover registration.
    discardSongInfoDraft();
    syncSongInfoDraft(state.song);
    setSongInfoEditRevision(null);
    setSongInfoExpanded(false);
    window.requestAnimationFrame(() => songInfoToggleRef.current?.focus({ preventScroll: true }));
  }, [documentRevision, songInfoEditRevision, songInfoExpanded, state.song]);

  const linkStep = useMemo<SettingsStep>(() => ({
      id: "link",
      title: t("step.chooseSong"),
      description: t("songSearchDescription"),
      presentation: "focus",
      isComplete: Boolean(state.url.trim() || state.song.title.trim() || state.song.artist.trim() || state.song.coverUrl?.trim()),
      secondaryAction: {
        label: t("manualOverride"),
        onClick: toggleSongInfoEditorEvent,
        expanded: songInfoExpanded,
        controls: songInfoRegionId,
        testId: "song-info-toggle",
        buttonRef: songInfoToggleRef
      },
      content: (
        <div className="song-import-primary grid gap-4" data-testid="song-search-primary">
          <SongSearchParser
            t={t}
            beginImport={() => onBeginSongImport("search")}
            onResolved={onSearchedSongResolved}
          />
          <div
            className="song-import-primary__alternates grid min-w-0 gap-4 min-[1180px]:grid-cols-2 [&>section]:min-w-0"
            data-testid="song-import-alternates"
          >
            <SongLinkParser
              url={state.url}
              onUrlChange={onUrlChange}
              beginImport={() => onBeginSongImport("link")}
              onParsed={onSongParsed}
              t={t}
              autoParseOnMount
              autoParseVisitIntent={songLinkAutoParseVisitIntent}
            />
            <LocalAudioParser
              t={t}
              beginImport={() => onBeginSongImport("local-audio")}
              onParsed={onLocalAudioParsed}
            />
          </div>
        </div>
      ),
      aside: (
        <SongImportAside
          song={state.song}
          locale={state.locale}
          t={t}
          manualForm={(
            <SongInfoForm
              song={songInfoDraft}
              onSongChange={updateSongInfoDraftEvent}
              onManualCoverChange={onManualCoverChange}
              onManualCoverPendingChange={setManualCoverPending}
              t={t}
              showToggle={false}
              forceEnabled
            />
          )}
          manualExpanded={songInfoExpanded}
          manualRegionId={songInfoRegionId}
          manualSavePending={manualCoverPending}
          onSave={saveSongInfoEditorEvent}
          onCancel={closeSongInfoEditorEvent}
        />
      )
  }), [
    closeSongInfoEditorEvent,
    manualCoverPending,
    onBeginSongImport,
    onLocalAudioParsed,
    onManualCoverChange,
    onSearchedSongResolved,
    onSongParsed,
    onUrlChange,
    saveSongInfoEditorEvent,
    songInfoDraft,
    songInfoExpanded,
    songInfoRegionId,
    songLinkAutoParseVisitIntent,
    state.locale,
    state.song,
    state.url,
    t,
    toggleSongInfoEditorEvent,
    updateSongInfoDraftEvent
  ]);

  const lyricsStep = useMemo<SettingsStep>(() => ({
      id: "lyrics",
      title: t("step.lyrics"),
      description: t("manualText"),
      presentation: "lyrics-workspace",
      managesOwnScroll: true,
      isComplete: state.style.contentMode === "instrumental" || Boolean(state.lyrics.trim()),
      content: (
        <div className="h-full min-h-0">
          <LyricsWorkspace
            lyricDocument={state.lyricDocument}
            lyrics={state.lyrics}
            lineStatus={lyricsLayout.lineStatus}
            sidebarTab={lyricsSidebarTab}
            onSidebarTabChange={setLyricsSidebarTab}
            onLyricsChange={onLyricsChange}
            translationEnabled={state.style.translationEnabled}
            translationText={state.style.translationText}
            onTranslationEnabledChange={onTranslationEnabledChange}
            onTranslationTextChange={onTranslationTextChange}
            onLyricsDocumentChange={onLyricsDocumentChange}
            onAITranslate={onOpenAiTranslate}
            onCloseAITranslate={onCloseAiTranslate}
            onCancelAITranslate={onCancelAiTranslate}
            isAITranslating={ai.isTranslating}
            aiPanel={ai.isOpen ? (
              <DeferredAiTranslatePanel
                backLabel={t("step.back")}
                locale={state.locale}
                initialStyle={ai.defaultStyle}
                initialReasoning={ai.reasoningEnabled}
                promptLibrary={ai.promptLibrary}
                loading={ai.isTranslating}
                streamingText={ai.streamingText}
                reasoningText={ai.reasoningText}
                phase={ai.phase}
                themeColor={themeColor}
                error={ai.error}
                onClose={onCloseAiTranslate}
                onCancel={onCancelAiTranslate}
                onConfirm={onConfirmAiTranslate}
              />
            ) : null}
            lyricsFetchPanel={(
              <LyricsFetchPanel
                song={state.song}
                available={canFetchLyrics}
                documentRevision={documentRevision}
                onUseLyrics={onUseFetchedLyrics}
                t={t}
              />
            )}
            themeColor={themeColor}
            contentMode={state.style.contentMode}
            locale={state.locale}
            t={t}
          />
        </div>
      )
  }), [
    ai.defaultStyle,
    ai.error,
    ai.isOpen,
    ai.isTranslating,
    ai.phase,
    ai.promptLibrary,
    ai.reasoningEnabled,
    ai.reasoningText,
    ai.streamingText,
    canFetchLyrics,
    documentRevision,
    lyricsLayout.lineStatus,
    lyricsSidebarTab,
    onCancelAiTranslate,
    onCloseAiTranslate,
    onConfirmAiTranslate,
    onLyricsChange,
    onLyricsDocumentChange,
    onOpenAiTranslate,
    onTranslationEnabledChange,
    onTranslationTextChange,
    onUseFetchedLyrics,
    state.locale,
    state.lyrics,
    state.song,
    state.style.contentMode,
    state.style.translationEnabled,
    state.style.translationText,
    t,
    themeColor
  ]);

  const layoutStep = useMemo<SettingsStep>(() => ({
      id: "layout",
      title: t("step.layout"),
      description: t("layoutCompatibility"),
      presentation: "preview-workbench",
      isComplete: true,
      content: (
        <LayoutSettingsPanel
          style={state.style}
          onStyleChange={onStyleChange}
          t={t}
        />
      )
  }), [onStyleChange, state.style, t]);

  const fontStep = useMemo<SettingsStep>(() => ({
      id: "font",
      title: t("step.fontScheme"),
      description: t("fontSchemeDescription"),
      presentation: "preview-workbench",
      isComplete: true,
      content: (
        <FontSchemeSettingsPanel
          style={state.style}
          onStyleChange={onStyleChange}
          onFontSchemePreviewChange={onFontSchemePreviewChange}
          t={t}
        />
      )
  }), [onFontSchemePreviewChange, onStyleChange, state.style, t]);

  const visualStep = useMemo<SettingsStep>(() => ({
      id: "visual",
      title: t("step.visual"),
      description: t("background"),
      presentation: "preview-workbench",
      isComplete: true,
      content: (
        <VisualSettingsPanel
          style={state.style}
          onStyleChange={onStyleChange}
          song={state.song}
          onSongChange={onSongChange}
          t={t}
        />
      )
  }), [onSongChange, onStyleChange, state.song, state.style, t]);

  const exportStep = useMemo<SettingsStep>(() => ({
      id: "export",
      title: t("step.export"),
      presentation: "preview-workbench",
      isComplete: true,
      primaryAction: {
        label: t("step.complete"),
        onClick: onExport,
        disabled: isExporting,
        readinessStore: exportReadinessStore
      },
      content: (
        <DeferredExportPanel
          label={t("step.export")}
          locale={state.locale}
          t={t}
          accentColor={themeColor}
          exportFormat={exportFormat}
          onExportFormatChange={onExportFormatChange}
          exportQuality={exportQuality}
          onExportQualityChange={onExportQualityChange}
          isExporting={isExporting}
          readinessStore={exportReadinessStore}
        />
      )
  }), [
    exportFormat,
    exportQuality,
    exportReadinessStore,
    isExporting,
    onExport,
    onExportFormatChange,
    onExportQualityChange,
    state.locale,
    t,
    themeColor
  ]);

  return useMemo(
    () => [linkStep, lyricsStep, layoutStep, fontStep, visualStep, exportStep],
    [exportStep, fontStep, layoutStep, linkStep, lyricsStep, visualStep]
  );
}
