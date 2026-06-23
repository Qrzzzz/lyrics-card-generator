"use client";

import { Music2, Settings } from "lucide-react";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function EditorHeader({ locale, t, onOpenExamples, onOpenSettings }: { locale: Locale; t: ReturnType<typeof createT>; onOpenExamples: () => void; onOpenSettings: () => void }) {
  const aiCopy = getAIUiCopy(locale);
  const copy = settingsCopy[locale];
  return <header className="glass-panel relative z-40 flex min-w-0 max-w-full flex-col gap-4 rounded-lg px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><img src="/app-icon.png" alt="Lyrics Card" className="h-9 w-9 shrink-0 rounded-[9px] border border-white/15 shadow-lg" /><div className="min-w-0"><h1 className="app-text-primary truncate text-2xl font-black tracking-normal sm:text-3xl">{t("appTitle")}</h1><p className="app-text-subtle mt-1 truncate text-sm">{t("appSubtitle")}</p></div></div><div className="flex items-center gap-3"><button type="button" data-testid="examples-button" onClick={onOpenExamples} className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold"><Music2 className="h-4 w-4" />{copy.example}</button><button type="button" data-testid="settings-button" onClick={onOpenSettings} className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold"><Settings className="h-4 w-4" />{aiCopy.settings}</button></div></header>;
}
