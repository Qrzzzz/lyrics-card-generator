import { Check } from "lucide-react";
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
      <div className="grid gap-2 sm:grid-cols-2">
        {LANGUAGE_OPTIONS.map((option) => {
          const selected = locale === option.locale;
          return (
            <button
              key={option.locale}
              type="button"
              data-testid="language-option"
              data-locale={option.locale}
              aria-pressed={selected}
              onClick={() => onLocaleChange(option.locale)}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                selected
                  ? "border-white/38 bg-white/[0.13] app-text-primary"
                  : "border-white/12 bg-black/20 app-text-subtle hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <span>
                <span className="block text-sm font-semibold">{option.nativeName}</span>
                <span className="block text-[11px] opacity-70">{option.displayName}</span>
              </span>
              {selected ? <Check className="h-4 w-4" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
