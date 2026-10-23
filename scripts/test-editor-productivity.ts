import assert from "node:assert/strict";
import { parsePrecisionValue } from "../lib/precision-value";
import { normalizeUserSettings, resetUserSettings } from "../lib/settings/user-settings";
for (const text of ["", "-", ".", "1.", "1e2", "Infinity", "NaN", "1.83", "1.49", "2.11"]) {
  assert.equal(parsePrecisionValue(text, 1.5, 2.1, 0.05), null, text);
}
for (const text of ["1.5", "1.65", "2.10", "1,75"]) {
  assert.equal(parsePrecisionValue(text, 1.5, 2.1, 0.05), Number(text.replace(",", ".")));
}
assert.equal(parsePrecisionValue("1001", 720, 1440, 1), 1001);
assert.equal(parsePrecisionValue("0,79", 0.6, 0.9, 0.01), 0.79);
for (const value of [undefined, null, 2, "unknown"]) assert.equal(normalizeUserSettings({ uiTextSize: value }).uiTextSize, "standard");
for (const value of ["standard", "large", "extra-large"] as const) {
  const stored = JSON.parse(JSON.stringify(normalizeUserSettings({ uiTextSize: value, uiThemeMode: "light" })));
  assert.equal(normalizeUserSettings(stored).uiTextSize, value);
  assert.equal(resetUserSettings(stored, { persist: false }).uiTextSize, "standard");
  assert.equal(normalizeUserSettings(stored).uiThemeMode, "light");
}
console.log("Precision draft bounds/steps/local decimals and interface-text preference migration/reset passed.");
