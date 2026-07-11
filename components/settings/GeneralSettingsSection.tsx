import { LanguageSettingsSection } from "@/components/settings/LanguageSettingsSection";
import { ToggleRow } from "@/components/ui/controls";
import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function GeneralSettingsSection({
  locale,
  copy,
  settings,
  onLocaleChange,
  onChange
}: {
  locale: Locale;
  copy: typeof settingsCopy[Locale];
  settings: UserSettings;
  onLocaleChange: (locale: Locale) => void;
  onChange: (settings: UserSettings) => void;
}) {
  return (
    <section className="grid gap-4">
      <LanguageSettingsSection locale={locale} title={copy.language} onLocaleChange={onLocaleChange} />
      <ToggleRow
        label={copy.reduceMotion}
        description={copy.reduceMotionDescription}
        checked={settings.reduceMotionEnabled}
        onChange={(reduceMotionEnabled) => onChange({ ...settings, reduceMotionEnabled })}
        testId="reduce-motion-toggle"
      />
    </section>
  );
}
