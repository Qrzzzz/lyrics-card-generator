"use client";

import { motion } from "framer-motion";
import { Languages } from "lucide-react";
import { LANGUAGE_OPTIONS } from "@/components/settings/LanguageSettingsSection";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function FirstLaunchLanguageDialog({ open, locale, onChoose }: { open: boolean; locale: Locale; onChoose: (locale: Locale) => void }) {
  if (!open) return null;
  const copy = settingsCopy[locale];
  return <div className="fixed inset-0 z-[150] grid place-items-center bg-black/55 p-4 backdrop-blur-xl"><motion.div role="dialog" aria-modal="true" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="settings-surface glass-panel w-full max-w-xl rounded-2xl p-5 sm:p-7"><div className="mb-5 text-center"><Languages className="mx-auto mb-3 h-8 w-8" /><h2 className="text-2xl font-black">{copy.firstLaunchTitle}</h2><p className="app-text-subtle mt-2 text-sm">{copy.firstLaunchDescription}</p></div><div className="grid gap-2 sm:grid-cols-2">{LANGUAGE_OPTIONS.map((option) => <button key={option.locale} type="button" data-testid="first-launch-language" data-locale={option.locale} onClick={() => onChoose(option.locale)} className="app-button rounded-xl px-4 py-3 text-left"><span className="block font-bold">{option.nativeName}</span><span className="app-text-subtle text-xs">{option.displayName}</span></button>)}</div></motion.div></div>;
}
