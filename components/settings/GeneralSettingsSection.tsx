import { LanguageSettingsSection } from "@/components/settings/LanguageSettingsSection";
import { ToggleRow } from "@/components/ui/controls";
import type { Locale } from "@/lib/types";
import type { UserSettings } from "@/lib/settings/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function GeneralSettingsSection({
  locale,
  settings,
  copy,
  onLocaleChange,
  onChange
}: {
  locale: Locale;
  settings: UserSettings;
  copy: typeof settingsCopy[Locale];
  onLocaleChange: (locale: Locale) => void;
  onChange: (settings: UserSettings) => void;
}) {
  return (
    <div className="grid gap-6">
      <LanguageSettingsSection locale={locale} title={copy.language} onLocaleChange={onLocaleChange} />
      <section className="grid gap-3">
        <ToggleRow
          label={copy.spark}
          description={copy.sparkDescription}
          checked={settings.sparkCursorEnabled}
          onChange={(sparkCursorEnabled) => onChange({ ...settings, sparkCursorEnabled })}
        />
      </section>
    </div>
  );
}
