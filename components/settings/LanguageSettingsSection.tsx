import { Check } from "lucide-react";
import { OptionCardGroup } from "@/components/ui/controls";
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
    <section className="grid gap-3">
      <h3 className="app-text-primary text-sm font-semibold">{title}</h3>
      <OptionCardGroup
        className="grid gap-2 sm:grid-cols-2"
        value={locale}
        onValueChange={(value) => onLocaleChange(value as Locale)}
        aria-label={title}
        options={LANGUAGE_OPTIONS.map((option) => ({
          value: option.locale,
          label: option.nativeName,
          description: option.displayName,
          testId: "language-option",
          dataLocale: option.locale,
          ariaLabel: `${option.nativeName} - ${option.displayName}`,
          indicator: locale === option.locale ? <Check className="h-4 w-4" /> : undefined
        }))}
      />
    </section>
  );
}
