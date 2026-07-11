import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAIUiCopy } from "../lib/ai/ui-copy";
import { getAIPromptUiCopy } from "../lib/ai/prompt-ui-copy";
import { DEFAULT_AI_SETTINGS } from "../lib/ai/types";
import { isExistingPage, sanitizeDeletedPresetHistory } from "../components/settings/AiSettingsSection";
import { settingsCopy } from "../lib/settings/copy";
import type { Locale } from "../lib/types";

const lyricEditor = readFileSync(resolve("components/editor/LyricEditor.tsx"), "utf8");
const settingsSurface = readFileSync(resolve("components/settings/SettingsSurface.tsx"), "utf8");
const settingsNavigation = readFileSync(resolve("components/settings/SettingsNavigation.tsx"), "utf8");
const settingsWorkspace = readFileSync(resolve("components/settings/useSettingsWorkspace.ts"), "utf8");
const saveController = readFileSync(resolve("lib/ai/ai-settings-save-controller.ts"), "utf8");
const settingsLayout = readFileSync(resolve("components/settings/SettingsLayout.tsx"), "utf8");
const preferences = readFileSync(resolve("components/editor/hooks/useEditorPreferences.ts"), "utf8");
const editorHeader = readFileSync(resolve("components/editor/EditorHeader.tsx"), "utf8");
const generalSettings = readFileSync(resolve("components/settings/GeneralSettingsSection.tsx"), "utf8");
const appearanceSettings = readFileSync(resolve("components/settings/AppearanceSettingsSection.tsx"), "utf8");
const exportSettings = readFileSync(resolve("components/settings/ExportSettingsSection.tsx"), "utf8");
const aiSettingsSection = readFileSync(resolve("components/settings/AiSettingsSection.tsx"), "utf8");
const aboutSettings = readFileSync(resolve("components/settings/AboutSettingsSection.tsx"), "utf8");
const dynamicBackground = readFileSync(resolve("components/layout/DynamicAppBackground.tsx"), "utf8");
const aiTranslateButton = readFileSync(resolve("components/lyrics/AiTranslateButton.tsx"), "utf8");
const lyricInput = readFileSync(resolve("components/editor/LyricInput.tsx"), "utf8");
const globals = readFileSync(resolve("app/globals.css"), "utf8");

