"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { LocalAudioParser } from "@/components/editor/LocalAudioParser";
import { LyricsFetchPanel } from "@/components/editor/LyricsFetchPanel";
import { LyricInput } from "@/components/editor/LyricInput";
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
import { AiTranslatePanel } from "@/components/lyrics/AiTranslatePanel";
import type { ExportFormatId, ExportQualityId } from "@/lib/settings/types";
import type { ExportLyricLineStatus } from "@/lib/lyrics-document";
import type { AISettingsSummary, AITranslationPhase } from "@/lib/ai/types";
import type { createT } from "@/lib/i18n";
import { revokeReplacedBlobUrl } from "@/lib/object-url-lifecycle";
import {
  createLyricsWorkspaceLayoutState,
  lyricsWorkspaceLayoutReducer
} from "@/lib/lyrics-workspace-layout";
import type { LyricsDocumentSnapshot, LyricsSidebarTab } from "@/lib/lyrics-workbench";
import type { DocumentImportIntent, DocumentImportKind } from "@/lib/editor/document-transactions";
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
  onBeginSongImport: (kind: DocumentImportKind) => DocumentImportIntent | null;
  onSearchedSongResolved: (song: ParsedSongData, lyrics: string | undefined, intent: DocumentImportIntent) => boolean;
  onSongParsed: (song: ParsedSongData, intent: DocumentImportIntent) => boolean;
  onLocalAudioParsed: (song: ParsedSongData, embeddedLyrics: string | undefined, intent: DocumentImportIntent) => boolean;
  onSongChange: (song: SongInfo) => void;
  onUseFetchedLyrics: (lyrics: string, revision: number, songIdentity: string) => boolean;
  onLyricsChange: (lyrics: string) => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translationText: string) => void;
  onLyricsDocumentChange: (snapshot: LyricsDocumentSnapshot) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
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
  exportBlockingMessage?: string;
  exportFormat: ExportFormatId;
  exportQuality: ExportQualityId;
  lyricsLayout: {
    lineStatus: ExportLyricLineStatus;
  };
  documentRevision: number;
  ai: EditorStepsAiState;
  handlers: EditorStepHandlers;
};

