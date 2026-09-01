import { getAIPromptUiCopy } from "@/lib/ai/prompt-ui-copy";
import { getTranslationPresets } from "@/lib/ai/styles";
import type { AISettings } from "@/lib/ai/types";
import type { Locale } from "@/lib/types";

export type AIPage =
  | "root"
  | "api"
  | "defaults"
  | "library"
  | "format"
  | `preset:${string}`
  | `draft:${string}`;

export function normalizeAISettingsPath(path: string[]): string[] {
  return getAISettingsPath(resolveAISettingsPage(path));
}

export function resolveAISettingsPage(path: string[]): AIPage {
  if (path.length === 0) return "root";
  if (path.length === 1 && path[0] === "api") return "api";
  if (path.length === 1 && path[0] === "defaults") return "defaults";
  if (path[0] !== "library") return "root";
  if (path.length === 1) return "library";
  if (path.length === 2 && path[1] === "format") return "format";
  if (path.length === 3 && path[1] === "preset" && path[2]) return `preset:${path[2]}`;
  if (path.length === 3 && path[1] === "draft" && path[2]) return `draft:${path[2]}`;
  return "library";
}

export function getAISettingsPath(page: AIPage): string[] {
  if (page === "root") return [];
  if (page === "api") return ["api"];
  if (page === "defaults") return ["defaults"];
  if (page === "library") return ["library"];
  if (page === "format") return ["library", "format"];
  if (page.startsWith("draft:")) return ["library", "draft", page.slice("draft:".length)];
  return ["library", "preset", page.slice("preset:".length)];
}

export function getAISettingsRouteBreadcrumbs(path: string[], { locale, settings }: { locale: Locale; settings: AISettings }): Array<{ key: string; label: string; path: string[] }> {
  const page = resolveAISettingsPage(path);
  const copy = getAIPromptUiCopy(locale);
  const items: Array<{ page: AIPage; label: string }> = [{ page: "root", label: copy.workspace }];
  if (page === "api") {
    items.push({ page: "api", label: copy.apiConfiguration });
  } else if (page === "defaults") {
    items.push({ page: "defaults", label: copy.translationDefaults });
  } else if (page !== "root") {
    items.push({ page: "library", label: copy.promptLibrary });
    if (page === "format") {
      items.push({ page: "format", label: copy.formatRules });
    } else if (page.startsWith("draft:")) {
      items.push({ page, label: copy.newPresetTitle });
    } else if (page.startsWith("preset:")) {
      const id = page.slice("preset:".length);
      const preset = getTranslationPresets(locale, settings.promptLibrary).find((item) => item.id === id);
      items.push({ page, label: preset?.name || copy.editPreset });
    }
  }
  return items.map((item, index) => ({
    key: `${item.page}:${index}`,
    label: item.label,
    path: getAISettingsPath(item.page)
  }));
}
