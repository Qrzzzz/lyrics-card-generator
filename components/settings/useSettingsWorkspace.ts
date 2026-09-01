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
import { clearAISettingsApiKey, loadAISettings, saveAISettings, testAIConnection } from "@/lib/ai/client";
import { DEFAULT_AI_SETTINGS, type AISettings, type AISettingsSummary } from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { shutdownCoordinator } from "@/lib/persistence/shutdown-coordinator";
import { runFireAndForgetSave } from "@/lib/settings/fire-and-forget-save";
import type { AppPreferencesPersistenceOptions } from "@/lib/settings/app-preferences";
import type { UserSettings } from "@/lib/settings/types";
import { settingsCopy } from "@/lib/settings/copy";
import type { SettingsPersistenceIssueChange, SettingsPersistenceSource } from "@/lib/settings/persistence-issue";
import type { Locale } from "@/lib/types";

export type { SaveState } from "@/lib/ai/ai-settings-save-controller";

type AISaveValue = {
  settings: AISettings;
  apiKey: string;
};

type SyncErrorKind = "load" | "save" | null;

type SettingsWorkspaceInput = {
  open: boolean;
  loadAI: boolean;
  requestedTab?: SettingsTabId;
  locale: Locale;
  userSettings: UserSettings;
  onLocaleChange: (locale: Locale) => void | Promise<void>;
  onUserSettingsPreview: (settings: UserSettings) => void;
  onUserSettingsChange: (settings: UserSettings, options?: AppPreferencesPersistenceOptions) => void | Promise<void>;
  onClose: () => void;
  onSaved: (settings: AISettingsSummary, message?: string) => void;
  onNotify: ToastNotifier;
  onPersistenceIssueChange: SettingsPersistenceIssueChange;
};

