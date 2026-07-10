"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";
import { Loader2, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { AboutSettingsSection } from "@/components/settings/AboutSettingsSection";
import { AiSettingsSection } from "@/components/settings/AiSettingsSection";
import { AppearanceSettingsSection } from "@/components/settings/AppearanceSettingsSection";
import { ExportSettingsSection } from "@/components/settings/ExportSettingsSection";
import { GeneralSettingsSection } from "@/components/settings/GeneralSettingsSection";
import { SettingsGroup, SettingsSectionHeader } from "@/components/settings/SettingsLayout";
import { getSettingsTabs, SettingsNavigation } from "@/components/settings/SettingsNavigation";
import type { SettingsTabId } from "@/components/settings/settings-model";
import { useSettingsWorkspace } from "@/components/settings/useSettingsWorkspace";
import type { AISettingsSummary } from "@/lib/ai/types";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { createT } from "@/lib/i18n";
import { settingsCopy } from "@/lib/settings/copy";
import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";

type SettingsSurfaceProps = {
  isActive: boolean;
  requestedTab?: SettingsTabId;
  locale: Locale;
  userSettings: UserSettings;
  transition: Transition;
  onLocaleChange: (locale: Locale) => void;
  onUserSettingsPreview: (settings: UserSettings) => void;
  onUserSettingsChange: (settings: UserSettings) => void;
  onClose: () => void;
  onSaved: (settings: AISettingsSummary, message?: string) => void;
  onNotify: (message: string) => void;
};

export function SettingsSurface({
  isActive,
  requestedTab,
  locale,
  userSettings,
  transition,
  onLocaleChange,
  onUserSettingsPreview,
  onUserSettingsChange,
  onClose,
  onSaved,
  onNotify
}: SettingsSurfaceProps) {
  const copy = settingsCopy[locale];
  const aiCopy = getAIUiCopy(locale);
  const t = useMemo(() => createT(locale), [locale]);
  const reduceMotion = useReducedMotion() ?? false;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabs = useMemo(() => getSettingsTabs(copy), [copy]);
  const workspace = useSettingsWorkspace({
    open: isActive,
    requestedTab,
    locale,
    userSettings,
    onLocaleChange,
    onUserSettingsPreview,
    onUserSettingsChange,
    onClose,
    onSaved,
    onNotify
  });
  const activeTab = tabs.find((tab) => tab.id === workspace.activeTab) ?? tabs[0];

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !workspace.isClearingApiKey) {
        workspace.closeWorkspace();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, workspace.isClearingApiKey, workspace.closeWorkspace]);

  useEffect(() => {
    if (!isActive) return;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isActive]);

  return (
    <motion.section
      aria-hidden={!isActive}
      aria-labelledby="settings-surface-title"
      className={[
        "settings-surface settings-wing absolute inset-0 z-20 flex min-w-0 flex-col overflow-hidden",
        isActive ? "pointer-events-auto" : "pointer-events-none"
      ].join(" ")}
      data-testid="settings-surface"
      animate={{
        x: reduceMotion ? "0%" : isActive ? "0%" : "100%",
        opacity: isActive ? 1 : 0
      }}
      initial={false}
      inert={!isActive ? true : undefined}
      transition={transition}
    >
      <header className="settings-wing__header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="settings-wing__icon" aria-hidden="true">
            <Settings className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 id="settings-surface-title" className="app-text-primary truncate text-xl font-black sm:text-2xl">{copy.settings}</h1>
              <span className="app-text-subtle hidden truncate text-sm font-medium sm:inline">/ {activeTab.label}</span>
            </div>
            <p className="app-text-subtle mt-0.5 hidden truncate text-xs md:block">{activeTab.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="app-text-subtle hidden items-center gap-2 text-xs sm:flex" role="status" aria-live="polite">
            <span className={["h-1.5 w-1.5 rounded-full", workspace.isSaving ? "animate-pulse bg-amber-300" : "bg-emerald-300"].join(" ")} />
            {workspace.isSaving ? aiCopy.saving : aiCopy.settingsSaved}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={workspace.closeWorkspace}
            className="app-button control-focus grid h-10 w-10 place-items-center rounded-xl"
            aria-label={copy.cancel}
            data-testid="settings-close-button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="settings-wing__body">
        <SettingsNavigation
          tabs={tabs}
          active={workspace.activeTab}
          onChange={workspace.setActiveTab}
          ariaLabel={copy.settings}
        />

        <div className="settings-wing__content-scroll">
          <div
            className={[
              "settings-wing__content",
              activeTab.contentWidth === "wide" ? "settings-wing__content--wide" : "settings-wing__content--narrow"
            ].join(" ")}
          >
            <SettingsSectionHeader title={activeTab.label} description={activeTab.description} />

            {tabs.map((tab) => (
              <div
                key={tab.id}
                hidden={tab.id !== workspace.activeTab}
                aria-hidden={tab.id !== workspace.activeTab}
                inert={tab.id !== workspace.activeTab ? true : undefined}
                className="mt-6"
                data-settings-panel={tab.id}
              >
                <SettingsGroup>
                  {tab.id === "general" ? (
                    <GeneralSettingsSection
                      locale={locale}
                      copy={copy}
                      onLocaleChange={workspace.handleLocaleChange}
                    />
                  ) : tab.id === "appearance" ? (
                    <AppearanceSettingsSection settings={workspace.draft} copy={copy} onChange={workspace.updateDraft} />
                  ) : tab.id === "export" ? (
                    <ExportSettingsSection settings={workspace.draft} copy={copy} onChange={workspace.updateDraft} />
                  ) : tab.id === "about" ? (
                    <AboutSettingsSection copy={copy} t={t} />
                  ) : workspace.isLoading ? (
                    <div className="app-text-subtle flex items-center gap-2 p-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {copy.ai}
                    </div>
                  ) : (
                    <AiSettingsSection
                      settings={workspace.settings}
                      apiKey={workspace.apiKey}
                      hasApiKey={workspace.hasApiKey}
                      locale={locale}
                      copy={aiCopy}
                      isClearingApiKey={workspace.isClearingApiKey}
                      onSettingsChange={workspace.setSettings}
                      onApiKeyChange={workspace.setApiKey}
                      onClearApiKey={workspace.handleClearApiKey}
                    />
                  )}
                </SettingsGroup>
              </div>
            ))}

            {workspace.error ? (
              <p role="alert" className="status-danger mt-4 rounded-xl border px-4 py-3 text-sm">{workspace.error}</p>
            ) : null}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