export function useEditorSteps({
  state,
  t,
  canFetchLyrics,
  themeColor,
  isExporting,
  exportBlockingMessage,
  exportFormat,
  exportQuality,
  lyricsLayout,
  documentRevision,
  ai,
  handlers
}: UseEditorStepsInput): SettingsStep[] {
  const [songInfoExpanded, setSongInfoExpanded] = useState(false);
  const [lyricsWorkspaceLayout, dispatchLyricsWorkspaceLayout] = useReducer(
    lyricsWorkspaceLayoutReducer,
    undefined,
    createLyricsWorkspaceLayoutState
  );
  const [lyricsSidebarTab, setLyricsSidebarTab] = useState<LyricsSidebarTab>("cleanup");
  const [songInfoDraft, setSongInfoDraft] = useState<SongInfo>(() => ({ ...state.song }));
  const [songInfoEditRevision, setSongInfoEditRevision] = useState<number | null>(null);
  const songInfoRegionId = useId();
  const songInfoToggleRef = useRef<HTMLButtonElement | null>(null);
  const songInfoDraftCoverRef = useRef(state.song.coverUrl ?? "");

  function restoreSongInfoToggleFocus() {
    window.requestAnimationFrame(() => songInfoToggleRef.current?.focus({ preventScroll: true }));
  }

  function discardSongInfoDraft() {
    revokeReplacedBlobUrl(songInfoDraftCoverRef.current, state.song.coverUrl);
  }

  function syncSongInfoDraft(song: SongInfo) {
    songInfoDraftCoverRef.current = song.coverUrl ?? "";
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
    if (songInfoEditRevision !== documentRevision) {
      closeSongInfoEditor();
      return;
    }

    handlers.onSongChange({ ...songInfoDraft });
    setSongInfoEditRevision(null);
    setSongInfoExpanded(false);
    restoreSongInfoToggleFocus();
  }

  useEffect(() => {
    if (!songInfoExpanded) {
      syncSongInfoDraft(state.song);
      return;
    }

    if (songInfoEditRevision === documentRevision) {
      return;
    }

    discardSongInfoDraft();
    syncSongInfoDraft(state.song);
    setSongInfoEditRevision(null);
    setSongInfoExpanded(false);
    window.requestAnimationFrame(() => songInfoToggleRef.current?.focus({ preventScroll: true }));
  }, [documentRevision, songInfoEditRevision, songInfoExpanded, state.song]);

  return [
    {
      id: "link",
      title: t("step.chooseSong"),
      description: t("songSearchDescription"),
      presentation: "focus",
      isComplete: Boolean(state.url.trim() || state.song.title.trim() || state.song.artist.trim() || state.song.coverUrl?.trim()),
      secondaryAction: {
        label: t("manualOverride"),
        onClick: toggleSongInfoEditor,
        expanded: songInfoExpanded,
        controls: songInfoRegionId,
        testId: "song-info-toggle",
        buttonRef: songInfoToggleRef
      },
      content: (
        <div className="song-import-primary grid gap-4" data-testid="song-search-primary">
          <SongSearchParser
            t={t}
            beginImport={() => handlers.onBeginSongImport("search")}
            onResolved={handlers.onSearchedSongResolved}
          />
          <div
            className="song-import-primary__alternates grid min-w-0 gap-4 min-[1180px]:grid-cols-2 [&>section]:min-w-0"
            data-testid="song-import-alternates"
          >
            <SongLinkParser
              url={state.url}
              onUrlChange={handlers.onUrlChange}
              beginImport={() => handlers.onBeginSongImport("link")}
              onParsed={handlers.onSongParsed}
              t={t}
              autoParseOnMount
            />
            <LocalAudioParser
              t={t}
              beginImport={() => handlers.onBeginSongImport("local-audio")}
              onParsed={handlers.onLocalAudioParsed}
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
              onSongChange={updateSongInfoDraft}
              t={t}
              showToggle={false}
              forceEnabled
            />
          )}
          manualExpanded={songInfoExpanded}
          manualRegionId={songInfoRegionId}
          onSave={saveSongInfoEditor}
          onCancel={closeSongInfoEditor}
        />
      )
    },
    {
      id: "lyrics",
      title: t("step.lyrics"),
      description: t("manualText"),
      presentation: "lyrics-workspace",
      managesOwnScroll: true,
      isComplete: state.style.contentMode === "instrumental" || Boolean(state.lyrics.trim()),
      content: (
        <div className="h-full min-h-0">
          <LyricInput
            lyrics={state.lyrics}
            song={state.song}
            lineStatus={lyricsLayout.lineStatus}
            workspaceLayout={lyricsWorkspaceLayout}
            sidebarTab={lyricsSidebarTab}
            onSidebarTabChange={setLyricsSidebarTab}
            onWorkspaceLayoutAction={dispatchLyricsWorkspaceLayout}
            presentation="workspace"
            onLyricsChange={handlers.onLyricsChange}
            translationEnabled={state.style.translationEnabled}
            translationText={state.style.translationText}
            onTranslationEnabledChange={handlers.onTranslationEnabledChange}
            onTranslationTextChange={handlers.onTranslationTextChange}
            onLyricsDocumentChange={handlers.onLyricsDocumentChange}
            onSplitAlternatingLyrics={handlers.onSplitAlternatingLyrics}
            onAITranslate={handlers.onOpenAiTranslate}
            isAITranslating={ai.isTranslating}
            aiTranslatePanel={ai.isOpen ? (
              <AiTranslatePanel
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
                onClose={handlers.onCloseAiTranslate}
                onCancel={handlers.onCancelAiTranslate}
                onConfirm={handlers.onConfirmAiTranslate}
              />
            ) : null}
            lyricsFetchPanel={canFetchLyrics ? (
              <LyricsFetchPanel
                song={state.song}
                visible
                documentRevision={documentRevision}
                onUseLyrics={handlers.onUseFetchedLyrics}
                t={t}
              />
            ) : undefined}
            themeColor={themeColor}
            contentMode={state.style.contentMode}
            locale={state.locale}
            t={t}
          />
        </div>
      )
    },
    {
      id: "layout",
      title: t("step.layout"),
      description: t("layoutCompatibility"),
      presentation: "preview-workbench",
      isComplete: true,
      content: (
        <LayoutSettingsPanel
          style={state.style}
          onStyleChange={handlers.onStyleChange}
          t={t}
        />
      )
    },
    {
      id: "font",
      title: t("step.fontScheme"),
      description: t("fontSchemeDescription"),
      presentation: "preview-workbench",
      isComplete: true,
      content: (
        <FontSchemeSettingsPanel
          style={state.style}
          onStyleChange={handlers.onStyleChange}
          onFontSchemePreviewChange={handlers.onFontSchemePreviewChange}
          t={t}
        />
      )
    },
    {
      id: "visual",
      title: t("step.visual"),
      description: t("background"),
      presentation: "preview-workbench",
      isComplete: true,
      content: (
        <VisualSettingsPanel
          style={state.style}
          onStyleChange={handlers.onStyleChange}
          song={state.song}
          onSongChange={handlers.onSongChange}
          t={t}
        />
      )
    },
    {
      id: "export",
      title: t("step.export"),
      presentation: "preview-workbench",
      isComplete: true,
      primaryAction: {
        label: t("step.complete"),
        onClick: handlers.onExport,
        disabled: isExporting || Boolean(exportBlockingMessage)
      },
      content: (
        <ExportPanel
          t={t}
          accentColor={themeColor}
          exportFormat={exportFormat}
          onExportFormatChange={handlers.onExportFormatChange}
          exportQuality={exportQuality}
          onExportQualityChange={handlers.onExportQualityChange}
          isExporting={isExporting}
          blockingMessage={exportBlockingMessage}
        />
      )
    }
  ];
}
