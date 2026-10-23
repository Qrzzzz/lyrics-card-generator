const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('electron/main.js', 'utf8');
const declaration = source.match(/function resolveEffectiveUiThemeId\(settings\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(declaration, 'exercise the native startup resolver actually used by createWindow');
for (const dark of [true, false]) {
  const resolve = vm.runInNewContext(`(${declaration})`, {
    nativeTheme: { shouldUseDarkColors: dark },
    isAcrylicTheme: value => value === 'dark-acrylic' || value === 'light-acrylic'
  });
  assert.equal(resolve({ uiThemeMode: 'system' }), dark ? 'dark' : 'light');
  assert.equal(resolve({ uiThemeMode: 'system', uiAcrylicEnabled: true }), dark ? 'dark-acrylic' : 'light-acrylic');
  for (const mode of ['dark', 'light', 'album-dynamic']) assert.equal(resolve({ uiThemeMode: mode }), mode);
  assert.equal(resolve({ uiTheme: 'light-acrylic' }), 'light-acrylic');
  assert.equal(resolve({ uiTheme: 'dark-acrylic' }), 'dark-acrylic');
}
console.log('Electron startup system appearance and explicit/legacy theme tests passed');
