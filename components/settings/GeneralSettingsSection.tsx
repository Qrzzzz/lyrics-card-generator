import { LanguageSettingsSection } from "@/components/settings/LanguageSettingsSection";
import { SwitchRow } from "@/components/ui/controls";
import type { Locale } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function GeneralSettingsSection({ locale, settings, copy, onLocaleChange, onChange }: { locale: Locale; settings: UserSettings; copy: typeof settingsCopy[Locale]; onLocaleChange: (locale: Locale) => void; onChange: (settings: UserSettings) => void }) {
  return <div className="grid gap-4">
    <LanguageSettingsSection locale={locale} title={copy.language} onLocaleChange={onLocaleChange} />
    <section className="settings-panel-card p-4 sm:p-5"><SwitchRow label={copy.spark} checked={settings.sparkCursorEnabled} onChange={(sparkCursorEnabled) => onChange({ ...settings, sparkCursorEnabled })} /><p className="app-text-subtle mt-2 text-xs">{copy.sparkDescription}</p></section>
  </div>;
}
