import assert from "node:assert/strict";
import {
  DEFAULT_INSTRUMENTAL_TEXT,
  DEFAULT_LYRICS,
  DEFAULT_TRANSLATION,
  defaultState
} from "../components/editor/editor-defaults";
import { resolveEditorThemeTokens } from "../components/editor/resolveEditorThemeTokens";
import { normalizeAIErrorMessage } from "../components/editor/utils/normalizeAIErrorMessage";
import { sizeSnapshot } from "../components/editor/utils/sizeSnapshot";
import { DEFAULT_FONT_SCHEME } from "../lib/font-schemes";
import { DEFAULT_PALETTE } from "../lib/palette-background";
import { normalizeUserSettings } from "../lib/settings/user-settings";

assert.equal(defaultState.locale, "zh");
assert.equal(defaultState.style.instrumentalText, DEFAULT_INSTRUMENTAL_TEXT.zh);
assert.equal(defaultState.style.fontScheme?.presetId, DEFAULT_FONT_SCHEME.presetId);
assert.equal(defaultState.lastLandscapeSize?.ratio, "16:9");
assert.equal(defaultState.lastPortraitSize?.ratio, "custom");
assert.equal(defaultState.palette?.primary, DEFAULT_PALETTE.primary);
assert.equal(DEFAULT_LYRICS.split("\n").length, 4);
assert.equal(DEFAULT_TRANSLATION.split("\n").length, 4);
assert.equal(DEFAULT_INSTRUMENTAL_TEXT["zh-TW"], "純音樂");
assert.equal(DEFAULT_INSTRUMENTAL_TEXT.ja, "インストゥルメンタル");

assert.deepEqual(sizeSnapshot(defaultState.style), {
  ratio: "custom",
  width: 1040,
  height: 1080
});

assert.equal(
  normalizeAIErrorMessage(new Error("Error invoking remote method 'lyrics-card:ai-translate': Error: boom")),
  "boom"
);
assert.equal(normalizeAIErrorMessage("unexpected"), "AI 翻译请求失败，请检查网络和接口设置。");

const albumTokens = resolveEditorThemeTokens({
  userSettings: normalizeUserSettings({ uiThemeMode: "album-dynamic" }),
  palette: {
    ...DEFAULT_PALETTE,
    primary: "#2255AA",
    dark: "#111827"
  }
});
assert.equal(albumTokens.themeAccent, "#2255AA");
assert.equal(albumTokens.uiBackgroundColor, "#111827");
assert.equal(albumTokens.resolvedThemeTokens["--app-text-primary"], albumTokens.uiTextTokens.primary);

const lightTokens = resolveEditorThemeTokens({
  userSettings: normalizeUserSettings({
    uiThemeMode: "light",
    uiAccentMode: "custom",
    uiCustomAccentColor: "#111111"
  }),
  palette: {
    ...DEFAULT_PALETTE,
    primary: "#2255AA",
    dark: "#111827"
  }
});
assert.equal(lightTokens.themeAccent, "#111111");
assert.equal(lightTokens.uiBackgroundColor, "#FFFFFF");
assert.equal(lightTokens.uiTextTokens.primary, "#191612");
assert.deepEqual(lightTokens.customThemeTokens, {});

const darkTokens = resolveEditorThemeTokens({
  userSettings: normalizeUserSettings({ uiThemeMode: "dark" }),
  palette: undefined
});
assert.equal(darkTokens.themeAccent, DEFAULT_PALETTE.primary);
assert.equal(darkTokens.uiBackgroundColor, "#08090C");
assert.equal(darkTokens.uiTextTokens.primary, "#FFFFFF");

console.log(JSON.stringify({ ok: true, editorRefactorTests: 20 }, null, 2));
