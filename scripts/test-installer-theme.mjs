import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locales = JSON.parse(await readFile(path.join(root, "build/installer/locales.json"), "utf8"));
assert.deepEqual(Object.keys(locales).sort(), ["en", "es", "fr", "ja", "zh-CN", "zh-TW"]);
for (const [language, copy] of Object.entries(locales)) {
  assert.deepEqual(Object.keys(copy).sort(), Object.keys(locales.en).sort(), `${language} keys`);
  for (const [key, value] of Object.entries(copy)) assert.ok(value.trim().length, `${language}.${key}`);
}
const include = await readFile(path.join(root, "build/installer.nsh"), "utf8");
assert.match(include, /\$\{IfNot\} \$\{Silent\}\s+\$\{AndIfNot\} \$\{isUpdated\}/, "unattended/update callers must retain the native engine path");
assert.doesNotMatch(include, /MUI_BGCOLOR|customWelcomePage|SetCtlColors/, "do not regress to wizard recoloring");
if (process.platform === "win32") {
  const build = spawnSync(process.execPath, ["scripts/build-installer-shell.mjs"], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const report = path.join(root, "dist-desktop/installer/self-test.txt");
  const run = spawnSync(path.join(root, "dist-desktop/installer/LyricsSetup.exe"), ["--self-test", report, "--version", version], { timeout: 30_000, windowsHide: true });
  const output = await readFile(report, "utf8");
  assert.equal(run.status, 0, output);
  console.log(output.trim());
} else {
  console.log("Installer locale/contracts passed; native WPF checks require Windows.");
}
