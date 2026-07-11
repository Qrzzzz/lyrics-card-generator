"use client";

import {
  AlertTriangle,
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
  Trash2
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
import { SettingsConfirmDialog } from "@/components/settings/SettingsConfirmDialog";
import { getAISettingsPath, resolveAISettingsPage, type AIPage } from "@/components/settings/ai-settings-routing";
import { getDefaultFormatRules, getDefaultStylePrompt } from "@/lib/ai/prompt";
import { getAIPromptUiCopy } from "@/lib/ai/prompt-ui-copy";
import { getLocalePromptOverrides, isValidCustomPreset, setLocalePromptOverrides } from "@/lib/ai/settings-normalize";
import { EDITABLE_STYLE_ORDER, getTranslationPresets, getTranslationStyles, isEditableTranslationStyle, isTranslationStyle } from "@/lib/ai/styles";
import type { AICustomPreset, AIPromptLibrary, AISettings, EditableTranslationStyle } from "@/lib/ai/types";
import type { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { Locale } from "@/lib/types";

export function AiSettingsSection({
  open,
  path,
  settings,
  apiKey,
  hasApiKey,
  locale,
  copy,
  isClearingApiKey,
  onSettingsChange,
  onApiKeyChange,
  onClearApiKey,
  onNavigate
}: {
  open: boolean;
  path: string[];
  settings: AISettings;
  apiKey: string;
  hasApiKey: boolean;
  locale: Locale;
  copy: ReturnType<typeof getAIUiCopy>;
  isClearingApiKey: boolean;
  onSettingsChange: (settings: AISettings) => void;
  onApiKeyChange: (apiKey: string) => void;
  onClearApiKey: () => void;
  onNavigate: (path: string[], options?: { replace?: boolean }) => void;
}) {
  const promptCopy = getAIPromptUiCopy(locale);
  const [draftPreset, setDraftPreset] = useState<AICustomPreset | null>(null);
  const page = resolveAISettingsPage(path);

  useEffect(() => {
    if (open) return;
    setDraftPreset(null);
  }, [open]);

  useEffect(() => {
    if (isExistingPage(page, settings, draftPreset)) return;
    onNavigate(getAISettingsPath("library"), { replace: true });
  }, [draftPreset, onNavigate, page, settings]);

  function navigate(next: AIPage) {
    if (next === page) return;
    if (page.startsWith("draft:")) setDraftPreset(null);
    onNavigate(getAISettingsPath(next));
  }

  function createDraft() {
    if (settings.promptLibrary.customPresets.length >= 2) return;
    const draft = { id: `custom:${crypto.randomUUID()}`, title: "", prompt: "", initialTitle: "", initialPrompt: "" };
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
        prompt: draftPreset.prompt.trim(),
        initialTitle: draftPreset.title.trim(),
        initialPrompt: draftPreset.prompt.trim()
      }]
    });
    setDraftPreset(null);
    onNavigate(getAISettingsPath(`preset:${draftPreset.id}`), { replace: true });
  }

  function handlePresetDeleted(id: string) {
    if (page === `preset:${id}`) onNavigate(getAISettingsPath("library"), { replace: true });
  }

  return (
    <section className="grid gap-4">
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
        <FormatRulesPage locale={locale} copy={promptCopy} />
      ) : page.startsWith("draft:") && draftPreset ? (
        <CustomPresetDraftPage draft={draftPreset} copy={promptCopy} onChange={setDraftPreset} onSave={saveDraft} onCancel={() => navigate("library")} />
      ) : (
        <PresetEditorPage
          presetId={page.slice("preset:".length)}
          settings={settings}
          locale={locale}
          copy={promptCopy}
          cancelLabel={copy.cancel}
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
        <ExplorerCard testId="ai-open-api" icon={<FileKey2 className="h-6 w-6" />} title={copy.apiConfiguration} description={copy.apiConfigurationDescription} action={copy.open} onClick={() => onOpen("api")} />
        <ExplorerCard testId="ai-open-library" icon={<FolderCog className="h-6 w-6" />} title={copy.promptLibrary} description={copy.promptLibraryDescription} action={copy.open} onClick={() => onOpen("library")} />
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
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  return (
    <div className="grid gap-4">
      <PageHeading icon={<FileKey2 className="h-5 w-5" />} title={promptCopy.apiConfiguration} description={promptCopy.apiConfigurationDescription} />
      <FieldLabel label={copy.baseUrl} htmlFor={baseUrlId}>
        <TextInput data-testid="ai-base-url-input" id={baseUrlId} type="url" value={settings.baseUrl} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" autoComplete="url" />
        <SettingTip>{copy.baseUrlTip}</SettingTip>
      </FieldLabel>
      <FieldLabel label={copy.apiKey} hint={hasApiKey ? copy.apiKeyConfigured : undefined} htmlFor={apiKeyId}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextInput data-testid="ai-api-key-input" id={apiKeyId} type="password" value={apiKey} disabled={isClearingApiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder={hasApiKey ? "****************" : copy.apiKeyPlaceholder} autoComplete="new-password" spellCheck={false} className="min-w-0 flex-1" />
          <ActionButton data-testid="clear-api-key" onClick={() => setClearConfirmOpen(true)} disabled={!hasApiKey && !apiKey} loading={isClearingApiKey} variant="danger" icon={<Trash2 className="h-4 w-4" />} className="shrink-0">
            {isClearingApiKey ? copy.clearingApiKey : copy.clearApiKey}
          </ActionButton>
        </div>
        <SettingTip>{copy.apiKeyTip}</SettingTip>
      </FieldLabel>
      <FieldLabel label={copy.model} htmlFor={modelId}>
        <TextInput data-testid="ai-model-input" id={modelId} value={settings.model} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, model: event.target.value })} placeholder={copy.modelPlaceholder} spellCheck={false} />
        <SettingTip>{copy.modelTip}</SettingTip>
      </FieldLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldLabel label={copy.temperature} htmlFor={temperatureId}>
          <TextInput data-testid="ai-temperature-input" id={temperatureId} type="number" min={0} max={2} step={0.1} value={settings.temperature} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, temperature: Number(event.target.value) })} />
          <SettingTip>{copy.temperatureTip}</SettingTip>
        </FieldLabel>
        <FieldLabel label={copy.defaultStyle} htmlFor={defaultStyleId}>
          <SelectField data-testid="ai-default-style-select" id={defaultStyleId} value={settings.defaultStyle} disabled={isClearingApiKey} onChange={(event) => onSettingsChange({ ...settings, defaultStyle: event.target.value })}>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </SelectField>
          <SettingTip>{copy.defaultStyleTip}</SettingTip>
        </FieldLabel>
      </div>
      <ToggleRow label={copy.defaultReasoning} checked={settings.reasoningEnabled} disabled={isClearingApiKey} onChange={(reasoningEnabled) => onSettingsChange({ ...settings, reasoningEnabled })} />
      <SettingTip>{copy.reasoningHint}</SettingTip>
      <SettingsConfirmDialog
        open={clearConfirmOpen}
        title={copy.clearApiKey}
        description={copy.clearApiKeyConfirm}
        confirmLabel={copy.clearApiKey}
        cancelLabel={copy.cancel}
        confirmTestId="confirm-clear-api-key"
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          setClearConfirmOpen(false);
          onClearApiKey();
        }}
      />
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

  function resetAllPresets() {
    updateLibrary(settings, onSettingsChange, resetPromptLibraryToInitial(settings.promptLibrary));
  }

  const canResetAll = hasPromptLibraryChanges(settings.promptLibrary);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading icon={<FolderOpen className="h-5 w-5" />} title={copy.promptLibrary} description={copy.promptLibraryDescription} />
        <ActionButton data-testid="prompt-reset-all" disabled={!canResetAll} onClick={resetAllPresets} leftIcon={<RotateCcw className="h-4 w-4" />}>{copy.resetAll}</ActionButton>
      </div>
      <ExplorerCard icon={<FileLock2 className="h-6 w-6 text-amber-200" />} title={copy.formatRules} description={copy.formatRulesDescription} action={copy.open} onClick={() => onOpen("format")} />

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h4 className="app-text-primary text-sm font-semibold">{copy.defaultPresets}</h4><p className="app-text-muted mt-1 text-xs">1 + {5 - removed.length} / 6</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {presets.filter((preset) => preset.source !== "custom").map((preset) => (
            <ExplorerCard testId={`preset-card-${preset.id}`} key={preset.id} icon={preset.source === "recommended" ? <LockKeyhole className="h-5 w-5" /> : <FilePenLine className="h-5 w-5" />} title={preset.name} description={preset.description} action={copy.open} badge={preset.source === "recommended" ? copy.protectedPreset : localeOverrides.styleOverrides.some((item) => item.id === preset.id) ? copy.modified : undefined} onClick={() => onOpen(`preset:${preset.id}`)} />
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
          {settings.promptLibrary.customPresets.map((preset) => <ExplorerCard testId={`preset-card-${preset.id}`} key={preset.id} icon={<FilePenLine className="h-5 w-5" />} title={preset.title || copy.newPresetTitle} description={preset.prompt || copy.presetPromptPlaceholder} action={copy.open} badge={copy.customPreset} onClick={() => onOpen(`preset:${preset.id}`)} />)}
          {settings.promptLibrary.customPresets.length < 2 ? (
            <button data-testid="preset-create" type="button" onClick={onCreateDraft} className="app-text-muted flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--input-border))] p-5 text-sm transition hover:border-[rgb(var(--focus-ring))] hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]">
              <Plus className="h-4 w-4" />{copy.addPreset}
            </button>
          ) : null}
        </div>
        <p className="app-text-subtle mt-2 text-xs">{copy.presetLimit}</p>
      </div>
    </div>
  );
}

function FormatRulesPage({ locale, copy }: { locale: Locale; copy: ReturnType<typeof getAIPromptUiCopy> }) {
  const defaultRules = getDefaultFormatRules(locale);

  return (
    <div className="grid gap-4">
      <PageHeading icon={<FileLock2 className="h-5 w-5 text-amber-200" />} title={copy.formatRules} description={copy.formatRulesDescription} />
      <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4">
        <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><p className="text-sm leading-relaxed text-amber-50/90">{copy.formatRulesWarning}</p></div>
      </div>
      <TextareaField data-testid="strict-format-rules" aria-label={copy.formatRules} value={defaultRules} readOnly className="min-h-72 cursor-default select-text font-mono text-xs leading-relaxed opacity-80" />
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
        <TextInput data-testid="preset-title-input" value={draft.title} maxLength={60} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
      </FieldLabel>
      <FieldLabel label={copy.presetPrompt}>
        <TextareaField data-testid="preset-prompt-input" value={draft.prompt} maxLength={4000} placeholder={copy.presetPromptPlaceholder} className="min-h-64 text-sm leading-relaxed" onChange={(event) => onChange({ ...draft, prompt: event.target.value })} />
        <SettingTip>{copy.requiredFields}</SettingTip>
      </FieldLabel>
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton onClick={onCancel}>{copy.discardDraft}</ActionButton>
        <ActionButton data-testid="preset-save" variant="primary" disabled={!valid} onClick={onSave}>{copy.savePreset}</ActionButton>
      </div>
    </div>
  );
}

function PresetEditorPage({ presetId, settings, locale, copy, cancelLabel, onSettingsChange, onDeleted }: { presetId: string; settings: AISettings; locale: Locale; copy: ReturnType<typeof getAIPromptUiCopy>; cancelLabel: string; onSettingsChange: (settings: AISettings) => void; onDeleted: (id: string) => void }) {
  const styles = getTranslationStyles(locale);
  const builtIn = isTranslationStyle(presetId);
  const protectedPreset = presetId === "recommended";
  const editableBuiltIn = isEditableTranslationStyle(presetId);
  const defaultStyle = builtIn ? styles.find((style) => style.id === presetId) : undefined;
  const localeOverrides = getLocalePromptOverrides(settings.promptLibrary, locale);
  const override = editableBuiltIn ? localeOverrides.styleOverrides.find((item) => item.id === presetId) : undefined;
  const custom = !builtIn ? settings.promptLibrary.customPresets.find((item) => item.id === presetId) : undefined;
  const [customDraft, setCustomDraft] = useState<AICustomPreset>(() => custom ?? { id: presetId, title: "", prompt: "" });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  useEffect(() => {
    if (custom) setCustomDraft(custom);
  }, [custom?.id, presetId]);
  const title = protectedPreset
    ? defaultStyle?.name || ""
    : editableBuiltIn
      ? override ? override.title : defaultStyle?.name || ""
      : customDraft.title;
  const prompt = protectedPreset
    ? getDefaultStylePrompt(locale, "recommended")
    : editableBuiltIn
      ? override ? override.prompt : getDefaultStylePrompt(locale, presetId)
      : customDraft.prompt;
  const customInitialTitle = custom?.initialTitle || custom?.title || "";
  const customInitialPrompt = custom?.initialPrompt || custom?.prompt || "";
  const canReset = editableBuiltIn
    ? Boolean(override)
    : Boolean(custom && (customDraft.title !== customInitialTitle || customDraft.prompt !== customInitialPrompt));

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
    if (!canReset) return;
    if (editableBuiltIn) {
      updateLibrary(settings, onSettingsChange, setLocalePromptOverrides(settings.promptLibrary, locale, {
        ...localeOverrides,
        styleOverrides: localeOverrides.styleOverrides.filter((item) => item.id !== presetId)
      }));
      return;
    }
    if (custom) {
      const resetCustom = { ...custom, title: customInitialTitle, prompt: customInitialPrompt };
      setCustomDraft(resetCustom);
      updateLibrary(settings, onSettingsChange, {
        ...settings.promptLibrary,
        customPresets: settings.promptLibrary.customPresets.map((item) => item.id === presetId ? resetCustom : item)
      });
    }
  }

  function confirmDeletePreset() {
    if (protectedPreset) return;
    if (editableBuiltIn) {
      updateLibrary(settings, onSettingsChange, {
        ...removeStyleOverrideFromAllLocales(settings.promptLibrary, presetId),
        hiddenStyleIds: [...new Set([...settings.promptLibrary.hiddenStyleIds, presetId])]
      }, presetId);
    } else {
      updateLibrary(settings, onSettingsChange, { ...settings.promptLibrary, customPresets: settings.promptLibrary.customPresets.filter((item) => item.id !== presetId) }, presetId);
    }
    setDeleteConfirmOpen(false);
    onDeleted(presetId);
  }

  return (
    <div className="grid gap-4">
      <PageHeading icon={protectedPreset ? <LockKeyhole className="h-5 w-5" /> : <FilePenLine className="h-5 w-5" />} title={title || copy.editPreset} description={protectedPreset ? copy.protectedPreset : editableBuiltIn ? copy.defaultPreset : copy.customPreset} />
      <FieldLabel label={copy.presetTitle} hint={protectedPreset ? copy.protectedPreset : undefined}>
        <TextInput data-testid="preset-title-input" value={title} readOnly={protectedPreset} maxLength={60} onChange={(event) => updatePreset(event.target.value, prompt)} />
      </FieldLabel>
      <FieldLabel label={copy.presetPrompt}>
        <TextareaField data-testid="preset-prompt-input" value={prompt} readOnly={protectedPreset} maxLength={4000} placeholder={copy.presetPromptPlaceholder} className="min-h-64 text-sm leading-relaxed" onChange={(event) => updatePreset(title, event.target.value)} />
        <SettingTip>{copy.customPresetsDescription}</SettingTip>
      </FieldLabel>
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton data-testid="preset-reset" disabled={!canReset} onClick={resetPreset} leftIcon={<RotateCcw className="h-4 w-4" />}>{copy.reset}</ActionButton>
        {!protectedPreset ? (
          <>
          {custom ? <ActionButton data-testid="preset-save" variant="primary" disabled={!isValidCustomPreset(customDraft)} onClick={saveCustomPreset}>{copy.savePreset}</ActionButton> : null}
          <ActionButton data-testid="preset-delete" variant="danger" onClick={() => setDeleteConfirmOpen(true)} leftIcon={<Trash2 className="h-4 w-4" />}>{copy.deletePreset}</ActionButton>
          </>
        ) : null}
      </div>
      <SettingsConfirmDialog
        open={deleteConfirmOpen}
        title={copy.deletePreset}
        description={copy.deletePresetConfirm}
        confirmLabel={copy.deletePreset}
        cancelLabel={cancelLabel}
        confirmTestId="confirm-delete-preset"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeletePreset}
      />
    </div>
  );
}

function PageHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="app-text-primary mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--panel-border))] bg-white/5">{icon}</span><div><h3 className="app-text-primary text-lg font-bold tracking-tight">{title}</h3><p className="app-text-muted mt-1 text-sm leading-relaxed">{description}</p></div></div>;
}

function ExplorerCard({ icon, title, description, action, badge, testId, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; badge?: string; testId?: string; onClick: () => void }) {
  return (
    <button data-testid={testId} type="button" onClick={onClick} className="settings-panel-card group flex min-h-32 w-full flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-[rgb(var(--focus-ring))] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]">
      <div className="flex items-start justify-between gap-3"><span className="app-text-primary flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">{icon}</span>{badge ? <span className="rounded-full border border-[rgb(var(--panel-border))] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide app-text-subtle">{badge}</span> : null}</div>
      <h4 className="app-text-primary mt-3 text-sm font-semibold">{title}</h4><p className="app-text-muted mt-1 line-clamp-2 text-xs leading-relaxed">{description}</p>
      <span className="app-text-subtle mt-auto flex items-center gap-1 pt-3 text-xs font-semibold group-hover:text-white">{action}<ChevronRight className="h-3.5 w-3.5" /></span>
    </button>
  );
}

function updateLibrary(settings: AISettings, onSettingsChange: (settings: AISettings) => void, promptLibrary: AIPromptLibrary, removedDefaultId?: string) {
  onSettingsChange({ ...settings, defaultStyle: removedDefaultId === settings.defaultStyle ? "recommended" : settings.defaultStyle, promptLibrary });
}

