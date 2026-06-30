import assert from "node:assert/strict";
import {
  DEFAULT_INSTRUMENTAL_TEXT,
  DEFAULT_LYRICS,
  DEFAULT_TRANSLATION,
  defaultState
} from "../components/editor/editor-defaults";
import { useEditorThemeTokens } from "../components/editor/hooks/useEditorThemeTokens";
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

const albumTokens = useEditorThemeTokens({
  userSettings: normalizeUserSettings({ uiTheme: "album-dynamic" }),
  palette: {
    ...DEFAULT_PALETTE,
    primary: "#2255AA",
    dark: "#111827"
  }
});
assert.equal(albumTokens.themeAccent, "#2255AA");
assert.equal(albumTokens.uiBackgroundColor, "#111827");
assert.equal(albumTokens.resolvedThemeTokens["--app-text-primary"], albumTokens.uiTextTokens.primary);

const customTokens = useEditorThemeTokens({
  userSettings: normalizeUserSettings({
    uiTheme: "custom",
    appBackground: { mode: "solid", solidColor: "#F5F5F5" }
  }),
  palette: DEFAULT_PALETTE
});
assert.equal(customTokens.customThemeTokens["--app-bg"], "#F5F5F5");
assert.equal(customTokens.customThemeTokens["--panel-bg"], "255 255 255 / 0.78");

console.log(JSON.stringify({ ok: true, editorRefactorTests: 16 }, null, 2));
