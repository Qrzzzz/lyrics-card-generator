import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pagesFiles, preparePagesSite } from "./prepare-pages-site.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");
const fontContracts = [
  {
    font: "SourceHanSansSC-Heavy.otf",
    license: "LICENSE-SourceHanSans.txt",
    licenseSha256: "f55c2d43dd905011515f5e46ba78d180027e314ef8ccaaf53a9e88fe316767cd",
    copyright: "Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font"
  },
  {
    font: "SourceHanSerifSC-Heavy.otf",
    license: "LICENSE-SourceHanSerif.txt",
    licenseSha256: "9ff5bb567e1b92c801fc1069e5fbf992ff8efccacb9db94e5959a5b3ba9bb903",
    copyright: "Copyright 2017-2022 Adobe (http://www.adobe.com/), with Reserved Font"
  }
];

await assertLicensedFontDirectory(path.join(projectRoot, "public", "fonts"), "repository/Web Lite");
await assertApplicationLicenseAssets(projectRoot, "repository/Web Lite");

const pagesWorkflow = await readFile(path.join(projectRoot, ".github", "workflows", "pages.yml"), "utf8");
assert.match(
  pagesWorkflow,
  /node scripts\/prepare-pages-site\.mjs --out=_site/,
  "Pages must construct its artifact through the reviewed allowlist"
);
assert.match(pagesWorkflow, /path: _site/, "Pages must upload the reviewed _site tree");
for (const { license } of fontContracts) {
  assert.ok(pagesWorkflow.includes(`public/fonts/${license}`), `Pages path filters must include ${license}`);
  assert.ok(pagesFiles.includes(`public/fonts/${license}`), `Pages allowlist must include ${license}`);
}
for (const asset of [
  "public/licenses/LICENSE-Lyrics-Card-Generator.txt",
  "public/licenses/THIRD-PARTY-NOTICES.txt"
]) {
  assert.ok(pagesWorkflow.includes(asset), `Pages path filters must include ${asset}`);
  assert.ok(pagesFiles.includes(asset), `Pages allowlist must include ${asset}`);
}

const temporaryParent = path.join(projectRoot, "tmp");
await mkdir(temporaryParent, { recursive: true });
const temporarySite = await mkdtemp(path.join(temporaryParent, "font-license-pages-"));
try {
  const result = await preparePagesSite(temporarySite);
  assert.equal(result.files.length, pagesFiles.length + 1, "Pages manifest includes only the allowlist and .nojekyll");
  await assertLicensedFontDirectory(path.join(temporarySite, "public", "fonts"), "GitHub Pages artifact");
  await assertApplicationLicenseAssets(temporarySite, "GitHub Pages artifact");
} finally {
  await rm(temporarySite, { recursive: true, force: true });
}

const prepareDesktopSource = await readFile(path.join(projectRoot, "scripts", "prepare-electron-dist.mjs"), "utf8");
assert.match(
  prepareDesktopSource,
  /await cp\(publicDir, path\.join\(serverOutputDir, "public"\), \{ recursive: true \}\)/,
  "desktop staging must copy the complete licensed public tree"
);
assert.doesNotMatch(
  prepareDesktopSource,
  /!\*\*\/\*\.txt/,
  "desktop final-resource filters must not remove font license text"
);

console.log("Source Han font licenses and repository, Web Lite, Pages, and desktop distribution contracts passed");

async function assertLicensedFontDirectory(fontDirectory, label) {
  for (const contract of fontContracts) {
    const fontPath = path.join(fontDirectory, contract.font);
    const licensePath = path.join(fontDirectory, contract.license);
    const fontInfo = await stat(fontPath).catch(() => undefined);
    if (!fontInfo?.isFile()) continue;

    const license = await readFile(licensePath).catch(() => undefined);
    assert.ok(license, `${label}: ${contract.font} requires ${contract.license}`);
    assert.equal(sha256(license), contract.licenseSha256, `${label}: ${contract.license} must match reviewed upstream bytes`);
    const text = license.toString("utf8");
    assert.ok(text.startsWith(contract.copyright), `${label}: ${contract.license} keeps the applicable Adobe copyright`);
    assert.match(text, /Name 'Source'\./, `${label}: ${contract.license} keeps the Reserved Font Name`);
    assert.match(text, /SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007/, `${label}: ${contract.license} includes OFL 1.1`);
  }
}

async function assertApplicationLicenseAssets(root, label) {
  const sourceLicense = await readFile(path.join(projectRoot, "LICENSE"), "utf8");
  const bundledLicense = await readFile(
    path.join(root, "public", "licenses", "LICENSE-Lyrics-Card-Generator.txt"),
    "utf8"
  );
  assert.equal(
    normalizeLines(bundledLicense),
    normalizeLines(sourceLicense),
    `${label}: bundled source-available license must match the repository license`
  );
  const notices = await readFile(
    path.join(root, "public", "licenses", "THIRD-PARTY-NOTICES.txt"),
    "utf8"
  );
  assert.match(notices, /Source Han Sans SC Heavy/);
  assert.match(notices, /LICENSE-SourceHanSans\.txt/);
  assert.match(notices, /Source Han Serif SC Heavy/);
  assert.match(notices, /LICENSE-SourceHanSerif\.txt/);
}

function normalizeLines(value) {
  return value.replace(/\r\n/gu, "\n").trimEnd();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
