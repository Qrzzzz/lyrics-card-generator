import type { LucideIcon } from "lucide-react";

export type SettingsTabId = "general" | "appearance" | "export" | "ai" | "about";

export type AISettingsPageId =
  | "root"
  | "api"
  | "library"
  | "format"
  | `preset:${string}`
  | `draft:${string}`;

export type SettingsDestination = {
  tab: SettingsTabId;
  aiPage?: AISettingsPageId;
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
