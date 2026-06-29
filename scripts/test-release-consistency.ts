import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json";

const releaseLocales = ["zh-CN", "zh-TW", "en", "fr", "ja", "es"] as const;
const readmes = ["README.md", "README.zh-TW.md", "README.en.md", "README.fr.md", "README.ja.md", "README.es.md"];
const version = packageJson.version;
const escapedVersion = version.replaceAll(".", "\\.");

const packageLock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
assert.equal(packageLock.version, version);
assert.equal(packageLock.packages[""].version, version);

const installerNamePattern = new RegExp(`Lyrics Card Generator Setup ${escapedVersion}\\.exe`);
const portableNamePattern = new RegExp(`Lyrics Card Generator-${escapedVersion}-portable\\.exe`);
const releaseNotePattern = new RegExp(`docs/releases/v${escapedVersion}\\.(?:zh-CN|zh-TW|en|fr|ja|es)\\.md`);

for (const file of readmes) {
  const source = readFileSync(resolve(file), "utf8");
  assert.match(source, installerNamePattern, `${file} installer name`);
  assert.match(source, portableNamePattern, `${file} portable name`);
  assert.match(source, releaseNotePattern, `${file} release note link`);
}

for (const locale of releaseLocales) {
  assert.ok(existsSync(resolve(`docs/releases/v${version}.${locale}.md`)), `release note ${locale}`);
}

const prepareSource = readFileSync(resolve("scripts/prepare-electron-dist.mjs"), "utf8");
assert.match(prepareSource, /productName: desktopProductName/);
assert.match(prepareSource, /artifactName: "\$\{productName\}-\$\{version\}-portable\.\$\{ext\}"/);

console.log(JSON.stringify({ ok: true, releaseConsistencyVersion: version, releaseConsistencyTests: 27 }, null, 2));
