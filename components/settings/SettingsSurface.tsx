"use client";

import { motion, type Transition } from "framer-motion";
import { Loader2, Settings, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AboutSettingsSection } from "@/components/settings/AboutSettingsSection";
import { AiSettingsSection, getAISettingsBreadcrumbs, type AIPage } from "@/components/settings/AiSettingsSection";
import { AppearanceSettingsSection } from "@/components/settings/AppearanceSettingsSection";
import { ExportSettingsSection } from "@/components/settings/ExportSettingsSection";
import { GeneralSettingsSection } from "@/components/settings/GeneralSettingsSection";
import { useAppReducedMotion } from "@/components/motion/AppMotionProvider";
import { SettingsHistoryBar, type SettingsBreadcrumb } from "@/components/settings/SettingsHistoryBar";
import { SettingsGroup } from "@/components/settings/SettingsLayout";
import { getSettingsTabs, SettingsNavigation } from "@/components/settings/SettingsNavigation";
import type { SettingsDestination, SettingsHistoryState, SettingsTabId } from "@/components/settings/settings-model";
import { useSettingsWorkspace } from "@/components/settings/useSettingsWorkspace";
import type { AISettingsSummary } from "@/lib/ai/types";
import { getAIPromptUiCopy } from "@/lib/ai/prompt-ui-copy";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import { createT } from "@/lib/i18n";
import { opacityTransition, reducedMotionTransition, tabPanelVariants } from "@/lib/motion/tokens";
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
  const reduceMotion = useAppReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabs = useMemo(() => getSettingsTabs(copy), [copy]);
  const [history, setHistory] = useState<SettingsHistoryState>(() => ({
    entries: [{ tab: requestedTab ?? "general", aiPage: requestedTab === "ai" ? "root" : undefined }],
    index: 0
  }));
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
  const destination = history.entries[history.index] ?? { tab: "general" as const };
  const activeTab = tabs.find((tab) => tab.id === destination.tab) ?? tabs[0];
  const aiPage = destination.tab === "ai" ? destination.aiPage ?? "root" : "root";
  const promptCopy = getAIPromptUiCopy(locale);
  const breadcrumbs = useMemo<SettingsBreadcrumb[]>(() => {
    const root: SettingsBreadcrumb = {
      key: `tab:${activeTab.id}`,
      label: activeTab.label,
      destination: { tab: activeTab.id, aiPage: activeTab.id === "ai" ? "root" : undefined }
    };
    if (activeTab.id !== "ai") return [root];
    return [
      root,
      ...getAISettingsBreadcrumbs(aiPage, promptCopy, workspace.settings, locale).map((item, index) => ({
        key: `ai:${item.page}:${index}`,
        label: item.label,
        destination: { tab: "ai" as const, aiPage: item.page }
      }))
    ];
  }, [activeTab, aiPage, locale, promptCopy, workspace.settings]);
  const tabVariants = tabPanelVariants(reduceMotion);
  const tabTransition = reduceMotion ? reducedMotionTransition : opacityTransition;
  const saveStatus = workspace.saveState === "saved"
    ? null
    : workspace.saveState === "pending"
      ? { label: aiCopy.changesPending, dotClass: "bg-amber-300" }
      : workspace.saveState === "saving"
        ? { label: aiCopy.saving, dotClass: "animate-pulse bg-amber-300" }
        : {
            label: workspace.syncErrorKind === "load" ? aiCopy.loadFailed : aiCopy.saveFailed,
            dotClass: "bg-rose-300"
          };

  const navigateDestination = useCallback((next: SettingsDestination, options?: { replace?: boolean }) => {
    setHistory((current) => {
      const normalized: SettingsDestination = {
        tab: next.tab,
        aiPage: next.tab === "ai" ? next.aiPage ?? "root" : undefined
      };
      const active = current.entries[current.index];
      if (sameDestination(active, normalized)) return current;
      if (options?.replace) {
        const entries = [...current.entries];
        entries[current.index] = normalized;
        return { entries, index: current.index };
      }
      const entries = [...current.entries.slice(0, current.index + 1), normalized];
      return { entries, index: entries.length - 1 };
    });
  }, []);

  const moveHistory = useCallback((delta: number) => {
    setHistory((current) => ({
      ...current,
      index: Math.max(0, Math.min(current.entries.length - 1, current.index + delta))
    }));
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const tab = requestedTab ?? workspace.activeTab;
    setHistory({ entries: [{ tab, aiPage: tab === "ai" ? "root" : undefined }], index: 0 });
  }, [isActive]);

  useEffect(() => {
    if (!isActive || workspace.activeTab === destination.tab) return;
    workspace.setActiveTab(destination.tab);
  }, [destination.tab, isActive, workspace.activeTab, workspace.setActiveTab]);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !workspace.isClearingApiKey) {
        workspace.closeWorkspace();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, workspace.isClearingApiKey, workspace.closeWorkspace]);

  useEffect(() => {
    if (!isActive) return;
    // Do not let focus scroll the transformed wing into place before its slide completes.
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
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
      data-surface-state={isActive ? "open" : "closed"}
      animate={{
        x: reduceMotion ? "0%" : isActive ? "0%" : "100%",
        opacity: reduceMotion ? (isActive ? 1 : 0) : 1
      }}
      initial={false}
      inert={!isActive ? true : undefined}
      transition={transition}
    >
      <header className="settings-wing__header">
        <div className="settings-wing__identity min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="settings-wing__icon" aria-hidden="true">
              <Settings className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-2">
                <h1 id="settings-surface-title" className="app-text-primary truncate text-xl font-black tracking-normal sm:text-3xl">{copy.settings}</h1>
                <span className="app-text-subtle hidden truncate text-sm font-medium sm:inline">/ {activeTab.label}</span>
              </div>
              <p className="app-text-subtle mt-1 hidden truncate text-sm md:block">{activeTab.description}</p>
            </div>
          </div>
          <SettingsHistoryBar
            backLabel={promptCopy.back}
            forwardLabel={promptCopy.forward}
            breadcrumbs={breadcrumbs}
            canGoBack={history.index > 0}
            canGoForward={history.index < history.entries.length - 1}
            onBack={() => moveHistory(-1)}
            onForward={() => moveHistory(1)}
            onNavigate={navigateDestination}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {saveStatus ? (
            <span className="app-text-subtle hidden items-center gap-2 text-xs sm:flex" role="status" aria-live="polite">
              <span className={["h-1.5 w-1.5 rounded-full", saveStatus.dotClass].join(" ")} />
              {saveStatus.label}
            </span>
          ) : null}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={workspace.closeWorkspace}
            disabled={workspace.isClearingApiKey}
            className="app-button control-focus examples-close-button inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold"
            aria-label={copy.cancel}
            data-testid="settings-close-button"
          >
            <X className="examples-close-button__icon h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="settings-wing__body">
        <SettingsNavigation
          tabs={tabs}
          active={destination.tab}
          isActive={isActive}
          onChange={(tab) => navigateDestination({ tab, aiPage: tab === "ai" ? "root" : undefined })}
          ariaLabel={copy.settings}
        />

        <div className="settings-wing__content-scroll">
          <div
            className={[
              "settings-wing__content",
              activeTab.contentWidth === "wide" ? "settings-wing__content--wide" : "settings-wing__content--narrow"
            ].join(" ")}
          >
            {tabs.map((tab) => {
              const selected = tab.id === destination.tab;
              return (
              <motion.div
                key={tab.id}
                hidden={!selected}
                aria-hidden={!selected}
                inert={!selected ? true : undefined}
                className="mt-2"
                data-settings-panel={tab.id}
                variants={tabVariants}
                initial={false}
                animate={selected ? "animate" : "initial"}
                transition={tabTransition}
              >
                <SettingsGroup>
                  {tab.id === "general" ? (
                    <GeneralSettingsSection
                      locale={locale}
                      copy={copy}
                      settings={workspace.draft}
                      onLocaleChange={workspace.handleLocaleChange}
                      onChange={workspace.updateDraft}
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
                      open={isActive}
                      page={aiPage}
                      settings={workspace.settings}
                      apiKey={workspace.apiKey}
                      hasApiKey={workspace.hasApiKey}
                      locale={locale}
                      copy={aiCopy}
                      isClearingApiKey={workspace.isClearingApiKey}
                      onSettingsChange={workspace.setSettings}
                      onApiKeyChange={workspace.setApiKey}
                      onClearApiKey={workspace.handleClearApiKey}
                      onNavigate={(page: AIPage, options) => navigateDestination({ tab: "ai", aiPage: page }, options)}
                    />
                  )}
                </SettingsGroup>
              </motion.div>
              );
            })}

            {workspace.error ? (
              <p role="alert" className="status-danger mt-4 rounded-xl border px-4 py-3 text-sm">{workspace.error}</p>
            ) : null}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function sameDestination(left: SettingsDestination | undefined, right: SettingsDestination) {
  return left?.tab === right.tab && left.aiPage === right.aiPage;
}
