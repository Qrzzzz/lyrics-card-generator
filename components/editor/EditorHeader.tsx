"use client";

import { Check, ChevronDown, Languages, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UpdateButton } from "@/components/editor/UpdateButton";
import type { createT } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

type EditorHeaderProps = {
  locale: Locale;
  t: ReturnType<typeof createT>;
  onLocaleChange: (locale: Locale) => void;
  onClearAll: () => void;
};

type LanguageOption = {
  locale: Locale;
  nativeName: string;
  displayName: string;
};

const languageOptions: LanguageOption[] = [
  { locale: "zh", nativeName: "中文", displayName: "Simplified Chinese" },
  { locale: "zh-TW", nativeName: "繁體中文", displayName: "Traditional Chinese" },
  { locale: "en", nativeName: "English", displayName: "English" },
  { locale: "fr", nativeName: "Français", displayName: "French" },
  { locale: "ja", nativeName: "日本語", displayName: "Japanese" },
  { locale: "es", nativeName: "Español", displayName: "Spanish" }
];

export function EditorHeader({ locale, t, onLocaleChange, onClearAll }: EditorHeaderProps) {
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeLanguage = languageOptions.find((option) => option.locale === locale) ?? languageOptions[0];

  useEffect(() => {
    if (!isLanguageMenuOpen) {
      return;
    }

    function closeOnOutsideInteraction(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLanguageMenuOpen(false);
      }
    }

    document.addEventListener("click", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("click", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isLanguageMenuOpen]);

  return (
    <header className="glass-panel relative z-40 min-w-0 max-w-full flex flex-col gap-4 rounded-lg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="app-text-primary text-2xl font-black tracking-normal sm:text-3xl">{t("appTitle")}</h1>
        <p className="app-text-subtle mt-1 text-sm">{t("appSubtitle")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <UpdateButton t={t} />
        <a
          href="https://github.com/Qrzzzz"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="app-button inline-flex h-10 w-10 items-center justify-center rounded-lg transition"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
        <button
          type="button"
          onClick={onClearAll}
          className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
        >
          <Trash2 className="h-4 w-4" />
          {t("clearAll")}
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            data-testid="language-menu-button"
            aria-haspopup="menu"
            aria-expanded={isLanguageMenuOpen}
            aria-label={t("language")}
            onClick={() => setIsLanguageMenuOpen((open) => !open)}
            className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
          >
            <Languages className="h-4 w-4" />
            <span className="max-w-[7.5rem] truncate">{activeLanguage.nativeName}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isLanguageMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isLanguageMenuOpen ? (
            <div
              role="menu"
              aria-label={t("language")}
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-[rgb(var(--panel-border))] bg-[rgba(12,18,28,0.94)] p-1.5 shadow-[0_22px_70px_rgba(0,0,0,0.46)] backdrop-blur-2xl"
            >
              {languageOptions.map((option) => {
                const selected = option.locale === locale;

                return (
                  <button
                    key={option.locale}
                    type="button"
                    data-locale={option.locale}
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      onLocaleChange(option.locale);
                      setIsLanguageMenuOpen(false);
                    }}
                    className={`flex h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm transition ${
                      selected
                        ? "bg-[rgb(var(--button-bg-hover))] app-text-primary"
                        : "app-text-subtle hover:bg-[rgb(var(--button-bg))] hover:text-[rgb(var(--app-fg))]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{option.nativeName}</span>
                      <span className="app-text-subtle block truncate text-[11px]">{option.displayName}</span>
                    </span>
                    {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
