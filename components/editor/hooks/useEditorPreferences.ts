"use client";

import { useEffect, useRef, useState } from "react";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { documentLanguageForLocale } from "@/lib/locale-language";
import { shutdownCoordinator } from "@/lib/persistence/shutdown-coordinator";
import {
  isSupportedLocale,
  loadAppPreferences,
  saveAppPreferences,
  type AppPreferencesPersistenceOptions
} from "@/lib/settings/app-preferences";
import {
  createAppPreferenceSaveCoordinator,
  type AppPreferenceSaveCoordinator
} from "@/lib/settings/app-preference-save-coordinator";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/settings/types";
import { normalizeUserSettings, resolveEffectiveUiThemeId } from "@/lib/settings/user-settings";
import type { Locale } from "@/lib/types";

type UseEditorPreferencesInput = {
  currentLocale: Locale;
  applyLocale: (locale: Locale) => void;
};

export function useEditorPreferences({ currentLocale, applyLocale }: UseEditorPreferencesInput) {
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isDesktopShell, setIsDesktopShell] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const currentLocaleRef = useRef(currentLocale);
  currentLocaleRef.current = currentLocale;
  // One lifetime-stable coordinator preserves both latest-intent composition
  // and the last truly durable value used for failure rollback.
  const preferenceSaveCoordinatorRef = useRef<AppPreferenceSaveCoordinator | null>(null);
  if (!preferenceSaveCoordinatorRef.current) {
    preferenceSaveCoordinatorRef.current = createAppPreferenceSaveCoordinator({
      initialValue: { locale: currentLocale, userSettings: DEFAULT_USER_SETTINGS },
      persist: (value) => saveAppPreferences(value.locale, value.userSettings, value.options)
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
    preferenceSaveCoordinatorRef.current!.queueUserSettings(
      currentLocaleRef.current,
      normalized,
      options
    );
    try {
      await flushPreferenceSave();
    } catch (error) {
      // Roll the optimistic preview back to the last durable settings snapshot.
      const fallback = preferenceSaveCoordinatorRef.current!.rollbackDesiredToPersisted();
      setUserSettings(fallback.userSettings);
      syncWindowMaterial(fallback.userSettings);
      throw error;
    }
  }

  function setLocale(locale: Locale) {
    currentLocaleRef.current = locale;
    applyLocale(locale);
    // Locale changes persist immediately, matching the rest of the settings dialog.
    preferenceSaveCoordinatorRef.current!.queueLocale(locale);
    return flushPreferenceSave();
  }

  async function flushPreferenceSave() {
    await preferenceSaveCoordinatorRef.current!.flush();
  }

  // Desktop close waits for the latest queued preference snapshot to become durable.
  useEffect(() => shutdownCoordinator.register("app-preferences", flushPreferenceSave), []);

  useEffect(() => {
    document.documentElement.lang = documentLanguageForLocale(currentLocale);
  }, [currentLocale]);

  useEffect(() => {
    const desktopShell = Boolean(getLyricsCardDesktopApi());
    setIsDesktopShell(desktopShell);
    document.body.dataset.desktopShell = desktopShell ? "true" : "false";
    let active = true;

    // Ignore a late load after unmount so it cannot revive stale preferences.
    void loadAppPreferences()
      .then((storedPreferences) => {
        if (!active) {
          return;
        }

        const { locale: storedLocale, userSettings: loadedSettings } = storedPreferences;

        currentLocaleRef.current = storedLocale;
        preferenceSaveCoordinatorRef.current!.resetPersisted({
          locale: storedLocale,
          userSettings: loadedSettings
        });
        setUserSettings(loadedSettings);
        syncWindowMaterial(loadedSettings);
        if (isSupportedLocale(storedLocale)) {
          applyLocaleRef.current(storedLocale);
        }
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

  return {
    userSettings,
    isDesktopShell,
    preferencesLoaded,
    previewUserSettings,
    commitUserSettings,
    setLocale
  };
}
