"use client";

import { useEffect, useRef, useState } from "react";
import type { SettingsTabId } from "@/components/settings/settings-model";
import { normalizeAIErrorMessage } from "@/components/editor/utils/normalizeAIErrorMessage";
import type { ToastNotifier } from "@/components/feedback/AppToast";
import {
  createLatestSaveController,
  type LatestSaveController,
  type SaveSnapshot,
  type SaveState
} from "@/lib/ai/ai-settings-save-controller";
import { clearAISettingsApiKey, loadAISettings, saveAISettings } from "@/lib/ai/client";
import { DEFAULT_AI_SETTINGS, type AISettings, type AISettingsSummary } from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { shutdownCoordinator } from "@/lib/persistence/shutdown-coordinator";
import { removeBackgroundImage } from "@/lib/settings/background-storage";
import type { AppPreferencesPersistenceOptions } from "@/lib/settings/app-preferences";
import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";

export type { SaveState } from "@/lib/ai/ai-settings-save-controller";

type AISaveValue = {
  settings: AISettings;
  apiKey: string;
};

type SyncErrorKind = "load" | "save" | null;

type SettingsWorkspaceInput = {
  open: boolean;
  requestedTab?: SettingsTabId;
  locale: Locale;
  userSettings: UserSettings;
  onLocaleChange: (locale: Locale) => void | Promise<void>;
  onUserSettingsPreview: (settings: UserSettings) => void;
  onUserSettingsChange: (settings: UserSettings, options?: AppPreferencesPersistenceOptions) => void | Promise<void>;
  onClose: () => void;
  onSaved: (settings: AISettingsSummary, message?: string) => void;
  onNotify: ToastNotifier;
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
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [syncErrorKind, setSyncErrorKind] = useState<SyncErrorKind>(null);
  const [isClearingApiKey, setIsClearingApiKey] = useState(false);
  const [error, setError] = useState("");
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSettingsLoadedRef = useRef(false);
  const isClearingApiKeyRef = useRef(false);
  // Serialize saves and key deletion so independent desktop writes cannot race.
  const aiWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestLifecycleRef = useRef({ locale, onSaved });
  latestLifecycleRef.current = { locale, onSaved };
  const latestAISaveValueRef = useRef<AISaveValue>({ settings, apiKey });
  latestAISaveValueRef.current = { settings, apiKey };
  const saveControllerRef = useRef<LatestSaveController<AISaveValue> | null>(null);

  function runSerializedAIWrite<T>(write: () => Promise<T>) {
    const result = aiWriteQueueRef.current.then(write);
    aiWriteQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }

  if (!saveControllerRef.current) {
    // A stable latest-save controller collapses rapid edits while preserving durable ordering.
    saveControllerRef.current = createLatestSaveController<AISaveValue, AISettingsSummary>({
      persist: ({ value }) => runSerializedAIWrite(() =>
        saveAISettings({
          ...value.settings,
          apiKey: value.apiKey.trim() || undefined
        })
      ),
      onStateChange: (nextState) => {
        setSaveState(nextState);
        if (nextState !== "error") {
          setSyncErrorKind(null);
          setError("");
        }
      },
      onPersisted: (saved, _snapshot, isLatest) => {
        if (!isLatest) return;
        const { hasApiKey: configured, ...nextSettings } = saved;
        setSettings(nextSettings);
        setHasApiKey(configured);
        latestLifecycleRef.current.onSaved(saved);
      },
      onError: (saveError) => {
        const currentLocale = latestLifecycleRef.current.locale;
        setError(normalizeAIErrorMessage(saveError, currentLocale, getAIUiCopy(currentLocale).settingsSaveFailed));
        setSyncErrorKind("save");
      }
    });
  }

  async function flushPendingAISettings() {
    if (aiSaveTimerRef.current) {
      clearTimeout(aiSaveTimerRef.current);
      aiSaveTimerRef.current = null;
    }
    const saveController = saveControllerRef.current!;
    if (aiSettingsLoadedRef.current) {
      const { settings: latestSettings, apiKey: latestApiKey } = latestAISaveValueRef.current;
      saveController.setDesired(createAISaveSnapshot(latestSettings, latestApiKey));
      await saveController.flushLatest();
    }
    await saveController.whenIdle();
    await aiWriteQueueRef.current;
    if (saveController.getState().status === "error") {
      throw new Error(error || getAIUiCopy(latestLifecycleRef.current.locale).settingsSaveFailed);
    }
  }

  // Desktop shutdown waits for debounce, controller, and serialized write queues to drain.
  useEffect(() => shutdownCoordinator.register("ai-settings", flushPendingAISettings), [error]);

  useEffect(() => {
    if (!open) return;
    if (requestedTab) setActiveTab(requestedTab);
    setDraft(userSettings);
    setApiKey("");
    setError("");
    setSyncErrorKind(null);
    setIsLoading(true);
    aiSettingsLoadedRef.current = false;

    let active = true;
    const saveController = saveControllerRef.current!;
    setSaveState(saveController.getState().status);
    // Load only after prior saves settle, avoiding stale storage overwriting newer edits.
    void saveController.whenIdle()
      .then(() => {
        if (!active) return undefined;
        return loadAISettings();
      })
      .then((loaded) => {
        if (!active || !loaded) return;
        const { hasApiKey: configured, ...next } = loaded;
        setSettings(next);
        setHasApiKey(configured);
        saveController.resetPersisted(createAISaveSnapshot(next, ""));
        aiSettingsLoadedRef.current = true;
      })
      .catch((loadError) => {
        if (active) {
          setError(normalizeAIErrorMessage(loadError, locale, getAIUiCopy(locale).settingsLoadFailed));
          setSyncErrorKind("load");
          setSaveState("error");
        }
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
    if (!open || isLoading || isClearingApiKeyRef.current || !aiSettingsLoadedRef.current) return;
    const saveController = saveControllerRef.current!;
    saveController.setDesired(createAISaveSnapshot(settings, apiKey));

    if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
    if (!saveController.needsPersistence() || saveController.getState().status === "saving") return;
    aiSaveTimerRef.current = setTimeout(() => {
      aiSaveTimerRef.current = null;
      void saveController.flushLatest();
    }, 700);

    return () => {
      if (aiSaveTimerRef.current) {
        clearTimeout(aiSaveTimerRef.current);
        aiSaveTimerRef.current = null;
      }
    };
  }, [apiKey, isClearingApiKey, isLoading, open, settings]);

  useEffect(() => () => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
  }, []);

  function updateDraft(next: UserSettings, options?: AppPreferencesPersistenceOptions) {
    const previous = draft;
    setDraft((current) => {
      const previousImageId = current.appBackground.imageId;
      const nextImageId = next.appBackground.imageId;
      if (previousImageId && previousImageId !== nextImageId) {
        void removeBackgroundImage(previousImageId).catch(() => undefined);
      }
      return next;
    });
    onUserSettingsPreview(next);
    void Promise.resolve(onUserSettingsChange(next, options))
      .then(() => queueSavedNotification())
      .catch((saveError) => {
        // Roll back only if the failed optimistic snapshot is still the visible draft.
        setDraft((current) => current === next ? previous : current);
        setError(normalizeAIErrorMessage(saveError, locale, aiCopy.settingsSaveFailed));
        setSyncErrorKind("save");
        setSaveState("error");
      });
  }

  function handleLocaleChange(nextLocale: Locale) {
    void Promise.resolve(onLocaleChange(nextLocale))
      .then(() => queueSavedNotification(getAIUiCopy(nextLocale).settingsSaved))
      .catch((saveError) => {
        setError(normalizeAIErrorMessage(saveError, nextLocale, getAIUiCopy(nextLocale).settingsSaveFailed));
        setSyncErrorKind("save");
        setSaveState("error");
      });
  }

  function closeWorkspace() {
    if (isClearingApiKeyRef.current) return;
    if (aiSaveTimerRef.current) {
      clearTimeout(aiSaveTimerRef.current);
      aiSaveTimerRef.current = null;
    }
    if (aiSettingsLoadedRef.current) {
      const saveController = saveControllerRef.current!;
      saveController.setDesired(createAISaveSnapshot(settings, apiKey));
      void saveController.flushLatest();
    }
    onClose();
  }

  async function handleClearApiKey() {
    // Reconcile pending/failed saves before and after key removal to avoid resurrecting the key.
    const saveController = saveControllerRef.current!;
    const desiredAfterClear = createAISaveSnapshot(settings, "");
    const controllerState = saveController.getState();
    const shouldClearPersistedKey =
      hasApiKey ||
      controllerState.inFlightSignature !== undefined ||
      controllerState.persistedSignature === undefined ||
      controllerState.persistedSignature !== desiredAfterClear.signature;

    if (!shouldClearPersistedKey) {
      if (aiSaveTimerRef.current) {
        clearTimeout(aiSaveTimerRef.current);
        aiSaveTimerRef.current = null;
      }
      saveController.setDesired(desiredAfterClear);
      setApiKey("");
      return;
    }
    isClearingApiKeyRef.current = true;
    setIsClearingApiKey(true);
    setError("");
    setSyncErrorKind(null);
    try {
      if (aiSaveTimerRef.current) {
        clearTimeout(aiSaveTimerRef.current);
        aiSaveTimerRef.current = null;
      }
      if (aiSettingsLoadedRef.current) {
        saveController.setDesired(desiredAfterClear);
        setApiKey("");
        await saveController.flushLatest();
      }
      const saveFailedBeforeClear = saveController.getState().status === "error";
      setSaveState("saving");
      const cleared = await runSerializedAIWrite(clearAISettingsApiKey);
      const { hasApiKey: configured, ...nextSettings } = cleared;
      setHasApiKey(configured);
      setApiKey("");
      const clearedSnapshot = createAISaveSnapshot(nextSettings, "");
      saveController.resetPersisted(clearedSnapshot);

      if (saveFailedBeforeClear) {
        saveController.setDesired(desiredAfterClear);
        await saveController.flushLatest();
        if (desiredAfterClear.signature === clearedSnapshot.signature) {
          setSettings(nextSettings);
          onSaved(cleared, aiCopy.apiKeyCleared);
        } else {
          onNotify(aiCopy.apiKeyCleared, "success");
        }
      } else {
        setSettings(nextSettings);
        setSaveState("saved");
        onSaved(cleared, aiCopy.apiKeyCleared);
      }
    } catch (clearError) {
      setHasApiKey(true);
      setError(normalizeAIErrorMessage(clearError, locale, aiCopy.apiKeyClearFailed));
      setSyncErrorKind("save");
      setSaveState("error");
    } finally {
      isClearingApiKeyRef.current = false;
      setIsClearingApiKey(false);
    }
  }

  function queueSavedNotification(message = aiCopy.settingsSaved) {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = setTimeout(() => onNotify(message, "success"), 420);
  }

  return {
    activeTab,
    setActiveTab,
    draft,
    updateDraft,
    settings,
    setSettings: (nextSettings: AISettings) => {
      if (!isClearingApiKeyRef.current) setSettings(nextSettings);
    },
    apiKey,
    setApiKey: (nextApiKey: string) => {
      if (!isClearingApiKeyRef.current) setApiKey(nextApiKey);
    },
    hasApiKey,
    isLoading,
    isSaving: saveState === "saving",
    saveState,
    syncErrorKind,
    isClearingApiKey,
    error,
    handleLocaleChange,
    handleClearApiKey,
    closeWorkspace
  };
}

function createAISaveSnapshot(settings: AISettings, apiKey: string): SaveSnapshot<AISaveValue> {
  return {
    signature: serializeAISettings(settings, apiKey),
    value: { settings, apiKey }
  };
}

function serializeAISettings(settings: AISettings, apiKey: string) {
  return JSON.stringify({ ...settings, apiKey: apiKey.trim() });
}
