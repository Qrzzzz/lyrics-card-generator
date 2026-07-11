"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronRight,
  FileKey2,
  FileLock2,
  FilePenLine,
  FolderCog,
  FolderOpen,
  Info,
  LockKeyhole,
  Plus,
  RotateCcw,
  Trash2,
  UnlockKeyhole
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  ActionButton,
  FieldLabel,
  SelectField,
  TextareaField,
  TextInput,
  ToggleRow
} from "@/components/ui/controls";
import { getDefaultFormatRules, getDefaultStylePrompt } from "@/lib/ai/prompt";
import { getAIPromptUiCopy } from "@/lib/ai/prompt-ui-copy";
import { getLocalePromptOverrides, isValidCustomPreset, setLocalePromptOverrides } from "@/lib/ai/settings-normalize";
import { EDITABLE_STYLE_ORDER, getTranslationPresets, getTranslationStyles, isEditableTranslationStyle, isTranslationStyle } from "@/lib/ai/styles";
import type { AICustomPreset, AIPromptLibrary, AISettings, EditableTranslationStyle } from "@/lib/ai/types";
import type { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { Locale } from "@/lib/types";

export type AIPage = "root" | "api" | "library" | "format" | `preset:${string}` | `draft:${string}`;
type NavigationState = { entries: AIPage[]; index: number };

export function AiSettingsSection({
  open,
  settings,
  apiKey,
  hasApiKey,
  locale,
  copy,
  isClearingApiKey,
  onSettingsChange,
  onApiKeyChange,
  onClearApiKey
}: {
  open: boolean;
  settings: AISettings;
  apiKey: string;
  hasApiKey: boolean;
  locale: Locale;
  copy: ReturnType<typeof getAIUiCopy>;
  isClearingApiKey: boolean;
  onSettingsChange: (settings: AISettings) => void;
  onApiKeyChange: (apiKey: string) => void;
  onClearApiKey: () => void;
}) {
  const promptCopy = getAIPromptUiCopy(locale);
  const [navigation, setNavigation] = useState<NavigationState>({ entries: ["root"], index: 0 });
  const [draftPreset, setDraftPreset] = useState<AICustomPreset | null>(null);
  const page = navigation.entries[navigation.index];

  useEffect(() => {
    if (open) return;
    setDraftPreset(null);
    setNavigation({ entries: ["root"], index: 0 });
  }, [open]);

  useEffect(() => {
    if (isExistingPage(page, settings, draftPreset)) return;
    setNavigation((current) => replaceHistoryPage(current, "library"));
  }, [draftPreset, page, settings]);

  function navigate(next: AIPage) {
    if (next === page) return;
    if (page.startsWith("draft:")) setDraftPreset(null);
    setNavigation((current) => {
      const nextEntries = [...current.entries.slice(0, current.index + 1), next];
      return { entries: nextEntries, index: nextEntries.length - 1 };
    });
  }

  function moveHistory(delta: number) {
    if (page.startsWith("draft:")) setDraftPreset(null);
    setNavigation((current) => ({ ...current, index: Math.max(0, Math.min(current.entries.length - 1, current.index + delta)) }));
  }

  function createDraft() {
    if (settings.promptLibrary.customPresets.length >= 2) return;
    const draft = { id: `custom:${crypto.randomUUID()}`, title: "", prompt: "" };
    setDraftPreset(draft);
    navigate(`draft:${draft.id}`);
  }

  function saveDraft() {
    if (!draftPreset || !isValidCustomPreset(draftPreset)) return;
    updateLibrary(settings, onSettingsChange, {
      ...settings.promptLibrary,
      customPresets: [...settings.promptLibrary.customPresets, {
        ...draftPreset,
        title: draftPreset.title.trim(),
        prompt: draftPreset.prompt.trim()
      }]
    });
    setDraftPreset(null);
    setNavigation((current) => replaceHistoryPage(current, `preset:${draftPreset.id}`));
  }

  function handlePresetDeleted(id: string) {
    setNavigation((current) => sanitizeDeletedPresetHistory(current, id));
  }

  const breadcrumbs = getBreadcrumbs(page, promptCopy, settings, locale);

  return (
    <section className="grid gap-4">
      <div className="rounded-xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--input-bg))] p-2">
        <div className="flex items-center gap-1.5">
          <ActionButton variant="icon" size="sm" aria-label={promptCopy.back} title={promptCopy.back} disabled={navigation.index === 0} onClick={() => moveHistory(-1)} icon={<ArrowLeft className="h-4 w-4" />} />
          <ActionButton variant="icon" size="sm" aria-label={promptCopy.forward} title={promptCopy.forward} disabled={navigation.index >= navigation.entries.length - 1} onClick={() => moveHistory(1)} icon={<ArrowRight className="h-4 w-4" />} />
          <div className="ml-1 flex min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-[rgb(var(--input-border))] bg-black/10 px-2 py-1.5">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.page}-${index}`} className="flex shrink-0 items-center">
                {index ? <ChevronRight className="app-text-subtle mx-1 h-3.5 w-3.5" /> : null}
                <button type="button" onClick={() => navigate(item.page)} className={`rounded px-1.5 py-1 text-xs transition hover:bg-white/5 ${index === breadcrumbs.length - 1 ? "app-text-primary font-semibold" : "app-text-muted"}`}>
                  {item.label}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {page === "root" ? (
        <WorkspaceRoot copy={promptCopy} onOpen={navigate} />
      ) : page === "api" ? (
        <ApiConfigurationPage
          settings={settings}
          apiKey={apiKey}
          hasApiKey={hasApiKey}
          locale={locale}
          copy={copy}
          promptCopy={promptCopy}
          isClearingApiKey={isClearingApiKey}
          onSettingsChange={onSettingsChange}
          onApiKeyChange={onApiKeyChange}
          onClearApiKey={onClearApiKey}
        />
      ) : page === "library" ? (
        <PromptLibraryPage settings={settings} locale={locale} copy={promptCopy} onSettingsChange={onSettingsChange} onOpen={navigate} onCreateDraft={createDraft} />
      ) : page === "format" ? (
        <FormatRulesPage settings={settings} locale={locale} copy={promptCopy} onSettingsChange={onSettingsChange} />
      ) : page.startsWith("draft:") && draftPreset ? (
        <CustomPresetDraftPage draft={draftPreset} copy={promptCopy} onChange={setDraftPreset} onSave={saveDraft} onCancel={() => navigate("library")} />
      ) : (
        <PresetEditorPage
          presetId={page.slice("preset:".length)}
          settings={settings}
          locale={locale}
          copy={promptCopy}
          onSettingsChange={onSettingsChange}
          onDeleted={handlePresetDeleted}
        />
      )}
    </section>
  );
}

function WorkspaceRoot({ copy, onOpen }: { copy: ReturnType<typeof getAIPromptUiCopy>; onOpen: (page: AIPage) => void }) {
  return (
    <div className="grid gap-4">
      <PageHeading icon={<Bot className="h-5 w-5" />} title={copy.workspace} description={copy.workspaceDescription} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ExplorerCard icon={<FileKey2 className="h-6 w-6" />} title={copy.apiConfiguration} description={copy.apiConfigurationDescription} action={copy.open} onClick={() => onOpen("api")} />
        <ExplorerCard icon={<FolderCog className="h-6 w-6" />} title={copy.promptLibrary} description={copy.promptLibraryDescription} action={copy.open} onClick={() => onOpen("library")} />
      </div>
    </div>
  );
}

function ApiConfigurationPage({ settings, apiKey, hasApiKey, locale, copy, promptCopy, isClearingApiKey, onSettingsChange, onApiKeyChange, onClearApiKey }: {
  settings: AISettings; apiKey: string; hasApiKey: boolean; locale: Locale; copy: ReturnType<typeof getAIUiCopy>; promptCopy: ReturnType<typeof getAIPromptUiCopy>;
  isClearingApiKey: boolean; onSettingsChange: (settings: AISettings) => void; onApiKeyChange: (value: string) => void; onClearApiKey: () => void;
}) {
  const baseUrlId = useId();
  const apiKeyId = useId();
  const modelId = useId();
  const temperatureId = useId();
  const defaultStyleId = useId();
  const presets = getTranslationPresets(locale, settings.promptLibrary);
  return (
    <div className="grid gap-4">
      <PageHeading icon={<FileKey2 className="h-5 w-5" />} title={promptCopy.apiConfiguration} description={promptCopy.apiConfigurationDescription} />
      <FieldLabel label={copy.baseUrl} htmlFor={baseUrlId}>
        <TextInput id={baseUrlId} type="url" value={settings.baseUrl} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" autoComplete="url" />
        <SettingTip>{copy.baseUrlTip}</SettingTip>
      </FieldLabel>
      <FieldLabel label={copy.apiKey} hint={hasApiKey ? copy.apiKeyConfigured : undefined} htmlFor={apiKeyId}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextInput id={apiKeyId} type="password" value={apiKey} disabled={isClearingApiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder={hasApiKey ? "****************" : copy.apiKeyPlaceholder} autoComplete="new-password" spellCheck={false} className="min-w-0 flex-1" />
          <ActionButton data-testid="clear-api-key" onClick={onClearApiKey} disabled={!hasApiKey && !apiKey} loading={isClearingApiKey} variant="danger" icon={<Trash2 className="h-4 w-4" />} className="shrink-0">
            {isClearingApiKey ? copy.clearingApiKey : copy.clearApiKey}
          </ActionButton>
        </div>
        <SettingTip>{copy.apiKeyTip}</SettingTip>
      </FieldLabel>
      <FieldLabel label={copy.model} htmlFor={modelId}>
        <TextInput id={modelId} value={settings.model} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, model: event.target.value })} placeholder={copy.modelPlaceholder} spellCheck={false} />
        <SettingTip>{copy.modelTip}</SettingTip>
      </FieldLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldLabel label={copy.temperature} htmlFor={temperatureId}>
          <TextInput id={temperatureId} type="number" min={0} max={2} step={0.1} value={settings.temperature} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, temperature: Number(event.target.value) })} />
          <SettingTip>{copy.temperatureTip}</SettingTip>
        </FieldLabel>
        <FieldLabel label={copy.defaultStyle} htmlFor={defaultStyleId}>
          <SelectField id={defaultStyleId} value={settings.defaultStyle} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, defaultStyle: event.target.value })}>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </SelectField>
          <SettingTip>{copy.defaultStyleTip}</SettingTip>
        </FieldLabel>
      </div>
      <ToggleRow label={copy.defaultReasoning} checked={settings.reasoningEnabled} disabled={isClearingApiKey} onChange={(reasoningEnabled) => onSettingsChange({ ...settings, reasoningEnabled })} />
      <SettingTip>{copy.reasoningHint}</SettingTip>
    </div>
  );
}

function PromptLibraryPage({ settings, locale, copy, onSettingsChange, onOpen, onCreateDraft }: {
  settings: AISettings; locale: Locale; copy: ReturnType<typeof getAIPromptUiCopy>; onSettingsChange: (settings: AISettings) => void; onOpen: (page: AIPage) => void; onCreateDraft: () => void;
}) {
  const styles = getTranslationStyles(locale);
  const presets = getTranslationPresets(locale, settings.promptLibrary);
  const removed = EDITABLE_STYLE_ORDER.filter((id) => settings.promptLibrary.hiddenStyleIds.includes(id));
  const localeOverrides = getLocalePromptOverrides(settings.promptLibrary, locale);

  function restorePreset(id: EditableTranslationStyle) {
    updateLibrary(settings, onSettingsChange, {
      ...settings.promptLibrary,
      hiddenStyleIds: settings.promptLibrary.hiddenStyleIds.filter((item) => item !== id)
    });
  }

  return (
    <div className="grid gap-5">
      <PageHeading icon={<FolderOpen className="h-5 w-5" />} title={copy.promptLibrary} description={copy.promptLibraryDescription} />
      <ExplorerCard icon={<FileLock2 className="h-6 w-6 text-amber-200" />} title={copy.formatRules} description={copy.formatRulesDescription} action={copy.open} badge={localeOverrides.formatRulesOverride ? copy.modified : undefined} onClick={() => onOpen("format")} />

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h4 className="app-text-primary text-sm font-semibold">{copy.defaultPresets}</h4><p className="app-text-muted mt-1 text-xs">1 + {5 - removed.length} / 6</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {presets.filter((preset) => preset.source !== "custom").map((preset) => (
            <ExplorerCard key={preset.id} icon={preset.source === "recommended" ? <LockKeyhole className="h-5 w-5" /> : <FilePenLine className="h-5 w-5" />} title={preset.name} description={preset.description} action={copy.open} badge={preset.source === "recommended" ? copy.protectedPreset : localeOverrides.styleOverrides.some((item) => item.id === preset.id) ? copy.modified : undefined} onClick={() => onOpen(`preset:${preset.id}`)} />
          ))}
        </div>
      </div>

      {removed.length ? (
        <div className="settings-panel-card p-4">
          <h4 className="app-text-primary text-sm font-semibold">{copy.restorePreset}</h4>
          <p className="app-text-muted mt-1 text-xs">{copy.restorePresetDescription}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {removed.map((id) => <ActionButton key={id} size="sm" onClick={() => restorePreset(id)} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>{styles.find((style) => style.id === id)?.name}</ActionButton>)}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h4 className="app-text-primary text-sm font-semibold">{copy.customPresets}</h4><p className="app-text-muted mt-1 text-xs">{copy.customPresetsDescription}</p></div>
          <span className="app-text-subtle shrink-0 text-xs">{settings.promptLibrary.customPresets.length}/2</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {settings.promptLibrary.customPresets.map((preset) => <ExplorerCard key={preset.id} icon={<FilePenLine className="h-5 w-5" />} title={preset.title || copy.newPresetTitle} description={preset.prompt || copy.presetPromptPlaceholder} action={copy.open} badge={copy.customPreset} onClick={() => onOpen(`preset:${preset.id}`)} />)}
          {settings.promptLibrary.customPresets.length < 2 ? (
            <button type="button" onClick={onCreateDraft} className="app-text-muted flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--input-border))] p-5 text-sm transition hover:border-[rgb(var(--focus-ring))] hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]">
              <Plus className="h-4 w-4" />{copy.addPreset}
            </button>
          ) : null}
        </div>
        <p className="app-text-subtle mt-2 text-xs">{copy.presetLimit}</p>
      </div>
    </div>
  );
}

function FormatRulesPage({ settings, locale, copy, onSettingsChange }: { settings: AISettings; locale: Locale; copy: ReturnType<typeof getAIPromptUiCopy>; onSettingsChange: (settings: AISettings) => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const defaultRules = getDefaultFormatRules(locale);
  const localeOverrides = getLocalePromptOverrides(settings.promptLibrary, locale);
  const value = localeOverrides.formatRulesOverride || defaultRules;

  function requestUnlock() {
    if (!window.confirm(copy.unlockConfirmFirst)) return;
    if (!window.confirm(copy.unlockConfirmSecond)) return;
    setUnlocked(true);
  }

  function resetRules() {
    if (!window.confirm(copy.resetRulesConfirm)) return;
    updateLibrary(settings, onSettingsChange, setLocalePromptOverrides(settings.promptLibrary, locale, { ...localeOverrides, formatRulesOverride: "" }));
    setUnlocked(false);
  }

  return (
    <div className="grid gap-4">
      <PageHeading icon={<FileLock2 className="h-5 w-5 text-amber-200" />} title={copy.formatRules} description={copy.formatRulesDescription} />
      <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4">
        <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><p className="text-sm leading-relaxed text-amber-50/90">{copy.formatRulesWarning}</p></div>
      </div>
      <TextareaField aria-label={copy.formatRules} value={value} readOnly={!unlocked} className={`min-h-72 font-mono text-xs leading-relaxed ${unlocked ? "ring-1 ring-amber-300/40" : "opacity-80"}`} onChange={(event) => updateLibrary(settings, onSettingsChange, setLocalePromptOverrides(settings.promptLibrary, locale, { ...localeOverrides, formatRulesOverride: event.target.value }))} />
      <div className="flex flex-wrap justify-end gap-2">
        {localeOverrides.formatRulesOverride ? <ActionButton onClick={resetRules} leftIcon={<RotateCcw className="h-4 w-4" />}>{copy.reset}</ActionButton> : null}
        <ActionButton variant={unlocked ? "primary" : "danger"} onClick={() => unlocked ? setUnlocked(false) : requestUnlock()} leftIcon={unlocked ? <LockKeyhole className="h-4 w-4" /> : <UnlockKeyhole className="h-4 w-4" />}>
          {unlocked ? copy.lockRules : copy.unlockRules}
        </ActionButton>
      </div>
    </div>
  );
}

function CustomPresetDraftPage({ draft, copy, onChange, onSave, onCancel }: {
  draft: AICustomPreset;
  copy: ReturnType<typeof getAIPromptUiCopy>;
  onChange: (draft: AICustomPreset) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const valid = isValidCustomPreset(draft);
  return (
    <div className="grid gap-4">
      <PageHeading icon={<FilePenLine className="h-5 w-5" />} title={draft.title.trim() || copy.newPresetTitle} description={copy.customPreset} />
      <FieldLabel label={copy.presetTitle}>
        <TextInput value={draft.title} maxLength={60} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
      </FieldLabel>
      <FieldLabel label={copy.presetPrompt}>
        <TextareaField value={draft.prompt} maxLength={4000} placeholder={copy.presetPromptPlaceholder} className="min-h-64 text-sm leading-relaxed" onChange={(event) => onChange({ ...draft, prompt: event.target.value })} />
        <SettingTip>{copy.requiredFields}</SettingTip>
      </FieldLabel>
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton onClick={onCancel}>{copy.discardDraft}</ActionButton>
        <ActionButton variant="primary" disabled={!valid} onClick={onSave}>{copy.savePreset}</ActionButton>
      </div>
    </div>
  );
}

function PresetEditorPage({ presetId, settings, locale, copy, onSettingsChange, onDeleted }: { presetId: string; settings: AISettings; locale: Locale; copy: ReturnType<typeof getAIPromptUiCopy>; onSettingsChange: (settings: AISettings) => void; onDeleted: (id: string) => void }) {
  const styles = getTranslationStyles(locale);
  const builtIn = isTranslationStyle(presetId);
  const protectedPreset = presetId === "recommended";
  const editableBuiltIn = isEditableTranslationStyle(presetId);
  const defaultStyle = builtIn ? styles.find((style) => style.id === presetId) : undefined;
  const localeOverrides = getLocalePromptOverrides(settings.promptLibrary, locale);
  const override = editableBuiltIn ? localeOverrides.styleOverrides.find((item) => item.id === presetId) : undefined;
  const custom = !builtIn ? settings.promptLibrary.customPresets.find((item) => item.id === presetId) : undefined;
  const [customDraft, setCustomDraft] = useState<AICustomPreset>(() => custom ?? { id: presetId, title: "", prompt: "" });
  useEffect(() => {
    if (custom) setCustomDraft(custom);
  }, [custom?.id, presetId]);
  const title = protectedPreset ? defaultStyle?.name || "" : override?.title || customDraft.title || defaultStyle?.name || "";
  const prompt = protectedPreset ? getDefaultStylePrompt(locale, "recommended") : override?.prompt || customDraft.prompt || (editableBuiltIn ? getDefaultStylePrompt(locale, presetId) : "");

  if (!builtIn && !custom) {
    return <div className="app-text-muted p-6 text-sm">{copy.customPresetsEmpty}</div>;
  }

  function updatePreset(nextTitle: string, nextPrompt: string) {
    if (protectedPreset) return;
    if (editableBuiltIn) {
      const nextOverride = { id: presetId, title: nextTitle, prompt: nextPrompt };
      updateLibrary(settings, onSettingsChange, setLocalePromptOverrides(settings.promptLibrary, locale, {
        ...localeOverrides,
        styleOverrides: [...localeOverrides.styleOverrides.filter((item) => item.id !== presetId), nextOverride]
      }));
      return;
    }
    setCustomDraft({ id: presetId, title: nextTitle, prompt: nextPrompt });
  }

  function saveCustomPreset() {
    if (!custom || !isValidCustomPreset(customDraft)) return;
    updateLibrary(settings, onSettingsChange, {
      ...settings.promptLibrary,
      customPresets: settings.promptLibrary.customPresets.map((item) => item.id === presetId
        ? { ...customDraft, title: customDraft.title.trim(), prompt: customDraft.prompt.trim() }
        : item)
    });
  }

  function resetPreset() {
    if (!editableBuiltIn || !window.confirm(copy.resetPresetConfirm)) return;
    updateLibrary(settings, onSettingsChange, setLocalePromptOverrides(settings.promptLibrary, locale, {
      ...localeOverrides,
      styleOverrides: localeOverrides.styleOverrides.filter((item) => item.id !== presetId)
    }));
  }

  function deletePreset() {
    if (protectedPreset || !window.confirm(copy.deletePresetConfirm)) return;
    if (editableBuiltIn) {
      updateLibrary(settings, onSettingsChange, {
        ...removeStyleOverrideFromAllLocales(settings.promptLibrary, presetId),
        hiddenStyleIds: [...new Set([...settings.promptLibrary.hiddenStyleIds, presetId])]
      }, presetId);
    } else {
      updateLibrary(settings, onSettingsChange, { ...settings.promptLibrary, customPresets: settings.promptLibrary.customPresets.filter((item) => item.id !== presetId) }, presetId);
    }
    onDeleted(presetId);
  }

  return (
    <div className="grid gap-4">
      <PageHeading icon={protectedPreset ? <LockKeyhole className="h-5 w-5" /> : <FilePenLine className="h-5 w-5" />} title={title || copy.editPreset} description={protectedPreset ? copy.protectedPreset : editableBuiltIn ? copy.defaultPreset : copy.customPreset} />
      <FieldLabel label={copy.presetTitle} hint={protectedPreset ? copy.protectedPreset : undefined}>
        <TextInput value={title} readOnly={protectedPreset} maxLength={60} onChange={(event) => updatePreset(event.target.value, prompt)} />
      </FieldLabel>
      <FieldLabel label={copy.presetPrompt}>
        <TextareaField value={prompt} readOnly={protectedPreset} maxLength={4000} placeholder={copy.presetPromptPlaceholder} className="min-h-64 text-sm leading-relaxed" onChange={(event) => updatePreset(title, event.target.value)} />
        <SettingTip>{copy.customPresetsDescription}</SettingTip>
      </FieldLabel>
      {!protectedPreset ? (
        <div className="flex flex-wrap justify-end gap-2">
          {editableBuiltIn && override ? <ActionButton onClick={resetPreset} leftIcon={<RotateCcw className="h-4 w-4" />}>{copy.reset}</ActionButton> : null}
          {custom ? <ActionButton variant="primary" disabled={!isValidCustomPreset(customDraft)} onClick={saveCustomPreset}>{copy.savePreset}</ActionButton> : null}
          <ActionButton variant="danger" onClick={deletePreset} leftIcon={<Trash2 className="h-4 w-4" />}>{copy.deletePreset}</ActionButton>
        </div>
      ) : null}
    </div>
  );
}

function PageHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="app-text-primary mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--panel-border))] bg-white/5">{icon}</span><div><h3 className="app-text-primary text-lg font-bold tracking-tight">{title}</h3><p className="app-text-muted mt-1 text-sm leading-relaxed">{description}</p></div></div>;
}

function ExplorerCard({ icon, title, description, action, badge, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; badge?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="settings-panel-card group flex min-h-32 w-full flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-[rgb(var(--focus-ring))] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]">
      <div className="flex items-start justify-between gap-3"><span className="app-text-primary flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">{icon}</span>{badge ? <span className="rounded-full border border-[rgb(var(--panel-border))] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide app-text-subtle">{badge}</span> : null}</div>
      <h4 className="app-text-primary mt-3 text-sm font-semibold">{title}</h4><p className="app-text-muted mt-1 line-clamp-2 text-xs leading-relaxed">{description}</p>
      <span className="app-text-subtle mt-auto flex items-center gap-1 pt-3 text-xs font-semibold group-hover:text-white">{action}<ChevronRight className="h-3.5 w-3.5" /></span>
    </button>
  );
}

function updateLibrary(settings: AISettings, onSettingsChange: (settings: AISettings) => void, promptLibrary: AIPromptLibrary, removedDefaultId?: string) {
  onSettingsChange({ ...settings, defaultStyle: removedDefaultId === settings.defaultStyle ? "recommended" : settings.defaultStyle, promptLibrary });
}

function removeStyleOverrideFromAllLocales(library: AIPromptLibrary, id: EditableTranslationStyle) {
  const localeOverrides = Object.fromEntries(Object.entries(library.localeOverrides).map(([locale, overrides]) => [
    locale,
    { ...overrides, styleOverrides: overrides.styleOverrides.filter((item) => item.id !== id) }
  ]));
  return { ...library, localeOverrides };
}

function replaceHistoryPage(navigation: NavigationState, page: AIPage): NavigationState {
  const entries = [...navigation.entries];
  entries[navigation.index] = page;
  return { entries, index: navigation.index };
}

export function sanitizeDeletedPresetHistory(navigation: NavigationState, id: string): NavigationState {
  const target: AIPage = `preset:${id}`;
  const entries: AIPage[] = [];
  let index = 0;
  navigation.entries.forEach((entry, oldIndex) => {
    const mapped: AIPage = entry === target ? "library" : entry;
    if (entries[entries.length - 1] !== mapped) entries.push(mapped);
    if (oldIndex === navigation.index) index = entries.length - 1;
  });
  return { entries: entries.length ? entries : ["library"], index: Math.max(0, index) };
}

export function isExistingPage(page: AIPage, settings: AISettings, draft: AICustomPreset | null) {
  if (["root", "api", "library", "format"].includes(page)) return true;
  if (page.startsWith("draft:")) return draft?.id === page.slice("draft:".length);
  const id = page.slice("preset:".length);
  if (id === "recommended") return true;
  if (isEditableTranslationStyle(id)) return !settings.promptLibrary.hiddenStyleIds.includes(id);
  return settings.promptLibrary.customPresets.some((preset) => preset.id === id && isValidCustomPreset(preset));
}

function getBreadcrumbs(page: AIPage, copy: ReturnType<typeof getAIPromptUiCopy>, settings: AISettings, locale: Locale): Array<{ page: AIPage; label: string }> {
  const items: Array<{ page: AIPage; label: string }> = [{ page: "root", label: copy.workspace }];
  if (page === "root") return items;
  if (page === "api") return [...items, { page: "api", label: copy.apiConfiguration }];
  items.push({ page: "library", label: copy.promptLibrary });
  if (page === "library") return items;
  if (page === "format") return [...items, { page: "format", label: copy.formatRules }];
  if (page.startsWith("draft:")) return [...items, { page, label: copy.newPresetTitle }];
  const id = page.startsWith("draft:") ? page.slice("draft:".length) : page.slice("preset:".length);
  const preset = getTranslationPresets(locale, settings.promptLibrary).find((item) => item.id === id);
  return [...items, { page, label: preset?.name || copy.editPreset }];
}

function SettingTip({ children }: { children: React.ReactNode }) {
  return <span className="settings-tip flex gap-2 px-3 py-2 text-xs leading-relaxed"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-100" /><span>{children}</span></span>;
}
