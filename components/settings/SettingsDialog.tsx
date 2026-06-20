"use client";

import { Loader2, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AiSettingsSection } from "@/components/settings/AiSettingsSection";
import { LanguageSettingsSection } from "@/components/settings/LanguageSettingsSection";
import { clearAISettingsApiKey, loadAISettings, saveAISettings } from "@/lib/ai/client";
import { DEFAULT_AI_SETTINGS, type AISettings, type AISettingsSummary } from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { Locale } from "@/lib/types";

export function SettingsDialog({
  open,
  locale,
  onLocaleChange,
  onClose,
  onSaved
}: {
  open: boolean;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onClose: () => void;
  onSaved: (settings: AISettingsSummary, message?: string) => void;
}) {
  const copy = getAIUiCopy(locale);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingApiKey, setIsClearingApiKey] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setApiKey("");
    setError("");
    setIsLoading(true);
    loadAISettings()
      .then((loaded) => {
        const { hasApiKey: configured, ...nextSettings } = loaded;
        setSettings(nextSettings);
        setHasApiKey(configured);
      })
      .catch(() => setError(copy.settingsLoadFailed))
      .finally(() => setIsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving && !isClearingApiKey) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isClearingApiKey, isSaving, onClose, open]);

  if (!open) {
    return null;
  }

  async function handleSave() {
    setError("");
    setIsSaving(true);
    try {
      const saved = await saveAISettings({ ...settings, apiKey: apiKey || undefined });
      setHasApiKey(saved.hasApiKey);
      setApiKey("");
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.settingsSaveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearApiKey() {
    if (!hasApiKey) {
      setApiKey("");
      return;
    }
    if (!window.confirm(copy.clearApiKeyConfirm)) {
      return;
    }

    setError("");
    setIsClearingApiKey(true);
    try {
      const cleared = await clearAISettingsApiKey();
      setHasApiKey(false);
      setApiKey("");
      onSaved(cleared, copy.apiKeyCleared);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : copy.apiKeyClearFailed);
    } finally {
      setIsClearingApiKey(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving && !isClearingApiKey) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        data-testid="settings-dialog"
        className="settings-surface glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl p-5 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <h2 id="settings-dialog-title" className="app-text-primary text-xl font-bold">{copy.settingsTitle}</h2>
            </div>
            <p className="app-text-subtle text-sm">{copy.settingsDescription}</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving || isClearingApiKey} aria-label={copy.cancel} className="app-button grid h-9 w-9 place-items-center rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5">
          <LanguageSettingsSection locale={locale} title={copy.languageSection} onLocaleChange={onLocaleChange} />
          {isLoading ? (
            <div className="app-text-subtle flex items-center gap-2 border-t border-white/10 pt-5 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> {copy.aiSection}
            </div>
          ) : (
            <AiSettingsSection
              settings={settings}
              apiKey={apiKey}
              hasApiKey={hasApiKey}
              locale={locale}
              copy={copy}
              isClearingApiKey={isClearingApiKey}
              onSettingsChange={setSettings}
              onApiKeyChange={setApiKey}
              onClearApiKey={handleClearApiKey}
            />
          )}
        </div>

        {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSaving || isClearingApiKey} className="app-button h-10 rounded-lg px-4 text-sm font-semibold">{copy.cancel}</button>
          <button type="button" data-testid="save-settings" onClick={handleSave} disabled={isSaving || isLoading || isClearingApiKey} className="h-10 rounded-lg bg-cyan-200 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? copy.saving : copy.save}
          </button>
        </div>
      </div>
    </div>
  );
}
