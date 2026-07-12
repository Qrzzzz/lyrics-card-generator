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
import type { TranslationValue } from "@/lib/editor/editor-document-state-adapter";
import type { Locale } from "@/lib/types";

type UseEditorAiTranslationInput = {
  locale: Locale;
  lyrics: string;
  documentRevision: number;
  songIdentity: string;
  translation: TranslationValue;
  applyTranslation: (
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
  documentRevision,
  songIdentity,
  translation,
  applyTranslation,
  onNotify,
  onRequireSettings,
  confirmOverwrite = (message) => window.confirm(message)
}: UseEditorAiTranslationInput) {
  const [isAITranslateOpen, setIsAITranslateOpen] = useState(false);
  const [isAITranslating, setIsAITranslating] = useState(false);
  const [aiStreamingText, setAIStreamingText] = useState("");
  const [aiReasoningText, setAIReasoningText] = useState("");
  const [aiTranslationPhase, setAITranslationPhase] = useState<AITranslationPhase>("idle");
  const [aiError, setAIError] = useState("");
  const [aiSettings, setAISettings] = useState<AISettingsSummary>({ ...DEFAULT_AI_SETTINGS, hasApiKey: false });
  const aiOrchestratorRef = useRef(new AITranslationOrchestrator<TranslationValue, AITranslationPhase>());
  const documentRevisionRef = useRef(documentRevision);
  const songIdentityRef = useRef(songIdentity);
  documentRevisionRef.current = documentRevision;
  songIdentityRef.current = songIdentity;
  const aiCopy = useMemo(() => getAIUiCopy(locale), [locale]);

  useEffect(() => {
    void loadAISettings().then(setAISettings).catch(() => undefined);
  }, []);

  function closeAITranslate() {
    setIsAITranslateOpen(false);
  }

  function openAITranslate() {
    if (isAITranslateOpen) {
      setIsAITranslateOpen(false);
      return;
    }

    if (!lyrics.trim()) {
      onNotify(aiCopy.lyricsEmpty);
      return;
    }

    try {
      validateConfiguredSettings(aiSettings);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : aiCopy.configureFirst);
      onRequireSettings();
      return;
    }

    setAIError("");
    setAIStreamingText("");
    setAIReasoningText("");
    setAITranslationPhase("idle");
    setIsAITranslateOpen(true);
  }

  async function translateWithAI(presetId: string, reasoning: boolean) {
    const previousTranslation = translation.text;
    const previousEnabled = translation.enabled;
    if (previousTranslation.trim() && !confirmOverwrite(aiCopy.overwriteConfirm)) {
      return;
    }

    await aiOrchestratorRef.current.run({
      revision: documentRevision,
      songIdentity,
      previousTranslation: { text: previousTranslation, enabled: previousEnabled },
      getCurrentDocument: () => ({
        revision: documentRevisionRef.current,
        songIdentity: songIdentityRef.current
      }),
      applyTranslation,
      clean: cleanAITranslation,
      toValue: (text) => ({ text, enabled: true }),
      createEmptyResponseError: () => new AITranslationError(aiCopy.emptyResponse, "empty_response"),
      onStart: () => {
        setIsAITranslating(true);
        setAIError("");
        setAIStreamingText("");
        setAIReasoningText("");
        setAITranslationPhase("connecting");
      },
      onStatus: setAITranslationPhase,
      onReasoning: (accumulated) => setAIReasoningText(accumulated.slice(-12000)),
      onStreaming: setAIStreamingText,
      onSuccess: () => {
        setAISettings((current) => ({ ...current, defaultStyle: presetId, reasoningEnabled: reasoning }));
        onNotify(aiCopy.translated);
      },
      onFailure: (error) => setAIError(normalizeAIErrorMessage(error)),
      onCancelled: () => {
        setAIError(aiCopy.cancelled);
        setIsAITranslating(false);
        setAITranslationPhase("idle");
      },
      onInvalidated: () => {
        setIsAITranslating(false);
        setAITranslationPhase("idle");
        setAIStreamingText("");
        setAIReasoningText("");
        setAIError("");
      },
      onSettled: () => {
        setIsAITranslating(false);
        setAITranslationPhase("idle");
      },
      stream: async (signal, events) => {
        const prompt = buildLyricsTranslationPrompt({
          lyrics,
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

  function invalidateAITranslation() {
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
