"use client";

import { Languages } from "lucide-react";
import { LANGUAGE_OPTIONS } from "@/components/settings/LanguageSettingsSection";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function FirstLaunchLanguageDialog({ open, locale, onChoose }: { open: boolean; locale: Locale; onChoose: (locale: Locale) => void }) {
  const copy = settingsCopy[locale];
  return <AccessibleDialog open={open} labelledBy="first-launch-language-title" describedBy="first-launch-language-description" onClose={() => undefined} escapeCloses={false} closeOnBackdrop={false} initialFocusSelector='[data-testid="first-launch-language"]' returnFocusSelector='[data-testid="song-search-primary"] [role="combobox"]' testId="first-launch-language-dialog" overlayClassName="overflow-hidden bg-black/55 backdrop-blur-xl" panelClassName="settings-surface glass-panel max-w-xl rounded-2xl p-5 sm:p-7"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(125,211,252,0.13),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(216,180,254,0.12),transparent_36%)]" /><div className="relative"><div className="mb-5 text-center"><Languages className="mx-auto mb-3 h-8 w-8" /><h2 id="first-launch-language-title" className="text-2xl font-black">{copy.firstLaunchTitle}</h2><p id="first-launch-language-description" className="app-text-subtle mt-2 text-sm">{copy.firstLaunchDescription}</p></div><div className="grid gap-2 sm:grid-cols-2">{LANGUAGE_OPTIONS.map((option) => <button key={option.locale} type="button" data-testid="first-launch-language" data-locale={option.locale} onClick={() => onChoose(option.locale)} className="app-button rounded-xl px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5"><span className="block font-bold">{option.nativeName}</span><span className="app-text-subtle text-xs">{option.displayName}</span></button>)}</div></div></AccessibleDialog>;
}
