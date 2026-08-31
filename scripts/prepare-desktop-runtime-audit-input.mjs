import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDesktopRuntimeAuditInput,
  npmPurl
} from "./desktop-runtime-dependency-policy.mjs";

if (process.platform !== "win32") {
  throw new Error("Desktop runtime audit preparation must verify the packaged Windows Electron executable on Windows.");
}

const projectRoot = process.cwd();
const outputDirectory = path.join(projectRoot, "dist-desktop", "desktop-runtime-audit");
const packageJsonPath = path.join(outputDirectory, "package.json");
const packageLockPath = path.join(outputDirectory, "package-lock.json");
const inventoryPath = path.join(outputDirectory, "runtime-inventory.json");
const rootPackage = await readJson(path.join(projectRoot, "package.json"));
const rootLock = await readJson(path.join(projectRoot, "package-lock.json"));
const policy = await readJson(path.join(projectRoot, "security", "desktop-runtime-audit.json"));
const generated = createDesktopRuntimeAuditInput({ rootPackage, rootLock, policy });
assert.deepEqual(
  generated.inventory.roots.map((entry) => entry.name),
  ["electron"],
  "this release inventory expects Electron as the sole explicit desktop runtime audit root"
);
const electronRoot = generated.inventory.roots[0];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const auditPackageText = `${JSON.stringify(generated.packageJson, null, 2)}\n`;
const auditLockText = `${JSON.stringify(generated.packageLock, null, 2)}\n`;
await writeFile(packageJsonPath, auditPackageText);
await writeFile(packageLockPath, auditLockText);

const installedElectron = await readJson(path.join(projectRoot, "node_modules", "electron", "package.json"));
assert.equal(installedElectron.version, electronRoot.version, "installed Electron must match the audited lock root");
assert.equal(installedElectron.license, "MIT", "the installed Electron package must retain its declared MIT license");
const electronChecksums = await readJson(path.join(projectRoot, "node_modules", "electron", "checksums.json"));
const electronBinaryFileName = `electron-v${electronRoot.version}-win32-x64.zip`;
const electronBinarySha256 = electronChecksums[electronBinaryFileName];
assert.match(electronBinarySha256 ?? "", /^[0-9a-f]{64}$/u, "Electron package checksums must pin the Windows x64 binary archive");

const stagedPackage = await readJson(path.join(projectRoot, "dist-desktop", "app", "package.json"));
assert.equal(stagedPackage.build?.electronVersion, electronRoot.version, "electron-builder staging must use the audited Electron version");
const stagedElectronDist = stagedPackage.build?.electronDist ?? null;
const distributionSource = stagedElectronDist ? "local-electron-dist" : "electron-builder-download";
const electronDistVersion = stagedElectronDist
  ? (await readFile(path.join(projectRoot, "node_modules", "electron", "dist", "version"), "utf8")).trim()
  : null;
if (stagedElectronDist) {
  assert.equal(electronDistVersion, electronRoot.version, "the local Electron distribution must match the audited lock root");
}
const packagedExecutable = path.join(projectRoot, "release", "win-unpacked", `${stagedPackage.productName}.exe`);
const packagedRuntimeVersion = probeElectronVersion(packagedExecutable);
assert.equal(packagedRuntimeVersion, electronRoot.version, "the unpacked Windows runtime must report the audited Electron version");

const productionPackages = await Promise.all(
  ["next", "sharp"].map(async (name) => {
    const relativeManifestPath = `release/win-unpacked/resources/server/_node_modules/${name}/package.json`;
    const manifestPath = path.join(projectRoot, ...relativeManifestPath.split("/"));
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    assert.equal(manifest.name, name, `${relativeManifestPath} must describe ${name}`);
    assert.match(manifest.version ?? "", /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, `${name} must have an exact packaged version`);
    return {
      name,
      version: manifest.version,
      purl: npmPurl(name, manifest.version),
      relativeManifestPath,
      manifestSha256: sha256(manifestBytes)
    };
  })
);

