"use client";

import { Bot, Download, Info, Loader2, Palette, Settings, SlidersHorizontal, Wallpaper, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { settingsCopy } from "@/lib/settings/copy";
import { removeBackgroundImage } from "@/lib/settings/background-storage";
import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";

type PendingBackgroundAsset = {
  imageId: string;
  imageUrl: string;
  previousImageId?: string;
};

export function SettingsDialog({ open, locale, userSettings, onLocaleChange, onUserSettingsPreview, onUserSettingsChange, onClose, onSaved }: {
  open: boolean; locale: Locale; userSettings: UserSettings; onLocaleChange: (locale: Locale) => void;
  onUserSettingsPreview: (settings: UserSettings) => void; onUserSettingsChange: (settings: UserSettings) => void; onClose: () => void;
  onSaved: (settings: AISettingsSummary, message?: string) => void;
}) {
  const copy = settingsCopy[locale];
  const aiCopy = getAIUiCopy(locale);
  const t = useMemo(() => createT(locale), [locale]);
  const [activeTab, setActiveTab] = useState("general");
  const originalSettingsRef = useRef(userSettings);
  const isOpenRef = useRef(open);
  const pendingBackgroundRef = useRef<PendingBackgroundAsset | undefined>(undefined);
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
    originalSettingsRef.current = userSettings; pendingBackgroundRef.current = undefined; setDraft(userSettings); setApiKey(""); setError(""); setIsLoading(true);
    loadAISettings().then(({ hasApiKey: configured, ...next }) => { setSettings(next); setHasApiKey(configured); }).catch(() => setError(aiCopy.settingsLoadFailed)).finally(() => setIsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !isSaving && !isClearingApiKey) handleCancel(); };
    document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown);
  }, [isClearingApiKey, isSaving, onClose, open]);

  if (!open) return null;

  function updateDraft(next: UserSettings) {
    setDraft(next);
    onUserSettingsPreview(next);
  }

  async function cleanupPendingBackground() {
    const pending = pendingBackgroundRef.current;
    pendingBackgroundRef.current = undefined;
    if (pending?.imageId) await removeBackgroundImage(pending.imageId).catch(() => undefined);
  }

  async function handleBackgroundStored(asset: { imageId: string; imageUrl: string }) {
    if (!isOpenRef.current) {
      await removeBackgroundImage(asset.imageId).catch(() => undefined);
      return false;
    }
    const previousPending = pendingBackgroundRef.current;
    if (previousPending?.imageId && previousPending.imageId !== asset.imageId) {
      await removeBackgroundImage(previousPending.imageId).catch(() => undefined);
    }
    pendingBackgroundRef.current = { ...asset, previousImageId: originalSettingsRef.current.appBackground.imageId };
    return true;
  }

  function handleCancel() {
    isOpenRef.current = false;
    onUserSettingsPreview(originalSettingsRef.current);
    void cleanupPendingBackground();
    onClose();
  }

  async function handleSave() {
    setError(""); setIsSaving(true);
    try {
      const saved = await saveAISettings({ ...settings, apiKey: apiKey || undefined });
      onUserSettingsChange(draft);
      const originalImageId = originalSettingsRef.current.appBackground.imageId;
      const nextImageId = draft.appBackground.imageId;
      const pending = pendingBackgroundRef.current;
      pendingBackgroundRef.current = undefined;
      const obsoleteIds = new Set([
        originalImageId && originalImageId !== nextImageId ? originalImageId : undefined,
        pending?.imageId && pending.imageId !== nextImageId ? pending.imageId : undefined
      ].filter((value): value is string => Boolean(value)));
      const cleanupResults = await Promise.allSettled([...obsoleteIds].map((imageId) => removeBackgroundImage(imageId)));
      const cleanupFailed = cleanupResults.some((result) => result.status === "rejected");
      isOpenRef.current = false;
      setHasApiKey(saved.hasApiKey); setApiKey(""); onSaved(saved, cleanupFailed ? copy.backgroundSaveFailed : undefined); onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : aiCopy.settingsSaveFailed); }
    finally { setIsSaving(false); }
  }

  async function handleClearApiKey() {
    if (!hasApiKey) { setApiKey(""); return; }
    if (!window.confirm(aiCopy.clearApiKeyConfirm)) return;
    setIsClearingApiKey(true);
    try { const cleared = await clearAISettingsApiKey(); setHasApiKey(false); setApiKey(""); onSaved(cleared, aiCopy.apiKeyCleared); }
    catch (clearError) { setError(clearError instanceof Error ? clearError.message : aiCopy.apiKeyClearFailed); }
    finally { setIsClearingApiKey(false); }
  }

  const panel = activeTab === "general" ? <GeneralSettingsSection locale={locale} settings={draft} copy={copy} onLocaleChange={onLocaleChange} onChange={updateDraft} />
    : activeTab === "appearance" ? <AppearanceSettingsSection settings={draft} copy={copy} onChange={updateDraft} />
    : activeTab === "background" ? <BackgroundSettingsSection settings={draft} copy={copy} onChange={updateDraft} onImageStored={handleBackgroundStored} />
    : activeTab === "export" ? <ExportSettingsSection settings={draft} copy={copy} onChange={updateDraft} />
    : activeTab === "about" ? <AboutSettingsSection copy={copy} t={t} />
    : isLoading ? <div className="app-text-subtle flex items-center gap-2 p-5"><Loader2 className="h-4 w-4 animate-spin" />{copy.ai}</div>
    : <AiSettingsSection settings={settings} apiKey={apiKey} hasApiKey={hasApiKey} locale={locale} copy={aiCopy} isClearingApiKey={isClearingApiKey} onSettingsChange={setSettings} onApiKeyChange={setApiKey} onClearApiKey={handleClearApiKey} />;

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) handleCancel(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" data-testid="settings-dialog" className="settings-surface glass-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--panel-border))] p-4 sm:p-5"><div><div className="flex items-center gap-2"><Settings className="h-5 w-5" /><h2 id="settings-dialog-title" className="text-xl font-bold">{copy.settings}</h2></div><p className="app-text-subtle mt-1 text-sm">{copy.description}</p></div><button type="button" onClick={handleCancel} className="app-button grid h-9 w-9 place-items-center rounded-lg" aria-label={copy.cancel}><X className="h-4 w-4" /></button></div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row"><SettingsTabs tabs={tabs} active={activeTab} onChange={setActiveTab} /><div className="min-h-[420px] flex-1 overflow-y-auto p-4 sm:p-5"><AnimatePresence mode="wait"><motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}>{panel}</motion.div></AnimatePresence></div></div>
      {error ? <p role="alert" className="status-danger mx-5 mb-2 rounded-lg border px-3 py-2 text-sm">{error}</p> : null}
      <div className="flex justify-end gap-3 border-t border-[rgb(var(--panel-border))] p-4"><button type="button" onClick={handleCancel} className="app-button h-10 rounded-lg px-4 text-sm font-semibold">{copy.cancel}</button><button type="button" data-testid="save-settings" onClick={() => void handleSave()} disabled={isSaving || isLoading || isClearingApiKey} className="h-10 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-60" style={{ background: draft.uiAccentColor }}>{isSaving ? aiCopy.saving : copy.save}</button></div>
    </div>
  </div>;
}
