import { getAISettingsRouteBreadcrumbs, normalizeAISettingsPath } from "@/components/settings/ai-settings-routing";
import type { SettingsDestination, SettingsTabId } from "@/components/settings/settings-model";
import type { AISettings } from "@/lib/ai/types";
import type { Locale } from "@/lib/types";

export type SettingsRouteContext = {
  locale: Locale;
  settings: AISettings;
};

type SectionRouteAdapter = {
  normalizePath: (path: string[]) => string[];
  breadcrumbs: (path: string[], context: SettingsRouteContext) => Array<{ key: string; label: string; path: string[] }>;
};

const sectionRouteAdapters: Partial<Record<SettingsTabId, SectionRouteAdapter>> = {
  ai: {
    normalizePath: normalizeAISettingsPath,
    breadcrumbs: getAISettingsRouteBreadcrumbs
  }
};

export function createSettingsDestination(section: SettingsTabId, path: string[] = []): SettingsDestination {
  return normalizeSettingsDestination({ section, path });
}

export function normalizeSettingsDestination(destination: SettingsDestination): SettingsDestination {
  const adapter = sectionRouteAdapters[destination.section];
  return {
    section: destination.section,
    path: adapter ? adapter.normalizePath(destination.path) : []
  };
}

export function getSettingsRouteBreadcrumbs(
  destination: SettingsDestination,
  rootLabel: string,
  context: SettingsRouteContext
) {
  const root = {
    key: `section:${destination.section}`,
    label: rootLabel,
    destination: createSettingsDestination(destination.section)
  };
  const adapter = sectionRouteAdapters[destination.section];
  if (!adapter) return [root];
  return [
    root,
    ...adapter.breadcrumbs(destination.path, context).map((item) => ({
      key: `${destination.section}:${item.key}`,
      label: item.label,
      destination: createSettingsDestination(destination.section, item.path)
    }))
  ];
}

export function sameSettingsDestination(left: SettingsDestination | undefined, right: SettingsDestination) {
  return left?.section === right.section
    && left.path.length === right.path.length
    && left.path.every((segment, index) => segment === right.path[index]);
}
