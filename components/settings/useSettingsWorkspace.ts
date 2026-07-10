"use client";

import { useEffect, useRef, useState } from "react";
import type { SettingsTabId } from "@/components/settings/settings-model";
import { clearAISettingsApiKey, loadAISettings, saveAISettings } from "@/lib/ai/client";
import { DEFAULT_AI_SETTINGS, type AISettings, type AISettingsSummary } from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { removeBackgroundImage } from "@/lib/settings/background-storage";
import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";

type SettingsWorkspaceInput = {
  open: boolean;
  requestedTab?: SettingsTabId;
  locale: Locale;
  userSettings: UserSettings;
  onLocaleChange: (locale: Locale) => void;
  onUserSettingsPreview: (settings: UserSettings) => void;
  onUserSettingsChange: (settings: UserSettings) => void;
  onClose: () => void;
  onSaved: (settings: AISettingsSummary, message?: string) => void;
  onNotify: (message: string) => void;
};

export function useSettingsWorkspace({
  open,
  requestedTab,
  locale,
  userSettings,
  onLocaleChange,
  onUserSettingsPreview,
  onUserSettingsChange,
  onClose,
  onSaved,
  onNotify
}: SettingsWorkspaceInput) {
  const aiCopy = getAIUiCopy(locale);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [draft, setDraft] = useState(userSettings);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingApiKey, setIsClearingApiKey] = useState(false);
  const [error, setError] = useState("");
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSettingsLoadedRef = useRef(false);
  const lastSavedAISettingsRef = useRef("");

  useEffect(() => {
    if (!open) return;
    if (requestedTab) setActiveTab(requestedTab);
    setDraft(userSettings);
    setApiKey("");
    setError("");
    setIsLoading(true);
    aiSettingsLoadedRef.current = false;

    let active = true;
    void loadAISettings()
      .then(({ hasApiKey: configured, ...next }) => {
        if (!active) return;
        setSettings(next);
        setHasApiKey(configured);
        lastSavedAISettingsRef.current = serializeAISettings(next, "");
        aiSettingsLoadedRef.current = true;
      })
      .catch(() => {
        if (active) setError(getAIUiCopy(locale).settingsLoadFailed);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !requestedTab) return;
    setActiveTab(requestedTab);
  }, [open, requestedTab]);

  useEffect(() => {
    if (!open || isLoading || !aiSettingsLoadedRef.current) return;
    const signature = serializeAISettings(settings, apiKey);
    if (signature === lastSavedAISettingsRef.current) return;

    if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
    aiSaveTimerRef.current = setTimeout(() => {
      void saveCurrentAISettings(signature);
    }, 700);

    return () => {
      if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
    };
  }, [apiKey, isLoading, open, settings]);

  useEffect(() => () => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
  }, []);

  function updateDraft(next: UserSettings) {
    setDraft((current) => {
      const previousImageId = current.appBackground.imageId;
      const nextImageId = next.appBackground.imageId;
      if (previousImageId && previousImageId !== nextImageId) {
        void removeBackgroundImage(previousImageId).catch(() => undefined);
      }
      return next;
    });
    onUserSettingsPreview(next);
    onUserSettingsChange(next);
    queueSavedNotification();
  }

  function handleLocaleChange(nextLocale: Locale) {
    onLocaleChange(nextLocale);
    queueSavedNotification(getAIUiCopy(nextLocale).settingsSaved);
  }

  function closeWorkspace() {
    if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
    const signature = serializeAISettings(settings, apiKey);
    if (aiSettingsLoadedRef.current && signature !== lastSavedAISettingsRef.current) {
      void saveCurrentAISettings(signature);
    }
    onClose();
  }

  async function handleClearApiKey() {
    if (!hasApiKey) {
      setApiKey("");
      return;
    }
    if (!window.confirm(aiCopy.clearApiKeyConfirm)) return;
    setIsClearingApiKey(true);
    try {
      const cleared = await clearAISettingsApiKey();
      const { hasApiKey: configured, ...nextSettings } = cleared;
      setSettings(nextSettings);
      setHasApiKey(configured);
      setApiKey("");
      lastSavedAISettingsRef.current = serializeAISettings(nextSettings, "");
      onSaved(cleared, aiCopy.apiKeyCleared);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : aiCopy.apiKeyClearFailed);
    } finally {
      setIsClearingApiKey(false);
    }
  }

  function queueSavedNotification(message = aiCopy.settingsSaved) {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = setTimeout(() => onNotify(message), 420);
  }

  async function saveCurrentAISettings(signature: string) {
    setError("");
    setIsSaving(true);
    try {
      const saved = await saveAISettings({ ...settings, apiKey: apiKey.trim() || undefined });
      lastSavedAISettingsRef.current = signature;
      const { hasApiKey: configured, ...nextSettings } = saved;
      setSettings(nextSettings);
      setHasApiKey(configured);
      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : getAIUiCopy(locale).settingsSaveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return {
    activeTab,
    setActiveTab,
    draft,
    updateDraft,
    settings,
    setSettings,
    apiKey,
    setApiKey,
    hasApiKey,
    isLoading,
    isSaving,
    isClearingApiKey,
    error,
    handleLocaleChange,
    handleClearApiKey,
    closeWorkspace
  };
}

function serializeAISettings(settings: AISettings, apiKey: string) {
  return JSON.stringify({ ...settings, apiKey: apiKey.trim() });
}
