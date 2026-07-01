"use client";

import { Bot, Download, Info, Loader2, Palette, Settings, SlidersHorizontal, Wallpaper, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { MotionDialogOverlay, MotionDialogPanel } from "@/components/motion/MotionDialog";
import { MotionPresence } from "@/components/motion/MotionPresence";
import { AiSettingsSection } from "@/components/settings/AiSettingsSection";
import { AboutSettingsSection } from "@/components/settings/AboutSettingsSection";
import { AppearanceSettingsSection } from "@/components/settings/AppearanceSettingsSection";
import { BackgroundSettingsSection } from "@/components/settings/BackgroundSettingsSection";
import { ExportSettingsSection } from "@/components/settings/ExportSettingsSection";
import { GeneralSettingsSection } from "@/components/settings/GeneralSettingsSection";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { clearAISettingsApiKey, loadAISettings, saveAISettings } from "@/lib/ai/client";
import { DEFAULT_AI_SETTINGS, type AISettings, type AISettingsSummary } from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { createT } from "@/lib/i18n";
import { motionDurations, motionEasings, reducedMotionTransition, tabPanelVariants } from "@/lib/motion/tokens";
import { settingsCopy } from "@/lib/settings/copy";
import { removeBackgroundImage } from "@/lib/settings/background-storage";
import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";

export function SettingsDialog({ open, locale, userSettings, onLocaleChange, onUserSettingsPreview, onUserSettingsChange, onClose, onSaved, onNotify }: {
  open: boolean; locale: Locale; userSettings: UserSettings; onLocaleChange: (locale: Locale) => void;
  onUserSettingsPreview: (settings: UserSettings) => void; onUserSettingsChange: (settings: UserSettings) => void; onClose: () => void;
  onSaved: (settings: AISettingsSummary, message?: string) => void;
  onNotify: (message: string) => void;
}) {
  const copy = settingsCopy[locale];
  const aiCopy = getAIUiCopy(locale);
  const t = useMemo(() => createT(locale), [locale]);
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState("general");
  const isOpenRef = useRef(open);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSettingsLoadedRef = useRef(false);
  const lastSavedAISettingsRef = useRef("");
  const [draft, setDraft] = useState(userSettings);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingApiKey, setIsClearingApiKey] = useState(false);
  const [error, setError] = useState("");
  const tabs = [
    { id: "general", label: copy.general, icon: SlidersHorizontal }, { id: "appearance", label: copy.appearance, icon: Palette },
    { id: "background", label: copy.background, icon: Wallpaper }, { id: "export", label: copy.export, icon: Download },
    { id: "ai", label: copy.ai, icon: Bot }, { id: "about", label: copy.about, icon: Info }
  ];

  useEffect(() => {
    isOpenRef.current = open;
    if (!open) return;
    setDraft(userSettings); setApiKey(""); setError(""); setIsLoading(true); aiSettingsLoadedRef.current = false;
    loadAISettings().then(({ hasApiKey: configured, ...next }) => {
      setSettings(next);
      setHasApiKey(configured);
      lastSavedAISettingsRef.current = serializeAISettings(next, "");
      aiSettingsLoadedRef.current = true;
    }).catch(() => setError(aiCopy.settingsLoadFailed)).finally(() => setIsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !isClearingApiKey) handleClose(); };
    document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown);
  }, [isClearingApiKey, onClose, open]);

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

  useEffect(() => {
    if (open) return;
    if (aiSaveTimerRef.current) clearTimeout(aiSaveTimerRef.current);
  }, [open]);

  function updateDraft(next: UserSettings) {
    const previousImageId = draft.appBackground.imageId;
    const nextImageId = next.appBackground.imageId;
    setDraft(next);
    onUserSettingsPreview(next);
    onUserSettingsChange(next);
    if (previousImageId && previousImageId !== nextImageId) {
      void removeBackgroundImage(previousImageId).catch(() => undefined);
    }
    queueSavedNotification();
  }

  async function handleBackgroundStored(asset: { imageId: string; imageUrl: string }) {
    if (!isOpenRef.current) {
      await removeBackgroundImage(asset.imageId).catch(() => undefined);
      return false;
    }
    return true;
  }

  function handleClose() {
    const signature = serializeAISettings(settings, apiKey);
    if (aiSettingsLoadedRef.current && signature !== lastSavedAISettingsRef.current) {
      void saveCurrentAISettings(signature);
    }
    isOpenRef.current = false;
    onClose();
  }

  function handleLocaleChange(nextLocale: Locale) {
    onLocaleChange(nextLocale);
    queueSavedNotification();
  }

  function queueSavedNotification(message = aiCopy.settingsSaved) {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = setTimeout(() => {
      onNotify(message);
    }, 420);
  }

  async function saveCurrentAISettings(signature: string) {
    setError(""); setIsSaving(true);
    try {
      const saved = await saveAISettings({ ...settings, apiKey: apiKey.trim() || undefined });
      lastSavedAISettingsRef.current = signature;
      const { hasApiKey: configured, ...nextSettings } = saved;
      setSettings(nextSettings);
      setHasApiKey(configured);
      onSaved(saved);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : aiCopy.settingsSaveFailed); }
    finally { setIsSaving(false); }
  }

  async function handleClearApiKey() {
    if (!hasApiKey) { setApiKey(""); return; }
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
    }
    catch (clearError) { setError(clearError instanceof Error ? clearError.message : aiCopy.apiKeyClearFailed); }
    finally { setIsClearingApiKey(false); }
  }

  const panel = activeTab === "general" ? <GeneralSettingsSection locale={locale} settings={draft} copy={copy} onLocaleChange={handleLocaleChange} onChange={updateDraft} />
    : activeTab === "appearance" ? <AppearanceSettingsSection settings={draft} copy={copy} onChange={updateDraft} />
    : activeTab === "background" ? <BackgroundSettingsSection settings={draft} copy={copy} onChange={updateDraft} onImageStored={handleBackgroundStored} />
    : activeTab === "export" ? <ExportSettingsSection settings={draft} copy={copy} onChange={updateDraft} />
    : activeTab === "about" ? <AboutSettingsSection copy={copy} t={t} />
    : isLoading ? <div className="app-text-subtle flex items-center gap-2 p-5"><Loader2 className="h-4 w-4 animate-spin" />{copy.ai}</div>
    : <AiSettingsSection settings={settings} apiKey={apiKey} hasApiKey={hasApiKey} locale={locale} copy={aiCopy} isClearingApiKey={isClearingApiKey} onSettingsChange={setSettings} onApiKeyChange={setApiKey} onClearApiKey={handleClearApiKey} />;
  const localeTransition = reduceMotion
    ? reducedMotionTransition
    : { duration: motionDurations.fast, ease: motionEasings.standard };
  const localeVariants = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } };

  return (
    <MotionPresence>
      {open ? (
        <MotionDialogOverlay
          className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleClose();
          }}
        >
          <MotionDialogPanel
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            data-testid="settings-dialog"
            className="settings-surface glass-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--panel-border))] p-4 sm:p-5">
              <MotionPresence mode="wait" initial={false}>
                <motion.div key={`settings-title-${locale}`} variants={localeVariants} initial="initial" animate="animate" exit="exit" transition={localeTransition}>
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    <h2 id="settings-dialog-title" className="text-xl font-bold">{copy.settings}</h2>
                  </div>
                  <p className="app-text-subtle mt-1 text-sm">{copy.description}</p>
                </motion.div>
              </MotionPresence>
              <button type="button" onClick={handleClose} className="app-button grid h-9 w-9 place-items-center rounded-lg" aria-label={copy.cancel}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <MotionPresence mode="wait" initial={false}>
                <motion.div key={`settings-tabs-${locale}`} variants={localeVariants} initial="initial" animate="animate" exit="exit" transition={localeTransition} className="w-full md:w-48 md:shrink-0">
                  <SettingsTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
                </motion.div>
              </MotionPresence>
              <div className="min-h-[420px] flex-1 overflow-y-auto p-4 sm:p-5">
                <MotionPresence>
                  <motion.div
                    key={`${activeTab}-${locale}`}
                    variants={tabPanelVariants(reduceMotion ?? false)}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={
                      reduceMotion
                        ? reducedMotionTransition
                        : { duration: motionDurations.normal, ease: motionEasings.standard }
                    }
                  >
                    {panel}
                  </motion.div>
                </MotionPresence>
              </div>
            </div>
            {error ? <p role="alert" className="status-danger mx-5 mb-2 rounded-lg border px-3 py-2 text-sm">{error}</p> : null}
            {isSaving ? <p role="status" className="app-text-subtle px-5 pb-4 text-xs">{aiCopy.saving}</p> : null}
          </MotionDialogPanel>
        </MotionDialogOverlay>
      ) : null}
    </MotionPresence>
  );
}

function serializeAISettings(settings: AISettings, apiKey: string) {
  return JSON.stringify({
    ...settings,
    apiKey: apiKey.trim()
  });
}
