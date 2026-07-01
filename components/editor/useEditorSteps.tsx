"use client";

import type { RefObject } from "react";
import { useState } from "react";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { LocalAudioParser } from "@/components/editor/LocalAudioParser";
import { LyricsFetchPanel } from "@/components/editor/LyricsFetchPanel";
import { LyricInput } from "@/components/editor/LyricInput";
import { SettingsStep } from "@/components/editor/SettingsStepper";
import { SongInfoForm } from "@/components/editor/SongInfoForm";
import { SongLinkParser } from "@/components/editor/SongLinkParser";
import {
  FontSchemeSettingsPanel,
  LayoutSettingsPanel,
  VisualSettingsPanel
} from "@/components/editor/StylePanel";
import { AiTranslatePanel } from "@/components/lyrics/AiTranslatePanel";
import { DEFAULT_PALETTE } from "@/lib/palette-background";
import type { AISettingsSummary, AITranslationPhase, TranslationStyle } from "@/lib/ai/types";
import type { createT } from "@/lib/i18n";
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
};

export type EditorStepHandlers = {
  onUrlChange: (url: string) => void;
  onSongParsed: (song: ParsedSongData) => void;
  onLocalAudioParsed: (song: ParsedSongData, embeddedLyrics?: string) => void;
  onSongChange: (song: SongInfo) => void;
  onUseFetchedLyrics: (lyrics: string) => void;
  onLyricsChange: (lyrics: string) => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onTranslationTextChange: (translationText: string) => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onOpenAiTranslate: () => void;
  onCloseAiTranslate: () => void;
  onCancelAiTranslate: () => void;
  onConfirmAiTranslate: (style: TranslationStyle, reasoning: boolean) => void | Promise<void>;
  onStyleChange: (style: CardStyle) => void;
  onFontSchemePreviewChange: (scheme: FontScheme | null) => void;
  onExport: () => void | Promise<void>;
};

type UseEditorStepsInput = {
  state: AppState;
  parsedState: AppState;
  t: ReturnType<typeof createT>;
  canFetchLyrics: boolean;
  themeColor: string;
  cardRef: RefObject<HTMLElement | null>;
  isExporting: boolean;
  ai: EditorStepsAiState;
  handlers: EditorStepHandlers;
};

export function useEditorSteps({
  state,
  parsedState,
  t,
  canFetchLyrics,
  themeColor,
  cardRef,
  isExporting,
  ai,
  handlers
}: UseEditorStepsInput): SettingsStep[] {
  const [songInfoExpanded, setSongInfoExpanded] = useState(false);

  return [
    {
      id: "link",
      title: t("step.songLink"),
      description: t("parseIdle"),
      isComplete: Boolean(state.url.trim() || state.song.title.trim() || state.song.artist.trim() || state.song.coverUrl?.trim()),
      secondaryAction: {
        label: t("manualOverride"),
        onClick: () => setSongInfoExpanded((expanded) => !expanded),
        pressed: songInfoExpanded,
        expanded: songInfoExpanded
      },
      content: (
        <div className="grid gap-4">
          <SongLinkParser
            url={state.url}
            onUrlChange={handlers.onUrlChange}
            onParsed={handlers.onSongParsed}
            t={t}
            autoParseOnMount
          />
          <LocalAudioParser
            t={t}
            onParsed={handlers.onLocalAudioParsed}
          />
          {songInfoExpanded ? (
            <SongInfoForm
              song={state.song}
              onSongChange={handlers.onSongChange}
              t={t}
              showToggle={false}
              forceEnabled
            />
          ) : null}
        </div>
      )
    },
    {
      id: "lyrics",
      title: t("step.lyrics"),
      description: t("manualText"),
      isComplete: state.style.contentMode === "instrumental" || Boolean(state.lyrics.trim()),
      content: (
        <div className="grid gap-4">
          <LyricsFetchPanel
            song={state.song}
            visible={canFetchLyrics}
            onUseLyrics={handlers.onUseFetchedLyrics}
            t={t}
          />
          <LyricInput
            lyrics={state.lyrics}
            onLyricsChange={handlers.onLyricsChange}
            translationEnabled={state.style.translationEnabled}
            translationText={state.style.translationText}
            onTranslationEnabledChange={handlers.onTranslationEnabledChange}
            onTranslationTextChange={handlers.onTranslationTextChange}
            onSplitAlternatingLyrics={handlers.onSplitAlternatingLyrics}
            onAITranslate={handlers.onOpenAiTranslate}
            isAITranslating={ai.isTranslating}
            aiTranslatePanel={ai.isOpen ? (
              <AiTranslatePanel
                locale={state.locale}
                initialStyle={ai.defaultStyle}
                initialReasoning={ai.reasoningEnabled}
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
      isComplete: true,
      content: (
        <VisualSettingsPanel
          style={state.style}
          onStyleChange={handlers.onStyleChange}
          t={t}
        />
      )
    },
    {
      id: "export",
      title: t("step.export"),
      description: t("exportHint"),
      isComplete: true,
      content: (
        <ExportPanel
          state={parsedState}
          cardRef={cardRef}
          t={t}
          isExporting={isExporting}
          onExport={handlers.onExport}
        />
      )
    }
  ];
}
