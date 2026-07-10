import { LanguageSettingsSection } from "@/components/settings/LanguageSettingsSection";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

export function GeneralSettingsSection({
  locale,
  copy,
  onLocaleChange
}: {
  locale: Locale;
  copy: typeof settingsCopy[Locale];
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <LanguageSettingsSection locale={locale} title={copy.language} onLocaleChange={onLocaleChange} />
  );
}
