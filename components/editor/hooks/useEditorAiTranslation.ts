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
import {
  AITranslationTransactionController,
  type AITranslationDocumentIntent
} from "@/lib/editor/ai-translation-transaction";
import type { Locale } from "@/lib/types";

export type TranslationValue = {
  text: string;
  enabled: boolean;
};

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
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const aiIntentControllerRef = useRef(new AITranslationTransactionController<TranslationValue>());
  const activeAIIntentRef = useRef<AITranslationDocumentIntent<TranslationValue> | null>(null);
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

    aiAbortControllerRef.current?.abort();
    const controller = new AbortController();
    const intent = aiIntentControllerRef.current.begin(documentRevision, songIdentity, {
      text: previousTranslation,
      enabled: previousEnabled
    });
    activeAIIntentRef.current = intent;
    aiAbortControllerRef.current = controller;
    setIsAITranslating(true);
    setAIError("");
    setAIStreamingText("");
    setAIReasoningText("");
    setAITranslationPhase("connecting");
    const isCurrentIntent = () => aiIntentControllerRef.current.isCurrent(
      intent,
      documentRevisionRef.current,
      songIdentityRef.current
    );
    const writeIfCurrent = (next: TranslationValue) => isCurrentIntent() && applyTranslation(
      next,
      intent.revision,
      intent.songIdentity
    );

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
        onStatus: (phase) => {
          if (isCurrentIntent()) setAITranslationPhase(phase);
        },
        onReasoningDelta: (_delta, accumulated) => {
          if (isCurrentIntent()) setAIReasoningText(accumulated.slice(-12000));
        },
        onDelta: (_delta, accumulated) => {
          if (!isCurrentIntent()) return;
          const cleaned = cleanAITranslation(accumulated);
          setAIStreamingText(cleaned || accumulated.trim());
          if (cleaned && writeIfCurrent({ text: cleaned, enabled: true })) {
            intent.hasWrittenPartial = true;
          }
        }
      });
      const cleaned = cleanAITranslation(raw);
      if (!cleaned) {
        throw new AITranslationError(aiCopy.emptyResponse, "empty_response");
      }
      if (!writeIfCurrent({ text: cleaned, enabled: true })) return;
      setAISettings((current) => ({ ...current, defaultStyle: presetId, reasoningEnabled: reasoning }));
      onNotify(aiCopy.translated);
    } catch (error) {
      if (!isCurrentIntent()) return;
      if (intent.hasWrittenPartial) {
        writeIfCurrent(intent.previousTranslation);
      }
      const aborted = controller.signal.aborted;
      setAIError(aborted ? aiCopy.cancelled : normalizeAIErrorMessage(error));
    } finally {
      if (isCurrentIntent()) {
        aiIntentControllerRef.current.invalidate(intent);
        activeAIIntentRef.current = null;
        aiAbortControllerRef.current = null;
        setIsAITranslating(false);
        setAITranslationPhase("idle");
      }
    }
  }

  function cancelAITranslation() {
    aiAbortControllerRef.current?.abort();
  }

  function invalidateAITranslation() {
    const intent = activeAIIntentRef.current;
    if (!intent) return;
    if (
      intent.hasWrittenPartial &&
      aiIntentControllerRef.current.isCurrent(intent, documentRevisionRef.current, songIdentityRef.current)
    ) {
      applyTranslation(intent.previousTranslation, intent.revision, intent.songIdentity);
    }
    aiIntentControllerRef.current.invalidate(intent);
    activeAIIntentRef.current = null;
    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = null;
    setIsAITranslating(false);
    setAITranslationPhase("idle");
    setAIStreamingText("");
    setAIReasoningText("");
    setAIError("");
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