const smokeResultsPath = path.join(projectRoot, "playwright-report", "desktop-final-artifacts", "results.json");
const smokeEvidence = await readJson(smokeResultsPath);
assert.equal(smokeEvidence.ok, true, "final Setup smoke evidence must pass before runtime audit preparation");
assert.deepEqual(
  [...new Set(smokeEvidence.results?.map((entry) => entry.label))].sort(),
  ["setup"],
  "final artifact evidence must cover the Setup distribution"
);

const releaseEntries = await readdir(path.join(projectRoot, "release"), { withFileTypes: true });
const finalArtifactNames = releaseEntries
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en"));
assert.deepEqual(
  finalArtifactNames,
  [`Lyrics.Card.Generator.Setup.${rootPackage.version}.exe`],
  "runtime audit preparation must bind the sole downloadable Windows Setup asset"
);
const finalArtifacts = [];
for (const fileName of finalArtifactNames) {
  const artifactPath = path.join(projectRoot, "release", fileName);
  const artifactSha256 = await sha256File(artifactPath);
  const smokeResult = smokeEvidence.results.find((entry) => entry.artifactSha256 === artifactSha256);
  assert.ok(smokeResult, `${fileName} does not match a tested final-artifact byte stream`);
  assert.equal(smokeResult.electronVersion, electronRoot.version, `${fileName} smoke evidence must report the audited Electron version`);
  finalArtifacts.push({
    fileName,
    sha256: artifactSha256,
    smokeLabel: smokeResult.label,
    reportedElectronVersion: smokeResult.electronVersion,
    versionEvidence: smokeResult.electronVersionEvidence
  });
}

const inventory = {
  schemaVersion: 1,
  application: {
    name: rootPackage.name,
    version: rootPackage.version,
    productName: stagedPackage.productName
  },
  auditInput: {
    packageJsonSha256: sha256(Buffer.from(auditPackageText)),
    packageLockSha256: sha256(Buffer.from(auditLockText)),
    roots: generated.inventory.roots,
    closure: generated.inventory.closure
  },
  desktopRuntime: {
    name: electronRoot.name,
    version: electronRoot.version,
    purl: electronRoot.purl,
    manifestSection: electronRoot.manifestSection,
    lockPath: electronRoot.lockPath,
    resolved: electronRoot.resolved,
    integrity: electronRoot.integrity,
    licenseDeclared: installedElectron.license,
    binaryArtifact: {
      fileName: electronBinaryFileName,
      downloadLocation: `https://github.com/electron/electron/releases/download/v${electronRoot.version}/${electronBinaryFileName}`,
      sha256: electronBinarySha256
    },
    installedPackageVersion: installedElectron.version,
    distributionSource,
    electronDistVersion,
    stagedElectronDist,
    stagedManifestVersion: stagedPackage.build.electronVersion,
    packagedExecutable: {
      relativePath: `release/win-unpacked/${stagedPackage.productName}.exe`,
      sbomRelativePath: `${stagedPackage.productName}.exe`,
      sha256: await sha256File(packagedExecutable),
      reportedElectronVersion: packagedRuntimeVersion
    },
    finalArtifacts
  },
  productionRuntime: {
    packages: productionPackages
  }
};
await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  electron: electronRoot.version,
  closurePackages: generated.inventory.closure.length,
  productionPackages: Object.fromEntries(productionPackages.map((entry) => [entry.name, entry.version])),
  finalArtifacts: finalArtifacts.map((entry) => ({ fileName: entry.fileName, sha256: entry.sha256 }))
}, null, 2));

function probeElectronVersion(executablePath) {
  const result = spawnSync(executablePath, ["-p", "process.versions.electron"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    timeout: 90_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${path.basename(executablePath)} Electron version probe failed: ${result.stderr || result.stdout}`);
  const version = result.stdout.trim();
  assert.match(version, /^\d+\.\d+\.\d+$/u, `${path.basename(executablePath)} did not report process.versions.electron`);
  return version;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}
