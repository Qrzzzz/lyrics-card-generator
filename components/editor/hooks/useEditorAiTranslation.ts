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
import type { Locale } from "@/lib/types";

export type TranslationValue = {
  text: string;
  enabled: boolean;
};

type UseEditorAiTranslationInput = {
  locale: Locale;
  lyrics: string;
  translation: TranslationValue;
  setTranslation: (next: TranslationValue) => void;
  onNotify: (message: string) => void;
  onRequireSettings: () => void;
  confirmOverwrite?: (message: string) => boolean;
};

export function useEditorAiTranslation({
  locale,
  lyrics,
  translation,
  setTranslation,
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
  const aiAbortControllerRef = useRef<AbortController | null>(null);
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

    const controller = new AbortController();
    aiAbortControllerRef.current = controller;
    setIsAITranslating(true);
    setAIError("");
    setAIStreamingText("");
    setAIReasoningText("");
    setAITranslationPhase("connecting");
    let wrotePartial = false;

    try {
      const prompt = buildLyricsTranslationPrompt({
        lyrics,
        presetId,
        targetLocale: locale,
        promptLibrary: aiSettings.promptLibrary
      });
      const raw = await streamAITranslation({
        prompt,
        reasoning,
        signal: controller.signal,
        onStatus: setAITranslationPhase,
        onReasoningDelta: (_delta, accumulated) => setAIReasoningText(accumulated.slice(-12000)),
        onDelta: (_delta, accumulated) => {
          const cleaned = cleanAITranslation(accumulated);
          setAIStreamingText(cleaned || accumulated.trim());
          if (cleaned) {
            wrotePartial = true;
            setTranslation({ text: cleaned, enabled: true });
          }
        }
      });
      const cleaned = cleanAITranslation(raw);
      if (!cleaned) {
        throw new AITranslationError(aiCopy.emptyResponse, "empty_response");
      }
      setTranslation({ text: cleaned, enabled: true });
      setAISettings((current) => ({ ...current, defaultStyle: presetId, reasoningEnabled: reasoning }));
      onNotify(aiCopy.translated);
    } catch (error) {
      if (wrotePartial) {
        setTranslation({ text: previousTranslation, enabled: previousEnabled });
      }
      const aborted = controller.signal.aborted;
      setAIError(aborted ? aiCopy.cancelled : normalizeAIErrorMessage(error));
    } finally {
      aiAbortControllerRef.current = null;
      setIsAITranslating(false);
      setAITranslationPhase("idle");
    }
  }

  function cancelAITranslation() {
    aiAbortControllerRef.current?.abort();
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
    setAISettings,
    refreshAISettings
  };
}
