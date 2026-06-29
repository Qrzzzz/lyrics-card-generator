import { Info, Trash2 } from "lucide-react";
import { useId } from "react";
import {
  ActionButton,
  FieldLabel,
  SelectField,
  TextInput,
  ToggleRow
} from "@/components/ui/controls";
import { getTranslationStyles } from "@/lib/ai/styles";
import type { AISettings } from "@/lib/ai/types";
import type { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { Locale } from "@/lib/types";

export function AiSettingsSection({
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
  const translationStyles = getTranslationStyles(locale);
  const baseUrlId = useId();
  const apiKeyId = useId();
  const modelId = useId();
  const temperatureId = useId();
  const defaultStyleId = useId();

  return (
    <section className="settings-panel-card grid gap-4 p-4 sm:p-5">
      <h3 className="app-text-primary text-sm font-semibold">{copy.aiSection}</h3>

      <FieldLabel label={copy.baseUrl} htmlFor={baseUrlId}>
        <TextInput
          id={baseUrlId}
          type="url"
          value={settings.baseUrl}
          onChange={(event) => onSettingsChange({ ...settings, baseUrl: event.target.value })}
          placeholder="https://api.openai.com/v1"
          autoComplete="url"
        />
        <SettingTip>{copy.baseUrlTip}</SettingTip>
      </FieldLabel>

      <FieldLabel label={copy.apiKey} hint={hasApiKey ? copy.apiKeyConfigured : undefined} htmlFor={apiKeyId}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextInput
            id={apiKeyId}
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder={hasApiKey ? "****************" : copy.apiKeyPlaceholder}
            autoComplete="new-password"
            spellCheck={false}
            className="min-w-0 flex-1"
          />
          <ActionButton
            data-testid="clear-api-key"
            onClick={onClearApiKey}
            disabled={!hasApiKey && !apiKey}
            loading={isClearingApiKey}
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            className="shrink-0"
          >
            {isClearingApiKey ? copy.clearingApiKey : copy.clearApiKey}
          </ActionButton>
        </div>
        <SettingTip>{copy.apiKeyTip}</SettingTip>
      </FieldLabel>

      <FieldLabel label={copy.model} htmlFor={modelId}>
        <TextInput
          id={modelId}
          value={settings.model}
          onChange={(event) => onSettingsChange({ ...settings, model: event.target.value })}
          placeholder={copy.modelPlaceholder}
          spellCheck={false}
        />
        <SettingTip>{copy.modelTip}</SettingTip>
      </FieldLabel>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldLabel label={copy.temperature} hint={settings.reasoningEnabled ? copy.reasoningHint : undefined} htmlFor={temperatureId}>
          <TextInput
            id={temperatureId}
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={settings.temperature}
            onChange={(event) => onSettingsChange({ ...settings, temperature: Number(event.target.value) })}
          />
          <SettingTip>{copy.temperatureTip}</SettingTip>
        </FieldLabel>

        <FieldLabel label={copy.defaultStyle} htmlFor={defaultStyleId}>
          <SelectField
            id={defaultStyleId}
            value={settings.defaultStyle}
            onChange={(event) =>
              onSettingsChange({ ...settings, defaultStyle: event.target.value as AISettings["defaultStyle"] })
            }
          >
            {translationStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </SelectField>
          <SettingTip>{copy.defaultStyleTip}</SettingTip>
        </FieldLabel>
      </div>

      <ToggleRow
        label={copy.defaultReasoning}
        checked={settings.reasoningEnabled}
        onChange={(reasoningEnabled) => onSettingsChange({ ...settings, reasoningEnabled })}
      />
      <SettingTip>{copy.reasoningHint}</SettingTip>
    </section>
  );
}

function SettingTip({ children }: { children: React.ReactNode }) {
  return (
    <span className="settings-tip flex gap-2 px-3 py-2 text-xs leading-relaxed">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-100" />
      <span>{children}</span>
    </span>
  );
}
