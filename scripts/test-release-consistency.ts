import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json";

const releaseLocales = ["zh-CN", "zh-TW", "en", "fr", "ja", "es"] as const;
const readmes = [
  ["README.md", "zh-CN"],
  ["README.zh-TW.md", "zh-TW"],
  ["README.en.md", "en"],
  ["README.fr.md", "fr"],
  ["README.ja.md", "ja"],
  ["README.es.md", "es"]
] as const;
const version = packageJson.version;
const escapedVersion = version.replaceAll(".", "\\.");

const packageLock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
assert.equal(packageLock.version, version);
assert.equal(packageLock.packages[""].version, version);

const installerNamePattern = new RegExp(`Lyrics Card Generator Setup ${escapedVersion}\\.exe`);
const portableNamePattern = new RegExp(`Lyrics Card Generator-${escapedVersion}-portable\\.exe`);

function readmeHeader(source: string) {
  return source.split(/\r?\n/u).slice(0, 30).join("\n");
}

function assertReadmeHeaderReleaseLink(source: string, file: string, locale: string) {
  assert.match(
    readmeHeader(source),
    new RegExp(`docs/releases/v${escapedVersion}\\.${locale}\\.md`),
    `${file} header must link to its own locale's current release note`
  );
}

for (const [file, locale] of readmes) {
  const source = readFileSync(resolve(file), "utf8");
  assert.match(source, installerNamePattern, `${file} installer name`);
  assert.match(source, portableNamePattern, `${file} portable name`);
  assertReadmeHeaderReleaseLink(source, file, locale);

  const currentLink = `docs/releases/v${version}.${locale}.md`;
  const wrongLocale = locale === "en" ? "fr" : "en";
  const wrongHeaderLocale = source.replace(currentLink, `docs/releases/v${version}.${wrongLocale}.md`);
  assert.throws(
    () => assertReadmeHeaderReleaseLink(wrongHeaderLocale, file, locale),
    `${file} wrong-locale header mutation must fail even if the footer lists all languages`
  );
  const missingHeaderLink = source.replace(currentLink, "docs/releases/older-release.md");
  assert.throws(
    () => assertReadmeHeaderReleaseLink(missingHeaderLink, file, locale),
    `${file} missing header release-link mutation must fail`
  );
}

for (const locale of releaseLocales) {
  const releaseFile = `docs/releases/v${version}.${locale}.md`;
  assert.ok(existsSync(resolve(releaseFile)), `release note ${locale}`);
  const source = readFileSync(resolve(releaseFile), "utf8");
  const languageSwitcher = source.split(/\r?\n/u).find((line) => line.trim()) ?? "";
  const linkedReleaseVersions = [...languageSwitcher.matchAll(/docs\/releases\/v([0-9]+\.[0-9]+\.[0-9]+)\.(?:zh-CN|zh-TW|en|fr|ja|es)\.md/gu)]
    .map((match) => match[1]);
  assert.ok(linkedReleaseVersions.length >= 5, `${releaseFile} top language switcher must link every other locale`);
  assert.ok(linkedReleaseVersions.every((linkedVersion) => linkedVersion === version), `${releaseFile} language links must use v${version}`);
  for (const linkedLocale of releaseLocales) {
    if (linkedLocale === locale) continue;
    assert.match(
      languageSwitcher,
      new RegExp(`docs/releases/v${escapedVersion}\\.${linkedLocale}\\.md`),
      `${releaseFile} top language switcher must link ${linkedLocale}`
    );
  }
}

const prepareSource = readFileSync(resolve("scripts/prepare-electron-dist.mjs"), "utf8");
assert.match(prepareSource, /productName: desktopProductName/);
assert.match(prepareSource, /artifactName: "\$\{productName\}-\$\{version\}-portable\.\$\{ext\}"/);

console.log(JSON.stringify({ ok: true, releaseConsistencyVersion: version, releaseConsistencyLocales: releaseLocales.length }, null, 2));
