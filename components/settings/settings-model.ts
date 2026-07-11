import type { LucideIcon } from "lucide-react";

export type SettingsTabId = "general" | "appearance" | "export" | "ai" | "about";

export type SettingsDestination = {
  section: SettingsTabId;
  path: string[];
};

export type SettingsHistoryState = {
  entries: SettingsDestination[];
  index: number;
};

export type SettingsContentWidth = "narrow" | "wide";

export type SettingsTabDefinition = {
  id: SettingsTabId;
  label: string;
  description: string;
  icon: LucideIcon;
  contentWidth: SettingsContentWidth;
};

export const DEFAULT_SETTINGS_TAB: SettingsTabId = "general";
