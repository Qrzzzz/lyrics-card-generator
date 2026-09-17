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
    "font": "MonaSans-VF.woff2",
    "fontSha256": "62e40f6e14e5bbb97132b4513a4d97319ab6aaa46996cf46c7a9f357edadb662",
    "license": "LICENSE-MonaSans.txt",
    "licenseSha256": "9261dcb61fb5e3c587d50d7a9fdae12bc7422d8822d7ac06b8f34550479575de",
    "copyright": "Copyright 2022 The Mona Sans Project Authors",
    "reservedName": "Reserved Font Name \"Mona\""
  },
  {
    "font": "MonaSans-Italic-VF.woff2",
    "fontSha256": "6dd9d760c5fc0c9a7e70b462eeb6b59172ac59ce3514793c930f2c623c785be4",
    "license": "LICENSE-MonaSans.txt",
    "licenseSha256": "9261dcb61fb5e3c587d50d7a9fdae12bc7422d8822d7ac06b8f34550479575de",
    "copyright": "Copyright 2022 The Mona Sans Project Authors",
    "reservedName": "Reserved Font Name \"Mona\""
  },
  {
    "font": "SourceHanSansSC-Bold.otf",
    "fontSha256": "3baae4d7da5af78133c2db849814e1c0ca962e490f681714922cc499c6aeb355",
    "license": "LICENSE-SourceHanSans.txt",
    "licenseSha256": "f55c2d43dd905011515f5e46ba78d180027e314ef8ccaaf53a9e88fe316767cd",
    "copyright": "Copyright 2014-2021 Adobe"
  },
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

console.log("Bundled font licenses and repository, Web Lite, Pages, and desktop distribution contracts passed");

async function assertLicensedFontDirectory(fontDirectory, label) {
  for (const contract of fontContracts) {
    const fontPath = path.join(fontDirectory, contract.font);
    const licensePath = path.join(fontDirectory, contract.license);
    const fontInfo = await stat(fontPath).catch(() => undefined);
    assert.ok(fontInfo?.isFile(), `${label}: missing ${contract.font}`);

    const license = await readFile(licensePath).catch(() => undefined);
    assert.ok(license, `${label}: ${contract.font} requires ${contract.license}`);
    assert.equal(sha256(license), contract.licenseSha256, `${label}: ${contract.license} must match reviewed upstream bytes`);
    const text = license.toString("utf8");
    assert.ok(text.startsWith(contract.copyright), `${label}: ${contract.license} keeps its upstream copyright`);
    if (contract.fontSha256) {
      assert.equal(sha256(await readFile(fontPath)), contract.fontSha256, `${label}: unmodified upstream font`);
    }
    assert.ok(text.includes(contract.reservedName ?? "Name 'Source'."), `${label}: ${contract.license} keeps the Reserved Font Name`);
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
  assert.match(notices, /LICENSE-MonaSans\.txt/);
}

function normalizeLines(value) {
  return value.replace(/\r\n/gu, "\n").trimEnd();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
