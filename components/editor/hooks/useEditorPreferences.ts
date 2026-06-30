"use client";

import { useEffect, useRef, useState } from "react";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { loadBackgroundImage } from "@/lib/settings/background-storage";
import {
  isSupportedLocale,
  loadAppPreferences,
  saveAppPreferences,
  shouldShowFirstLaunchLanguage
} from "@/lib/settings/app-preferences";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/settings/types";
import { saveUserSettings } from "@/lib/settings/user-settings";
import type { Locale } from "@/lib/types";

type UseEditorPreferencesInput = {
  currentLocale: Locale;
  applyLocale: (locale: Locale) => void;
};

export function useEditorPreferences({ currentLocale, applyLocale }: UseEditorPreferencesInput) {
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>();
  const [isDesktopShell, setIsDesktopShell] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFirstLaunchOpen, setIsFirstLaunchOpen] = useState(false);
  const committedUserSettingsRef = useRef<UserSettings>(DEFAULT_USER_SETTINGS);
  const applyLocaleRef = useRef(applyLocale);
  applyLocaleRef.current = applyLocale;

  function syncWindowMaterial(settings: UserSettings) {
    const desktop = getLyricsCardDesktopApi();
    if (desktop) {
      void desktop.setWindowMaterial(settings.uiTheme).catch(() => undefined);
    }
  }

  function openSettings() {
    setIsSettingsOpen(true);
  }

  function closeSettings() {
    setIsSettingsOpen(false);
  }

  function previewUserSettings(next: UserSettings) {
    setUserSettings(next);
    syncWindowMaterial(next);
  }

  function commitUserSettings(next: UserSettings) {
    const saved = saveUserSettings(next);
    committedUserSettingsRef.current = saved;
    setUserSettings(saved);
    syncWindowMaterial(saved);
    void saveAppPreferences(currentLocale, saved).catch(() => undefined);
  }

  function setLocale(locale: Locale) {
    applyLocale(locale);
    void saveAppPreferences(locale, committedUserSettingsRef.current).catch(() => undefined);
  }

  async function chooseFirstLaunchLanguage(locale: Locale) {
    const saved = saveUserSettings({
      ...committedUserSettingsRef.current,
      firstLaunchLanguageSelected: true
    });
    committedUserSettingsRef.current = saved;
    applyLocale(locale);
    setUserSettings(saved);
    await saveAppPreferences(locale, saved).catch(() => undefined);
    setIsFirstLaunchOpen(false);
  }

  useEffect(() => {
    const desktopShell = Boolean(getLyricsCardDesktopApi());
    setIsDesktopShell(desktopShell);
    document.body.dataset.desktopShell = desktopShell ? "true" : "false";
    let active = true;

    void loadAppPreferences().then(({ locale: storedLocale, userSettings: loadedSettings }) => {
      if (!active) {
        return;
      }

      committedUserSettingsRef.current = loadedSettings;
      setUserSettings(loadedSettings);
      syncWindowMaterial(loadedSettings);
      if (isSupportedLocale(storedLocale)) {
        applyLocaleRef.current(storedLocale);
      }
      setIsFirstLaunchOpen(shouldShowFirstLaunchLanguage(storedLocale, loadedSettings));
    });

    return () => {
      active = false;
      delete document.body.dataset.desktopShell;
    };
  }, []);

  useEffect(() => {
    document.body.dataset.uiTheme = userSettings.uiTheme;
    return () => {
      delete document.body.dataset.uiTheme;
    };
  }, [userSettings.uiTheme]);

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
    isSettingsOpen,
    isFirstLaunchOpen,
    openSettings,
    closeSettings,
    previewUserSettings,
    commitUserSettings,
    setLocale,
    chooseFirstLaunchLanguage
  };
}
