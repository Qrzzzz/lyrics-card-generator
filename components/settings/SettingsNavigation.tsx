"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, ChevronDown, Download, Info, Palette, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SettingsTabDefinition, SettingsTabId } from "@/components/settings/settings-model";
import { motionSprings, reducedMotionTransition } from "@/lib/motion/tokens";
import type { settingsCopy } from "@/lib/settings/copy";
import type { Locale } from "@/lib/types";

export function getSettingsTabs(copy: typeof settingsCopy[Locale]): SettingsTabDefinition[] {
  return [
    { id: "general", label: copy.general, description: copy.generalDescription, icon: SlidersHorizontal, contentWidth: "narrow" },
    { id: "appearance", label: copy.appearance, description: copy.appearanceDescription, icon: Palette, contentWidth: "wide" },
    { id: "export", label: copy.export, description: copy.exportDescription, icon: Download, contentWidth: "narrow" },
    { id: "ai", label: copy.ai, description: copy.aiDescription, icon: Bot, contentWidth: "wide" },
    { id: "about", label: copy.about, description: copy.aboutDescription, icon: Info, contentWidth: "narrow" }
  ];
}

export function SettingsNavigation({
  tabs,
  active,
  isActive,
  onChange,
  ariaLabel
}: {
  tabs: SettingsTabDefinition[];
  active: SettingsTabId;
  isActive: boolean;
  onChange: (id: SettingsTabId) => void;
  ariaLabel: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const ActiveIcon = activeTab.icon;

  useEffect(() => {
    if (!isActive) {
      setMobileMenuOpen(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const closeMobileMenu = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMobileMenuOpen(false);
      mobileTriggerRef.current?.focus();
    };

    document.addEventListener("keydown", closeMobileMenu, true);
    return () => document.removeEventListener("keydown", closeMobileMenu, true);
  }, [mobileMenuOpen]);

  function selectTab(id: SettingsTabId) {
    onChange(id);
    setMobileMenuOpen(false);
  }

  return (
    <>
      <nav aria-label={ariaLabel} className="settings-navigation">
        {tabs.map(({ id, label, description, icon: Icon }) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              aria-current={selected ? "page" : undefined}
              className="settings-navigation__item control-focus"
              title={label}
            >
              {selected ? (
                <>
                  <motion.span
                    className="settings-navigation__active"
                    initial={reduceMotion ? false : { scaleX: 0, opacity: 0.72 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    style={{ transformOrigin: "left center" }}
                    transition={reduceMotion ? reducedMotionTransition : motionSprings.control}
                  />
                  <motion.span
                    className="settings-navigation__accent"
                    initial={reduceMotion ? false : { scaleY: 0, opacity: 0.72 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    style={{ transformOrigin: "center center" }}
                    transition={reduceMotion ? reducedMotionTransition : motionSprings.control}
                  />
                </>
              ) : null}
              <Icon className="relative h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="settings-navigation__copy relative min-w-0">
                <span className="app-text-primary block truncate text-sm font-bold">{label}</span>
                <span className="app-text-subtle mt-0.5 block truncate text-xs">{description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="settings-navigation-mobile">
        <button
          ref={mobileTriggerRef}
          type="button"
          className="app-button control-focus flex h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left"
          aria-expanded={mobileMenuOpen}
          aria-controls="settings-category-menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span className="flex min-w-0 items-center gap-3">
            <ActiveIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="truncate text-sm font-bold">{activeTab.label}</span>
          </span>
          <ChevronDown className={["h-4 w-4 shrink-0 transition-transform", mobileMenuOpen ? "rotate-180" : ""].join(" ")} aria-hidden="true" />
        </button>
        <AnimatePresence initial={false}>
          {mobileMenuOpen ? (
            <motion.div
              id="settings-category-menu"
              aria-label={ariaLabel}
              className="settings-navigation-mobile__menu"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={reduceMotion ? reducedMotionTransition : motionSprings.control}
            >
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="app-button flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold"
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => selectTab(id)}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}
