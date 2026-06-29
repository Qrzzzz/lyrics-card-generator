import { Check } from "lucide-react";
import { OptionCard, OptionCardGroup } from "@/components/ui/controls";
import type { Locale } from "@/lib/types";

export const LANGUAGE_OPTIONS: Array<{ locale: Locale; nativeName: string; displayName: string }> = [
  { locale: "zh", nativeName: "中文", displayName: "Simplified Chinese" },
  { locale: "zh-TW", nativeName: "繁體中文", displayName: "Traditional Chinese" },
  { locale: "en", nativeName: "English", displayName: "English" },
  { locale: "fr", nativeName: "Français", displayName: "French" },
  { locale: "ja", nativeName: "日本語", displayName: "Japanese" },
  { locale: "es", nativeName: "Español", displayName: "Spanish" }
];

export function LanguageSettingsSection({
  locale,
  title,
  onLocaleChange
}: {
  locale: Locale;
  title: string;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <section className="settings-panel-card grid gap-3 p-4 sm:p-5">
      <h3 className="app-text-primary text-sm font-semibold">{title}</h3>
      <OptionCardGroup className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={title}>
        {LANGUAGE_OPTIONS.map((option) => {
          const selected = locale === option.locale;
          return (
            <OptionCard
              key={option.locale}
              data-testid="language-option"
              data-locale={option.locale}
              aria-label={`${option.nativeName} - ${option.displayName}`}
              selected={selected}
              label={option.nativeName}
              description={option.displayName}
              indicator={selected ? <Check className="h-4 w-4" /> : undefined}
              onClick={() => onLocaleChange(option.locale)}
            />
          );
        })}
      </OptionCardGroup>
    </section>
  );
}