export function useSettingsWorkspace({
  open,
  loadAI,
  requestedTab,
  locale,
  userSettings,
  onLocaleChange,
  onUserSettingsPreview,
  onUserSettingsChange,
  onClose,
  onSaved,
  onNotify,
  onPersistenceIssueChange
}: SettingsWorkspaceInput) {
  const aiCopy = getAIUiCopy(locale);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [draft, setDraft] = useState(userSettings);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aiInitialized, setAIInitialized] = useState(false);
  const [aiLoadAttempt, setAILoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [syncErrorKind, setSyncErrorKind] = useState<SyncErrorKind>(null);
  const [isClearingApiKey, setIsClearingApiKey] = useState(false);
  const [error, setError] = useState("");
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSettingsLoadedRef = useRef(false);
  const aiLoadStartedRef = useRef(false);
  const lastAIErrorRef = useRef("");
  const isClearingApiKeyRef = useRef(false);
  // Serialize saves and key deletion so independent desktop writes cannot race.
  const aiWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestLifecycleRef = useRef({
    locale,
    userSettings,
    onSaved,
    onNotify,
    onPersistenceIssueChange,
    onUserSettingsPreview,
    onUserSettingsChange,
    onLocaleChange
  });
  latestLifecycleRef.current = {
    locale,
    userSettings,
    onSaved,
    onNotify,
    onPersistenceIssueChange,
    onUserSettingsPreview,
    onUserSettingsChange,
    onLocaleChange
  };
  const latestAISaveValueRef = useRef<AISaveValue>({ settings, apiKey });
  latestAISaveValueRef.current = { settings, apiKey };
  const saveControllerRef = useRef<LatestSaveController<AISaveValue> | null>(null);

  function runSerializedAIWrite<T>(write: () => Promise<T>) {
    const result = aiWriteQueueRef.current.then(write);
    aiWriteQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }

  function clearPersistenceIssue(source: SettingsPersistenceSource) {
    latestLifecycleRef.current.onPersistenceIssueChange(source, null);
  }

  function publishPersistenceFailure(
    source: SettingsPersistenceSource,
    message: string,
    retry: () => Promise<void>
  ) {
    const retryLabel = settingsCopy[latestLifecycleRef.current.locale].retrySave;
    latestLifecycleRef.current.onPersistenceIssueChange(source, { message, retryLabel, retry });
    latestLifecycleRef.current.onNotify(message, "error");
  }

  async function retryUserSettings(
    next: UserSettings,
    previous: UserSettings,
    options?: AppPreferencesPersistenceOptions
  ) {
    const lifecycle = latestLifecycleRef.current;
    setDraft(next);
    lifecycle.onUserSettingsPreview(next);
    try {
      await lifecycle.onUserSettingsChange(next, options);
      clearPersistenceIssue("preferences");
      queueSavedNotification();
    } catch (saveError) {
      setDraft((current) => current === next ? previous : current);
      const message = normalizeAIErrorMessage(
        saveError,
        lifecycle.locale,
        settingsCopy[lifecycle.locale].preferenceSaveFailed
      );
      publishPersistenceFailure("preferences", message, () => retryUserSettings(next, previous, options));
      throw saveError;
    }
  }

  async function retryLocale(nextLocale: Locale) {
    try {
      await latestLifecycleRef.current.onLocaleChange(nextLocale);
      clearPersistenceIssue("preferences");
      queueSavedNotification(getAIUiCopy(nextLocale).settingsSaved);
    } catch (saveError) {
      const message = normalizeAIErrorMessage(
        saveError,
        nextLocale,
        settingsCopy[nextLocale].preferenceSaveFailed
      );
      publishPersistenceFailure("preferences", message, () => retryLocale(nextLocale));
      throw saveError;
    }
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
        clearPersistenceIssue("ai");
        lastAIErrorRef.current = "";
      },
      onError: (saveError) => {
        const currentLocale = latestLifecycleRef.current.locale;
        const message = normalizeAIErrorMessage(saveError, currentLocale, getAIUiCopy(currentLocale).settingsSaveFailed);
        lastAIErrorRef.current = message;
        setError(message);
        setSyncErrorKind("save");
        publishPersistenceFailure("ai", message, flushPendingAISettings);
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
      throw new Error(lastAIErrorRef.current || getAIUiCopy(latestLifecycleRef.current.locale).settingsSaveFailed);
    }
  }

  // Desktop shutdown waits for debounce, controller, and serialized write queues to drain.
  useEffect(() => shutdownCoordinator.register("ai-settings", flushPendingAISettings), [error]);

  useEffect(() => {
    if (!open) return;
    if (requestedTab) setActiveTab(requestedTab);
    setDraft(userSettings);
  }, [open]);

  useEffect(() => {
    if (!loadAI || aiSettingsLoadedRef.current || aiLoadStartedRef.current) return;
    aiLoadStartedRef.current = true;
    setError("");
    setSyncErrorKind(null);
    setIsLoading(true);

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
        setAIInitialized(true);
      })
      .catch((loadError) => {
        if (active) {
          setError(normalizeAIErrorMessage(loadError, locale, getAIUiCopy(locale).settingsLoadFailed));
          setSyncErrorKind("load");
          setSaveState("error");
        }
      })
      .finally(() => {
        aiLoadStartedRef.current = false;
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [aiLoadAttempt, loadAI]);

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
    setDraft(next);
    onUserSettingsPreview(next);
    runFireAndForgetSave(
      () => onUserSettingsChange(next, options),
      {
        onSuccess: () => {
          clearPersistenceIssue("preferences");
          queueSavedNotification();
        },
        onError: (saveError) => {
          // Roll back only if the failed optimistic snapshot is still the visible draft.
          setDraft((current) => current === next ? previous : current);
          const message = normalizeAIErrorMessage(saveError, locale, settingsCopy[locale].preferenceSaveFailed);
          setError(message);
          setSyncErrorKind("save");
          setSaveState("error");
          publishPersistenceFailure("preferences", message, () => retryUserSettings(next, previous, options));
        }
      }
    );
  }

  function handleLocaleChange(nextLocale: Locale) {
    runFireAndForgetSave(
      () => onLocaleChange(nextLocale),
      {
        onSuccess: () => {
          clearPersistenceIssue("preferences");
          queueSavedNotification(getAIUiCopy(nextLocale).settingsSaved);
        },
        onError: (saveError) => {
          const message = normalizeAIErrorMessage(saveError, nextLocale, settingsCopy[nextLocale].preferenceSaveFailed);
          setError(message);
          setSyncErrorKind("save");
          setSaveState("error");
          publishPersistenceFailure("preferences", message, () => retryLocale(nextLocale));
        }
      }
    );
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
      void flushPendingAISettings().catch(() => undefined);
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
      clearPersistenceIssue("ai");

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
      const message = normalizeAIErrorMessage(clearError, locale, aiCopy.apiKeyClearFailed);
      setError(message);
      setSyncErrorKind("save");
      setSaveState("error");
      publishPersistenceFailure("ai", message, handleClearApiKey);
    } finally {
      isClearingApiKeyRef.current = false;
      setIsClearingApiKey(false);
    }
  }

  async function handleTestConnection(signal: AbortSignal) {
    // The test reads durable settings. A failed save therefore prevents any provider request.
    await flushPendingAISettings();
    await testAIConnection({ signal });
  }

  function retryAISettingsLoad() {
    if (aiSettingsLoadedRef.current) return;
    setError("");
    setSyncErrorKind(null);
    setAILoadAttempt((attempt) => attempt + 1);
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
    aiInitialized,
    isLoading,
    isSaving: saveState === "saving",
    saveState,
    syncErrorKind,
    isClearingApiKey,
    error,
    handleLocaleChange,
    handleClearApiKey,
    handleTestConnection,
    retryAISettingsLoad,
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
