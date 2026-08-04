"use client";

import { useEffect, useRef, useState } from "react";
import { createLatestSaveController, type SaveSnapshot } from "@/lib/ai/ai-settings-save-controller";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { documentLanguageForLocale } from "@/lib/locale-language";
import { shutdownCoordinator } from "@/lib/persistence/shutdown-coordinator";
import { loadBackgroundImage } from "@/lib/settings/background-storage";
import {
  isSupportedLocale,
  loadAppPreferences,
  saveAppPreferences,
  shouldShowFirstLaunchLanguage,
  type AppPreferencesPersistenceOptions
} from "@/lib/settings/app-preferences";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/settings/types";
import { normalizeUserSettings, resolveEffectiveUiThemeId, saveUserSettings } from "@/lib/settings/user-settings";
import type { Locale } from "@/lib/types";

type UseEditorPreferencesInput = {
  currentLocale: Locale;
  applyLocale: (locale: Locale) => void;
};

type PreferenceSaveValue = {
  locale: Locale;
  userSettings: UserSettings;
  options?: AppPreferencesPersistenceOptions;
};

export function useEditorPreferences({ currentLocale, applyLocale }: UseEditorPreferencesInput) {
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>();
  const [isDesktopShell, setIsDesktopShell] = useState(false);
  const [isFirstLaunchOpen, setIsFirstLaunchOpen] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const committedUserSettingsRef = useRef<UserSettings>(DEFAULT_USER_SETTINGS);
  const currentLocaleRef = useRef(currentLocale);
  currentLocaleRef.current = currentLocale;
  const latestPreferencesRef = useRef<PreferenceSaveValue>({
    locale: currentLocale,
    userSettings: DEFAULT_USER_SETTINGS
  });
  const persistenceErrorRef = useRef<unknown>(null);
  const preferenceSaveControllerRef = useRef<ReturnType<typeof createLatestSaveController<PreferenceSaveValue, unknown>> | null>(null);
  if (!preferenceSaveControllerRef.current) {
    preferenceSaveControllerRef.current = createLatestSaveController<PreferenceSaveValue, unknown>({
      persist: ({ value }) => saveAppPreferences(value.locale, value.userSettings, value.options),
      onPersisted: (_result, snapshot) => {
        committedUserSettingsRef.current = snapshot.value.userSettings;
        persistenceErrorRef.current = null;
      },
      onError: (error) => { persistenceErrorRef.current = error; }
    });
  }
  const applyLocaleRef = useRef(applyLocale);
  applyLocaleRef.current = applyLocale;

  function syncWindowMaterial(settings: UserSettings) {
    const desktop = getLyricsCardDesktopApi();
    if (desktop) {
      void desktop.setWindowMaterial(resolveEffectiveUiThemeId(settings)).catch(() => undefined);
    }
  }

  function previewUserSettings(next: UserSettings) {
    setUserSettings(next);
    syncWindowMaterial(next);
  }

  async function commitUserSettings(next: UserSettings, options?: AppPreferencesPersistenceOptions) {
    const normalized = normalizeUserSettings(next);
    setUserSettings(normalized);
    syncWindowMaterial(normalized);
    queuePreferenceSave(currentLocaleRef.current, normalized, options);
    try {
      await flushPreferenceSave();
    } catch (error) {
      const committed = committedUserSettingsRef.current;
      const fallback = { locale: currentLocaleRef.current, userSettings: committed };
      latestPreferencesRef.current = fallback;
      preferenceSaveControllerRef.current!.resetPersisted(createPreferenceSaveSnapshot(fallback));
      persistenceErrorRef.current = null;
      setUserSettings(committed);
      syncWindowMaterial(committed);
      throw error;
    }
  }

  function setLocale(locale: Locale) {
    currentLocaleRef.current = locale;
    applyLocale(locale);
    // Locale changes persist immediately, matching the rest of the settings dialog.
    queuePreferenceSave(locale, committedUserSettingsRef.current);
    return flushPreferenceSave();
  }

  async function chooseFirstLaunchLanguage(locale: Locale) {
    const saved = saveUserSettings({
      ...committedUserSettingsRef.current,
      firstLaunchLanguageSelected: true
    });
    committedUserSettingsRef.current = saved;
    currentLocaleRef.current = locale;
    applyLocale(locale);
    setUserSettings(saved);
    queuePreferenceSave(locale, saved);
    await flushPreferenceSave();
    setIsFirstLaunchOpen(false);
  }

  function queuePreferenceSave(
    locale: Locale,
    settings: UserSettings,
    options?: AppPreferencesPersistenceOptions
  ) {
    const value = { locale, userSettings: settings, options };
    latestPreferencesRef.current = value;
    const controller = preferenceSaveControllerRef.current!;
    controller.setDesired(createPreferenceSaveSnapshot(value));
    void controller.flushLatest();
  }

  async function flushPreferenceSave() {
    const controller = preferenceSaveControllerRef.current!;
    controller.setDesired(createPreferenceSaveSnapshot(latestPreferencesRef.current));
    await controller.flushLatest();
    await controller.whenIdle();
    if (controller.getState().status === "error") {
      throw persistenceErrorRef.current ?? new Error("Unable to save application preferences.");
    }
  }

  useEffect(() => shutdownCoordinator.register("app-preferences", flushPreferenceSave), []);

  useEffect(() => {
    document.documentElement.lang = documentLanguageForLocale(currentLocale);
  }, [currentLocale]);

  useEffect(() => {
    const desktopShell = Boolean(getLyricsCardDesktopApi());
    setIsDesktopShell(desktopShell);
    document.body.dataset.desktopShell = desktopShell ? "true" : "false";
    let active = true;

    void loadAppPreferences()
      .then((storedPreferences) => {
        if (!active) {
          return;
        }

        const { locale: storedLocale, userSettings: loadedSettings } = storedPreferences;

        committedUserSettingsRef.current = loadedSettings;
        currentLocaleRef.current = storedLocale;
        latestPreferencesRef.current = { locale: storedLocale, userSettings: loadedSettings };
        preferenceSaveControllerRef.current!.resetPersisted(
          createPreferenceSaveSnapshot(latestPreferencesRef.current)
        );
        setUserSettings(loadedSettings);
        syncWindowMaterial(loadedSettings);
        if (isSupportedLocale(storedLocale)) {
          applyLocaleRef.current(storedLocale);
        }
        setIsFirstLaunchOpen(shouldShowFirstLaunchLanguage(storedLocale, loadedSettings));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setPreferencesLoaded(true);
      });

    return () => {
      active = false;
      delete document.body.dataset.desktopShell;
    };
  }, []);

  useEffect(() => {
    const effectiveTheme = resolveEffectiveUiThemeId(userSettings);
    document.body.dataset.uiTheme = effectiveTheme;
    return () => {
      delete document.body.dataset.uiTheme;
    };
  }, [userSettings.uiThemeMode, userSettings.uiAcrylicEnabled]);

  useEffect(() => {
    document.body.dataset.reduceMotion = !preferencesLoaded || userSettings.reduceMotionEnabled ? "true" : "false";
    return () => {
      delete document.body.dataset.reduceMotion;
    };
  }, [preferencesLoaded, userSettings.reduceMotionEnabled]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;

    loadBackgroundImage(userSettings.appBackground.imageId, userSettings.appBackground.imageUrl)
      .then((url) => {
        if (!active) {
          if (url?.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
          return;
        }

        objectUrl = url?.startsWith("blob:") ? url : undefined;
        setBackgroundImageUrl(url);
      })
      .catch(() => {
        if (active) {
          setBackgroundImageUrl(undefined);
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [userSettings.appBackground.imageId, userSettings.appBackground.imageUrl]);

  return {
    userSettings,
    backgroundImageUrl,
    isDesktopShell,
    isFirstLaunchOpen,
    preferencesLoaded,
    previewUserSettings,
    commitUserSettings,
    setLocale,
    chooseFirstLaunchLanguage
  };
}

function createPreferenceSaveSnapshot(value: PreferenceSaveValue): SaveSnapshot<PreferenceSaveValue> {
  return {
    signature: JSON.stringify(value),
    value
  };
}
