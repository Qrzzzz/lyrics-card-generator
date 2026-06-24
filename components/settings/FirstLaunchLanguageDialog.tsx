"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Languages } from "lucide-react";
import { LANGUAGE_OPTIONS } from "@/components/settings/LanguageSettingsSection";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function FirstLaunchLanguageDialog({ open, locale, onChoose }: { open: boolean; locale: Locale; onChoose: (locale: Locale) => void }) {
  const copy = settingsCopy[locale];
  return <AnimatePresence>{open ? <motion.div data-testid="first-launch-language-dialog" className="fixed inset-0 z-[150] grid place-items-center overflow-hidden bg-black/55 p-4 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(125,211,252,0.13),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(216,180,254,0.12),transparent_36%)]" /><motion.div role="dialog" aria-modal="true" aria-labelledby="first-launch-language-title" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 8 }} transition={{ duration: 0.24, ease: "easeOut" }} className="settings-surface glass-panel relative w-full max-w-xl rounded-2xl p-5 sm:p-7"><div className="mb-5 text-center"><Languages className="mx-auto mb-3 h-8 w-8" /><h2 id="first-launch-language-title" className="text-2xl font-black">{copy.firstLaunchTitle}</h2><p className="app-text-subtle mt-2 text-sm">{copy.firstLaunchDescription}</p></div><div className="grid gap-2 sm:grid-cols-2">{LANGUAGE_OPTIONS.map((option) => <button key={option.locale} type="button" data-testid="first-launch-language" data-locale={option.locale} onClick={() => onChoose(option.locale)} className="app-button rounded-xl px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5"><span className="block font-bold">{option.nativeName}</span><span className="app-text-subtle text-xs">{option.displayName}</span></button>)}</div></motion.div></motion.div> : null}</AnimatePresence>;
}
