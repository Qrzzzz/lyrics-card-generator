"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeAIErrorMessage } from "@/components/editor/utils/normalizeAIErrorMessage";
import { cleanAITranslation } from "@/lib/ai/clean";
import {
  AITranslationError,
  loadAISettings,
  streamAITranslation,
  validateConfiguredSettings
} from "@/lib/ai/client";
import { buildLyricsTranslationPrompt } from "@/lib/ai/prompt";
import {
  DEFAULT_AI_SETTINGS,
  type AISettingsSummary,
  type AITranslationPhase
} from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { AITranslationOrchestrator } from "@/lib/editor/ai-translation-orchestrator";
import type {
  EditorDocumentSnapshot,
  TranslationValue
} from "@/lib/editor/editor-document-state-adapter";
import type { Locale } from "@/lib/types";

type UseEditorAiTranslationInput = {
  locale: Locale;
  lyrics: string;
  beginAITranslation: () => EditorDocumentSnapshot;
  getCurrentDocumentSnapshot: () => EditorDocumentSnapshot;
  applyPartial: (
    next: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) => boolean;
  commitTerminal: (
    next: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) => boolean;
  onNotify: (message: string) => void;
  onRequireSettings: () => void;
  confirmOverwrite?: (message: string) => boolean;
};

export function useEditorAiTranslation({
  locale,
  lyrics,
  beginAITranslation,
  getCurrentDocumentSnapshot,
  applyPartial,
  commitTerminal,
  onNotify,
  onRequireSettings,
  confirmOverwrite = (message) => window.confirm(message)
}: UseEditorAiTranslationInput) {
  const [isAITranslateOpen, setIsAITranslateOpen] = useState(false);
  const [isAITranslating, setIsAITranslating] = useState(false);
  const [aiStreamingText, setAIStreamingText] = useState("");
  const [aiReasoningText, setAIReasoningText] = useState("");
  const [aiTranslationPhase, setAITranslationPhase] = useState<AITranslationPhase>("idle");
  const [aiFailure, setAIFailure] = useState<unknown>(null);
  const [aiSettings, setAISettings] = useState<AISettingsSummary>({ ...DEFAULT_AI_SETTINGS, hasApiKey: false });
  // The orchestrator owns cancellation, partial rollback, and revision/song-identity guards.
  const aiOrchestratorRef = useRef(new AITranslationOrchestrator<TranslationValue, AITranslationPhase>());
  const aiCopy = useMemo(() => getAIUiCopy(locale), [locale]);
  const aiError = useMemo(
    () => aiFailure ? normalizeAIErrorMessage(aiFailure, locale) : "",
    [aiFailure, locale]
  );

  useEffect(() => {
    void loadAISettings().then(setAISettings).catch(() => undefined);
  }, []);

  function closeAITranslate() {
    setIsAITranslateOpen(false);
  }

  function openAITranslate() {
    if (isAITranslateOpen) return;

    if (!lyrics.trim()) {
      onNotify(aiCopy.lyricsEmpty);
      return;
    }

    try {
      validateConfiguredSettings(aiSettings);
    } catch (error) {
      onNotify(normalizeAIErrorMessage(error, locale));
      onRequireSettings();
      return;
    }

    setAIFailure(null);
    setAIStreamingText("");
    setAIReasoningText("");
    setAITranslationPhase("idle");
    setIsAITranslateOpen(true);
  }

  async function translateWithAI(presetId: string, reasoning: boolean) {
    const currentDocument = getCurrentDocumentSnapshot();
    const previousTranslation = currentDocument.translation.text;
    if (previousTranslation.trim() && !confirmOverwrite(aiCopy.overwriteConfirm)) {
      return;
    }
    const intent = beginAITranslation();

    await aiOrchestratorRef.current.run({
      revision: intent.revision,
      songIdentity: intent.songIdentity,
      previousTranslation: intent.translation,
      getCurrentDocument: () => getCurrentDocumentSnapshot(),
      applyPartial,
      commitTerminal,
      clean: cleanAITranslation,
      toValue: (text) => ({ text, enabled: true }),
      createEmptyResponseError: () => new AITranslationError(aiCopy.emptyResponse, "empty_response"),
      onStart: () => {
        setIsAITranslating(true);
        setAIFailure(null);
        setAIStreamingText("");
        setAIReasoningText("");
        setAITranslationPhase("connecting");
      },
      onStatus: setAITranslationPhase,
      // Bound diagnostic reasoning retained in React state while preserving the newest context.
      onReasoning: (accumulated) => setAIReasoningText(accumulated.slice(-12000)),
      onStreaming: setAIStreamingText,
      onSuccess: () => {
        setAISettings((current) => ({ ...current, defaultStyle: presetId, reasoningEnabled: reasoning }));
        onNotify(aiCopy.translated);
      },
      onFailure: setAIFailure,
      onCancelled: () => {
        setAIFailure(new AITranslationError("Cancelled.", "cancelled"));
        setIsAITranslating(false);
        setAITranslationPhase("idle");
      },
      onInvalidated: () => {
        setIsAITranslating(false);
        setAITranslationPhase("idle");
        setAIStreamingText("");
        setAIReasoningText("");
        setAIFailure(null);
      },
      onSettled: () => {
        setIsAITranslating(false);
        setAITranslationPhase("idle");
      },
      stream: async (signal, events) => {
        // Build from the intent snapshot, never from lyrics that may change during streaming.
        const prompt = buildLyricsTranslationPrompt({
          lyrics: intent.lyrics,
          presetId,
          targetLocale: locale,
          promptLibrary: aiSettings.promptLibrary
        });
        return streamAITranslation({
          prompt,
          reasoning,
          signal,
          onStatus: events.onStatus,
          onReasoningDelta: events.onReasoningDelta,
          onDelta: events.onDelta
        });
      }
    });
  }

  function cancelAITranslation() {
    aiOrchestratorRef.current.cancel();
  }

  function invalidateAITranslation(reason: "document" | "ai-start" = "document") {
    if (reason === "ai-start") {
      aiOrchestratorRef.current.prepareReplacement();
      return undefined;
    }
    return aiOrchestratorRef.current.invalidate();
  }

  async function refreshAISettings() {
    const nextSettings = await loadAISettings();
    setAISettings(nextSettings);
    return nextSettings;
  }

  return {
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
    setAISettings,
    refreshAISettings
  };
}