export function resetPromptLibraryToInitial(promptLibrary: AIPromptLibrary): AIPromptLibrary {
  return {
    localeOverrides: {},
    hiddenStyleIds: [],
    customPresets: promptLibrary.customPresets.map((preset) => ({
      ...preset,
      title: preset.initialTitle || preset.title,
      prompt: preset.initialPrompt || preset.prompt
    }))
  };
}

function hasPromptLibraryChanges(promptLibrary: AIPromptLibrary) {
  return promptLibrary.hiddenStyleIds.length > 0
    || Object.keys(promptLibrary.localeOverrides).length > 0
    || promptLibrary.customPresets.some((preset) =>
      preset.title !== (preset.initialTitle || preset.title)
      || preset.prompt !== (preset.initialPrompt || preset.prompt)
    );
}

function removeStyleOverrideFromAllLocales(library: AIPromptLibrary, id: EditableTranslationStyle) {
  const localeOverrides = Object.fromEntries(Object.entries(library.localeOverrides).map(([locale, overrides]) => [
    locale,
    { ...overrides, styleOverrides: overrides.styleOverrides.filter((item) => item.id !== id) }
  ]));
  return { ...library, localeOverrides };
}

export function isExistingPage(page: AIPage, settings: AISettings, draft: AICustomPreset | null) {
  if (["root", "api", "library", "format"].includes(page)) return true;
  if (page.startsWith("draft:")) return draft?.id === page.slice("draft:".length);
  const id = page.slice("preset:".length);
  if (id === "recommended") return true;
  if (isEditableTranslationStyle(id)) return !settings.promptLibrary.hiddenStyleIds.includes(id);
  return settings.promptLibrary.customPresets.some((preset) => preset.id === id && isValidCustomPreset(preset));
}

function SettingTip({ children }: { children: React.ReactNode }) {
  return <span className="settings-tip flex gap-2 px-3 py-2 text-xs leading-relaxed"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-100" /><span>{children}</span></span>;
}
