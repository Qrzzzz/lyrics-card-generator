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
const releaseVersion = packageJson.version;
const escapedReleaseVersion = releaseVersion.replaceAll(".", "\\.");
const unpublishedStatusMarkers: Record<(typeof releaseLocales)[number], string> = {
  "zh-CN": "尚未发布",
  "zh-TW": "尚未發布",
  en: "not yet released",
  fr: "pas encore publié",
  ja: "未公開",
  es: "aún no publicado"
};

const packageLock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
assert.equal(packageLock.version, releaseVersion);
assert.equal(packageLock.packages[""].version, releaseVersion);

const installerNamePattern = new RegExp(`Lyrics Card Generator Setup ${escapedReleaseVersion}\\.exe`);
const portableNamePattern = new RegExp(`Lyrics Card Generator-${escapedReleaseVersion}-portable\\.exe`);

function readmeHeader(source: string) {
  return source.split(/\r?\n/u).slice(0, 30).join("\n");
}

function assertReadmeHeaderReleaseLink(source: string, file: string, locale: string) {
  assert.match(
    readmeHeader(source),
    new RegExp(`docs/releases/v${escapedReleaseVersion}\\.${locale}\\.md`),
    `${file} header must link to its own locale's latest published release note`
  );
}

for (const [file, locale] of readmes) {
  const source = readFileSync(resolve(file), "utf8");
  assert.match(source, installerNamePattern, `${file} installer name`);
  assert.match(source, portableNamePattern, `${file} portable name`);
  assertReadmeHeaderReleaseLink(source, file, locale);
  assert.ok(!source.includes(unpublishedStatusMarkers[locale]), `${file} must not label v${releaseVersion} as unpublished`);
  assert.match(
    source,
    new RegExp(`docs/releases/v${escapedReleaseVersion}\\.${locale}\\.md`),
    `${file} links its published release notes`
  );

  const currentLink = `docs/releases/v${releaseVersion}.${locale}.md`;
  const wrongLocale = locale === "en" ? "fr" : "en";
  const wrongHeaderLocale = source.replace(currentLink, `docs/releases/v${releaseVersion}.${wrongLocale}.md`);
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
  assert.ok(existsSync(resolve(`docs/releases/v${releaseVersion}.${locale}.md`)), `published release note ${locale}`);
  const releaseFile = `docs/releases/v${releaseVersion}.${locale}.md`;
  assert.ok(existsSync(resolve(releaseFile)), `release note ${locale}`);
  const source = readFileSync(resolve(releaseFile), "utf8");
  const languageSwitcher = source.split(/\r?\n/u).find((line) => line.trim()) ?? "";
  const linkedReleaseVersions = [...languageSwitcher.matchAll(/docs\/releases\/v([0-9]+\.[0-9]+\.[0-9]+)\.(?:zh-CN|zh-TW|en|fr|ja|es)\.md/gu)]
    .map((match) => match[1]);
  assert.ok(linkedReleaseVersions.length >= 5, `${releaseFile} top language switcher must link every other locale`);
  assert.ok(linkedReleaseVersions.every((linkedVersion) => linkedVersion === releaseVersion), `${releaseFile} language links must use v${releaseVersion}`);
  for (const linkedLocale of releaseLocales) {
    if (linkedLocale === locale) continue;
    assert.match(
      languageSwitcher,
      new RegExp(`docs/releases/v${escapedReleaseVersion}\\.${linkedLocale}\\.md`),
      `${releaseFile} top language switcher must link ${linkedLocale}`
    );
  }
}

const prepareSource = readFileSync(resolve("scripts/prepare-electron-dist.mjs"), "utf8");
assert.match(prepareSource, /productName: desktopProductName/);
assert.match(prepareSource, /artifactName: "\$\{productName\}-\$\{version\}-portable\.\$\{ext\}"/);

console.log(JSON.stringify({
  ok: true,
  releaseCandidateVersion: releaseVersion,
  latestPublishedVersion: releaseVersion,
  releaseConsistencyLocales: releaseLocales.length
}, null, 2));
