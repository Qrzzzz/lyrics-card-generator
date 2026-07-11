const assert = require("node:assert/strict");
const { normalizePromptLibrary } = require("../electron/ai-prompt-settings");

const normalized = normalizePromptLibrary({
  localeOverrides: {
    zh: { formatRulesOverride: "只输出中文", styleOverrides: [{ id: "lyrical", title: "中文", prompt: "中文风格" }] },
    en: { formatRulesOverride: "English only", styleOverrides: [{ id: "lyrical", title: "English", prompt: "English style" }] }
  },
  customPresets: [
    { id: "custom:a", title: "Old A", prompt: "Old" },
    { id: "custom:a", title: "A", prompt: "Updated" },
    { id: "custom:b", title: "B", prompt: "Second" },
    { id: "custom:empty", title: "Empty", prompt: "" }
  ]
});

assert.equal(normalized.localeOverrides.zh.styleOverrides[0].prompt, "中文风格");
assert.equal(normalized.localeOverrides.en.styleOverrides[0].prompt, "English style");
assert.equal(normalized.customPresets.length, 2);
assert.equal(normalized.customPresets[0].title, "A");
assert.equal(normalized.customPresets[1].id, "custom:b");

const legacy = normalizePromptLibrary({ formatRulesOverride: "legacy", styleOverrides: [{ id: "spoken", title: "Legacy", prompt: "Legacy prompt" }] });
assert.equal(legacy.localeOverrides.zh.formatRulesOverride, "legacy");
assert.equal(legacy.localeOverrides.en, undefined);

console.log(JSON.stringify({ ok: true, electronAiPromptSettingsTests: 8 }, null, 2));