assert.match(lyricEditor, /type ActiveSurface = "editor" \| "examples" \| "settings"/);
assert.match(lyricEditor, /x: isSettingsSurfaceOpen \? "-100%" : "0%"/);
assert.match(lyricEditor, /onRequireSettings: \(\) => openSettings\("ai"\)/);
assert.match(lyricEditor, /settingsButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
assert.doesNotMatch(lyricEditor, /if \(!isEditorSurfaceActive\) return/);
assert.match(editorHeader, /ref=\{settingsButtonRef\}[\s\S]*data-testid="settings-button"[\s\S]*onClick=\{\(\) => onOpenSettings\(\)\}/);
assert.match(editorHeader, /examples-close-button__icon/);
assert.doesNotMatch(editorHeader, /app-icon\.png"[\s\S]*?border border-\[rgb\(var\(--panel-border\)\)\]/);
assert.doesNotMatch(aboutSettings, /app-icon\.png"[\s\S]*?border border-white\/15/);
assert.match(settingsSurface, /data-testid="settings-surface"/);
assert.match(settingsSurface, /closeButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
assert.match(settingsSurface, /x: reduceMotion \? "0%" : isActive \? "0%" : "100%"/);
assert.match(settingsSurface, /opacity: reduceMotion \? \(isActive \? 1 : 0\) : 1/);
assert.match(settingsSurface, /inert=\{!isActive \? true : undefined\}/);
assert.match(settingsSurface, /tabPanelVariants\(reduceMotion\)/);
assert.match(settingsSurface, /hidden=\{!selected\}/);
assert.match(settingsSurface, /aria-hidden=\{!selected\}/);
assert.match(settingsSurface, /inert=\{!selected \? true : undefined\}/);
assert.match(settingsSurface, /animate=\{selected \? "animate" : "initial"\}/);
assert.doesNotMatch(settingsSurface, /aria-modal|MotionDialog|createPortal|bg-black\/40/);
assert.doesNotMatch(settingsSurface, /settings-wing[^"\n]*rounded-/);
assert.match(settingsSurface, /workspace\.saveState === "saved"[\s\S]*?\? null/);
assert.match(settingsSurface, /workspace\.saveState === "pending"/);
assert.match(settingsSurface, /workspace\.saveState === "saving"/);
assert.match(settingsSurface, /workspace\.syncErrorKind === "load" \? aiCopy\.loadFailed : aiCopy\.saveFailed/);
assert.match(settingsSurface, /saveStatus \? \([\s\S]*?role="status"/);
assert.doesNotMatch(settingsSurface, /aiCopy\.settingsSaved/);
assert.match(settingsSurface, /examples-close-button/);
assert.match(settingsSurface, /examples-close-button__icon/);
assert.match(settingsWorkspace, /setTimeout\(\(\) => onNotify\(message\), 420\)/);
assert.match(lyricEditor, /<AppToast notice=\{toast\} accentColor=\{resolvedAccentColor\} \/>/);
assert.match(lyricEditor, /toastIdRef\.current \+= 1/);
assert.match(settingsSurface, /isActive=\{isActive\}/);
assert.match(settingsNavigation, /settings-navigation-mobile/);
assert.match(settingsNavigation, /isActive: boolean/);
assert.match(settingsNavigation, /setMobileMenuOpen\(false\)/);
assert.match(settingsNavigation, /event\.stopPropagation\(\)/);
assert.match(settingsNavigation, /mobileTriggerRef\.current\?\.focus\(\)/);
assert.doesNotMatch(settingsNavigation, /role="menu(?:item)?"/);
assert.match(settingsNavigation, /settings-navigation__copy/);
assert.match(settingsNavigation, /scaleX: 0/);
assert.match(settingsNavigation, /transformOrigin: "left center"/);
assert.match(settingsNavigation, /scaleY: 0/);
assert.match(settingsNavigation, /transformOrigin: "center center"/);
assert.doesNotMatch(settingsNavigation, /\{description\}/);
assert.match(globals, /@media \(min-width: 720px\)/);
assert.match(globals, /@media \(min-width: 1024px\)/);
assert.match(globals, /\.app-shell \.settings-surface\.settings-wing\s*\{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
assert.match(globals, /\.settings-wing__header\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
assert.match(globals, /\.settings-navigation\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
assert.match(globals, /\.settings-group-card\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
assert.match(globals, /\.settings-group-card > section > \* \+ \*\s*\{[\s\S]*?border-top:/);
assert.match(globals, /\.settings-wing__icon\s*\{[\s\S]*?background: transparent;[\s\S]*?color: rgb\(var\(--app-subtle\)\)/);
assert.match(globals, /\.range-slider::-webkit-slider-runnable-track/);
assert.match(globals, /\.range-slider::-webkit-slider-thumb/);
assert.doesNotMatch(globals, /\.noise-layer\s*\{/);
assert.doesNotMatch(dynamicBackground, /noise-layer/);
assert.doesNotMatch(generalSettings, /sparkCursorEnabled|copy\.spark/);
assert.match(generalSettings, /copy\.reduceMotion/);
assert.match(generalSettings, /settings\.reduceMotionEnabled/);
assert.match(generalSettings, /data-testid|testId="reduce-motion-toggle"/);
assert.match(appearanceSettings, /label=\{copy\.spark\}/);
assert.match(appearanceSettings, /settings\.sparkCursorEnabled/);
assert.match(exportSettings, /<SegmentedControl/);
assert.doesNotMatch(exportSettings, /<SelectField/);
assert.match(exportSettings, /default-generated-watermark-toggle/);
assert.match(exportSettings, /default-shared-by-toggle/);
assert.match(exportSettings, /default-shared-by-text/);
assert.ok(
  exportSettings.indexOf("defaultShowGeneratedWatermark") < exportSettings.indexOf("defaultExportQuality"),
  "watermark defaults appear before export quality"
);
assert.ok(
  exportSettings.indexOf("defaultShowSharedBy") < exportSettings.indexOf("defaultExportQuality"),
  "shared-by defaults appear before export quality"
);
assert.match(lyricEditor, /userSettings\.defaultShowGeneratedWatermark/);
assert.match(lyricEditor, /userSettings\.defaultShowSharedBy/);
assert.match(lyricEditor, /userSettings\.defaultSharedByText/);
assert.match(lyricEditor, /ready=\{preferencesLoaded\}/);
assert.match(lyricEditor, /!preferencesLoaded \|\| shouldReduceMotion/);
assert.match(aiTranslateButton, /ai-translate-trigger h-11/);
assert.match(lyricInput, /<ActionButton\s+size="md"\s+icon=\{<SplitSquareVertical/);
assert.match(settingsWorkspace, /createLatestSaveController/);
assert.match(settingsWorkspace, /saveController\.setDesired\(createAISaveSnapshot\(settings, apiKey\)\)/);
assert.match(settingsWorkspace, /void saveController\.flushLatest\(\)/);
assert.match(settingsWorkspace, /saveController\.whenIdle\(\)/);
assert.match(settingsWorkspace, /setSaveState\(saveController\.getState\(\)\.status\)/);
assert.match(settingsWorkspace, /saveController\.getState\(\)\.status === "error"/);
assert.match(settingsWorkspace, /runSerializedAIWrite\(clearAISettingsApiKey\)/);
assert.match(settingsWorkspace, /if \(isClearingApiKeyRef\.current\) return/);
assert.match(settingsWorkspace, /desiredAfterClear = createAISaveSnapshot\(settings, ""\)/);
assert.match(settingsWorkspace, /saveFailedBeforeClear = saveController\.getState\(\)\.status === "error"/);
assert.doesNotMatch(settingsWorkspace, /if \(!hasApiKey\) \{/);
assert.match(settingsSurface, /disabled=\{workspace\.isClearingApiKey\}/);
assert.match(aiSettingsSection, /disabled=\{isClearingApiKey\}/);
assert.match(aiSettingsSection, /setDraftPreset\(draft\)/);
assert.match(aiSettingsSection, /disabled=\{!valid\}/);
assert.match(aiSettingsSection, /sanitizeDeletedPresetHistory/);
assert.match(settingsWorkspace, /setSaveState\("error"\)/);
assert.match(settingsWorkspace, /\}, 700\)/);
assert.doesNotMatch(settingsWorkspace, /lastSavedAISettingsRef|queuedAISavesRef/);
assert.match(saveController, /while \(desiredSnapshot && desiredSnapshot\.signature !== persistedSignature\)/);
assert.match(saveController, /persistedSignature = undefined/);
assert.match(saveController, /onPersisted\?\.\(result, snapshot, isLatest\)/);
assert.match(settingsWorkspace, /removeBackgroundImage\(previousImageId\)/);
assert.match(settingsLayout, /function SettingsSectionHeader/);
assert.match(settingsLayout, /function SettingsGroup/);
assert.match(settingsLayout, /function SettingsRow/);
assert.doesNotMatch(preferences, /isSettingsOpen|openSettings|closeSettings/);

const cleanedHistory = sanitizeDeletedPresetHistory({
  entries: ["root", "library", "preset:lyrical", "api", "preset:lyrical"],
  index: 2
}, "lyrical");
assert.ok(!cleanedHistory.entries.includes("preset:lyrical"), "deleted preset is removed from all navigation history");
assert.equal(cleanedHistory.entries[cleanedHistory.index], "library", "deletion replaces the current history page with the library");
const hiddenSettings = {
  ...DEFAULT_AI_SETTINGS,
  promptLibrary: { ...DEFAULT_AI_SETTINGS.promptLibrary, hiddenStyleIds: ["lyrical" as const] }
};
assert.equal(isExistingPage("preset:lyrical", hiddenSettings, null), false, "hidden built-in preset history is invalid");
assert.equal(isExistingPage("preset:custom:missing", hiddenSettings, null), false, "missing custom preset history is invalid");
assert.equal(isExistingPage("draft:custom:new", hiddenSettings, { id: "custom:new", title: "", prompt: "" }), true, "active draft page remains valid without persistence");

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

console.log(JSON.stringify({ ok: true, settingsWingTests: 93 }, null, 2));
