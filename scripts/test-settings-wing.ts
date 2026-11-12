import assert from "node:assert/strict";
import { getAIUiCopy } from "../lib/ai/ui-copy";
import { getAIPromptUiCopy } from "../lib/ai/prompt-ui-copy";
import { DEFAULT_AI_SETTINGS } from "../lib/ai/types";
import { isExistingPage, resetPromptLibraryToInitial } from "../components/settings/AiSettingsSection";
import { resolveAISettingsPage } from "../components/settings/ai-settings-routing";
import {
  createSettingsDestination,
  getSettingsRouteBreadcrumbs,
  sameSettingsDestination
} from "../components/settings/settings-routing";
import { settingsCopy } from "../lib/settings/copy";
import type { Locale } from "../lib/types";

// UI visibility, focus, persistence and navigation are exercised by the browser
// and packaged settings suites. Keep direct routing and reset behavior here.
const genericPresetDestination = createSettingsDestination("ai", ["library", "preset", "lyrical"]);
assert.deepEqual(genericPresetDestination, { section: "ai", path: ["library", "preset", "lyrical"] });
assert.equal(resolveAISettingsPage(genericPresetDestination.path), "preset:lyrical");
assert.equal(sameSettingsDestination(genericPresetDestination, createSettingsDestination("ai", ["library", "preset", "lyrical"])), true);
assert.equal(sameSettingsDestination(genericPresetDestination, createSettingsDestination("ai", ["library"])), false);
const routeContext = { locale: "zh" as const, settings: DEFAULT_AI_SETTINGS };
assert.deepEqual(
  getSettingsRouteBreadcrumbs(createSettingsDestination("ai"), settingsCopy.zh.ai, routeContext).map((item) => item.label),
  [getAIPromptUiCopy("zh").workspace],
  "the AI root omits the redundant sidebar category crumb"
);
assert.deepEqual(
  getSettingsRouteBreadcrumbs(createSettingsDestination("ai", ["api"]), settingsCopy.zh.ai, routeContext).map((item) => item.label),
  [getAIPromptUiCopy("zh").workspace, getAIPromptUiCopy("zh").apiConfiguration],
  "AI child pages retain their complete internal breadcrumb path"
);
const hiddenSettings = {
  ...DEFAULT_AI_SETTINGS,
  promptLibrary: { ...DEFAULT_AI_SETTINGS.promptLibrary, hiddenStyleIds: ["lyrical" as const] }
};
assert.equal(isExistingPage("preset:lyrical", hiddenSettings, null), false, "hidden built-in preset history is invalid");
assert.equal(isExistingPage("preset:custom:missing", hiddenSettings, null), false, "missing custom preset history is invalid");
assert.equal(isExistingPage("draft:custom:new", hiddenSettings, { id: "custom:new", title: "", prompt: "" }), true, "active draft page remains valid without persistence");

const resetLibrary = resetPromptLibraryToInitial({
  localeOverrides: { zh: { formatRulesOverride: "changed", styleOverrides: [{ id: "lyrical", title: "changed", prompt: "changed" }] } },
  hiddenStyleIds: ["faithful"],
  customPresets: [{ id: "custom:reset", title: "Changed", prompt: "Changed prompt", initialTitle: "Original", initialPrompt: "Original prompt" }]
});
assert.deepEqual(resetLibrary.localeOverrides, {}, "reset all clears every localized override");
assert.deepEqual(resetLibrary.hiddenStyleIds, [], "reset all restores removed defaults");
assert.equal(resetLibrary.customPresets[0]?.title, "Original", "reset all restores a custom preset title");
assert.equal(resetLibrary.customPresets[0]?.prompt, "Original prompt", "reset all restores a custom preset prompt");

for (const locale of ["zh", "zh-TW", "en", "fr", "ja", "es"] satisfies Locale[]) {
  const copy = settingsCopy[locale];
  const aiCopy = getAIUiCopy(locale);
  const promptCopy = getAIPromptUiCopy(locale);
  assert.ok(aiCopy.loadFailed.trim(), `${locale} loadFailed`);
  assert.ok(aiCopy.saveFailed.trim(), `${locale} saveFailed`);
  for (const [key, value] of Object.entries(promptCopy)) {
    assert.ok(value.trim(), `${locale} prompt copy ${key}`);
  }
  for (const key of [
    "generalDescription",
    "appearanceDescription",
    "exportDescription",
    "aiDescription",
    "aboutDescription",
    "reduceMotion",
    "reduceMotionDescription",
    "defaultGeneratedWatermark",
    "defaultGeneratedWatermarkDescription",
    "defaultSharedBy",
    "defaultSharedByDescription",
    "defaultSharedByText",
    "defaultSharedByPlaceholder",
    "clearAlreadyEmpty"
  ] as const) {
    assert.ok(copy[key].trim(), `${locale} ${key}`);
  }
}

console.log(JSON.stringify({ ok: true, settingsRoutingAndCopy: true }, null, 2));
