import assert from "node:assert/strict";
import crypto from "node:crypto";
import { npmPurl } from "./desktop-runtime-dependency-policy.mjs";
import { evaluateProductionAudit } from "./production-audit-policy.mjs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BUILD_ONLY_PACKAGES = ["electron-builder", "eslint", "@playwright/test", "tailwindcss"];
const FINALIZER_CREATOR = "Tool: lyrics-card-generator-release-sbom-finalizer-1";
const EVIDENCE_RELATIONSHIP_COMMENT = (version) =>
  `evident-by: packaged process.versions.electron reported ${version} for this executable`;

export function enrichReleaseSbom({ sbom, inventory, auditPackageText, auditLockText, auditReportText }) {
  validateReleaseEvidence({ inventory, auditPackageText, auditLockText, auditReportText });
  validateSpdxDocument(sbom);
  assert.equal(findElectronPackages(sbom).length, 0, "raw Syft SBOM unexpectedly contains Electron; review cataloger output before enrichment");
  const result = structuredClone(sbom);
  assertRecord(result.creationInfo, "release SBOM creationInfo");
  assert.ok(Array.isArray(result.creationInfo.creators), "release SBOM creationInfo.creators must be an array");
  if (!result.creationInfo.creators.includes(FINALIZER_CREATOR)) result.creationInfo.creators.push(FINALIZER_CREATOR);
  const context = resolvePackagedApplicationContext(result, inventory, { requireSha256: false });
  const expectedExecutableSha256 = inventory.desktopRuntime.packagedExecutable.sha256;
  const existingExecutableSha256 = context.executableFile.checksums
    ?.find((entry) => entry.algorithm === "SHA256")
    ?.checksumValue?.toLowerCase();
  if (existingExecutableSha256) {
    assert.equal(existingExecutableSha256, expectedExecutableSha256, "raw SBOM executable SHA-256 conflicts with runtime inventory");
  } else {
    context.executableFile.checksums ??= [];
    context.executableFile.checksums.push({ algorithm: "SHA256", checksumValue: expectedExecutableSha256 });
  }
  const electronPackage = createElectronPackage(inventory);
  result.packages.push(electronPackage);
  result.relationships.push(
    {
      spdxElementId: context.rootPackage.SPDXID,
      relatedSpdxElement: electronPackage.SPDXID,
      relationshipType: "CONTAINS"
    },
    {
      spdxElementId: context.applicationPackage.SPDXID,
      relatedSpdxElement: electronPackage.SPDXID,
      relationshipType: "DEPENDS_ON"
    },
    {
      spdxElementId: electronPackage.SPDXID,
      relatedSpdxElement: context.executableFile.SPDXID,
      relationshipType: "OTHER",
      comment: EVIDENCE_RELATIONSHIP_COMMENT(inventory.desktopRuntime.version)
    }
  );
  return result;
}

export function inspectReleaseSbom({
  sbom,
  inventory,
  auditPackageText,
  auditLockText,
  auditReportText,
  productionAuditPolicy = { schemaVersion: 1, exceptions: [] }
}) {
  validateReleaseEvidence({ inventory, auditPackageText, auditLockText, auditReportText });
  validateSpdxDocument(sbom);
  assert.ok(sbom.creationInfo?.creators?.includes(FINALIZER_CREATOR), "release SBOM must disclose the Electron inventory finalizer");
  const context = resolvePackagedApplicationContext(sbom, inventory);
  const electronPackages = findElectronPackages(sbom);
  assert.equal(electronPackages.length, 1, "release SBOM must contain exactly one Electron package/component");
  const electronPackage = electronPackages[0];
  const runtime = inventory.desktopRuntime;
  assert.equal(electronPackage.name, "electron", "the desktop runtime component must use the canonical electron npm name");
  assert.equal(electronPackage.versionInfo, runtime.version, "release SBOM Electron version must match desktop runtime inventory");
  assert.equal(
    electronPackage.downloadLocation,
    runtime.binaryArtifact.downloadLocation,
    "Electron downloadLocation must identify the exact upstream binary artifact"
  );
  assert.notEqual(electronPackage.downloadLocation, "NOASSERTION", "Electron cannot be a NOASSERTION-only component");
  assert.equal(electronPackage.licenseDeclared, runtime.licenseDeclared, "Electron declared license must match the installed package");
  assert.notEqual(electronPackage.licenseDeclared, "NOASSERTION", "Electron declared license cannot be NOASSERTION");
  assert.equal(electronPackage.primaryPackagePurpose, "LIBRARY", "Electron must be classified as the packaged desktop framework/runtime");
  assert.equal(electronPackage.sourceInfo, electronSourceInfo(inventory), "Electron sourceInfo must describe the binary and lock evidence");
  assert.ok(
    packagePurls(electronPackage).includes(runtime.purl),
    `Electron must expose the exact PACKAGE-MANAGER purl ${runtime.purl}`
  );
  const electronCpeReferences = (electronPackage.externalRefs ?? []).filter((reference) =>
    reference?.referenceType === "cpe23Type" ||
    (typeof reference?.referenceLocator === "string" && reference.referenceLocator.toLowerCase().startsWith("cpe:"))
  );
  assert.equal(
    electronCpeReferences.length,
    1,
    "Electron must expose exactly one SECURITY cpe23Type external reference"
  );
  const [electronCpeReference] = electronCpeReferences;
  assert.equal(
    electronCpeReference.referenceCategory,
    "SECURITY",
    "Electron cpe23Type referenceCategory must be SECURITY"
  );
  assert.equal(
    electronCpeReference.referenceType,
    "cpe23Type",
    "Electron SECURITY external referenceType must be cpe23Type"
  );
  assert.equal(
    electronCpeReference.referenceLocator,
    electronCpe23Locator(runtime.version),
    `Electron cpe23Type referenceLocator must identify electronjs:electron:${runtime.version}`
  );
  assert.equal(
    electronPackage.checksums?.find((entry) => entry.algorithm === "SHA256")?.checksumValue?.toLowerCase(),
    runtime.binaryArtifact.sha256,
    "Electron package SHA-256 must identify the exact upstream Windows binary archive"
  );

  assertRelationship(
    sbom,
    context.rootPackage.SPDXID,
    electronPackage.SPDXID,
    "CONTAINS",
    "SPDX document root must contain Electron"
  );
  assertRelationship(
    sbom,
    context.applicationPackage.SPDXID,
    electronPackage.SPDXID,
    "DEPENDS_ON",
    "packaged desktop application must depend on Electron"
  );
  const evidenceRelationship = sbom.relationships.find((relationship) =>
    relationship.spdxElementId === electronPackage.SPDXID &&
    relationship.relatedSpdxElement === context.executableFile.SPDXID &&
    relationship.relationshipType === "OTHER"
  );
  assert.ok(evidenceRelationship, "Electron must be related to the exact packaged executable evidence file");
  assert.equal(
    evidenceRelationship.comment,
    EVIDENCE_RELATIONSHIP_COMMENT(runtime.version),
    "Electron executable evidence relationship must record the runtime probe"
  );

  const runtimeVersions = {};
  for (const expected of inventory.productionRuntime.packages) {
    const matches = sbom.packages.filter((entry) => packagePurls(entry).includes(expected.purl));
    assert.equal(matches.length, 1, `release SBOM must contain exactly one packaged ${expected.name}@${expected.version}`);
    assert.equal(matches[0].versionInfo, expected.version, `${expected.name} SBOM version must match the packaged production inventory`);
    runtimeVersions[expected.name] = expected.version;
  }
  for (const buildOnlyPackage of BUILD_ONLY_PACKAGES) {
    assert.equal(
      sbom.packages.some((entry) => packagePurls(entry).some((purl) => npmPurlName(purl) === buildOnlyPackage)),
      false,
      `release SBOM unexpectedly contains build/dev dependency ${buildOnlyPackage}`
    );
  }
  assert.equal(productionAuditPolicy.schemaVersion, 1, "unsupported production audit policy schemaVersion during SBOM inspection");
  assert.ok(Array.isArray(productionAuditPolicy.exceptions), "production audit policy exceptions must be an array");
  for (const exception of productionAuditPolicy.exceptions) {
    assert.ok(
      sbom.packages.some((entry) => packagePurls(entry).some((purl) => npmPurlName(purl) === exception.package)),
      `approved production exception ${exception.advisory} does not match packaged SBOM package ${exception.package}`
    );
  }

  return {
    spdxVersion: sbom.spdxVersion,
    packages: sbom.packages.length,
    npmPackages: new Set(sbom.packages.flatMap(packagePurls)).size,
    electron: runtime.version,
    productionRuntime: runtimeVersions,
    approvedExceptionPackages: productionAuditPolicy.exceptions.map((entry) => entry.package),
    relationships: {
      rootContainsElectron: true,
      applicationDependsOnElectron: true,
      executableEvidence: true
    }
  };
}

export function validateReleaseEvidence({ inventory, auditPackageText, auditLockText, auditReportText }) {
  assertRecord(inventory, "release runtime inventory");
  assert.equal(inventory.schemaVersion, 1, "unsupported release runtime inventory schemaVersion");
  assertRecord(inventory.application, "release runtime inventory application");
  assert.match(inventory.application.name ?? "", /\S/u, "application.name is required");
  assert.match(inventory.application.version ?? "", /^\d+\.\d+\.\d+$/u, "application.version must be exact");
  assert.match(inventory.application.productName ?? "", /\S/u, "application.productName is required");
  assertRecord(inventory.auditInput, "release runtime auditInput");
  assertRecord(inventory.desktopRuntime, "release runtime desktopRuntime");
  assertRecord(inventory.productionRuntime, "release runtime productionRuntime");
  assertRecord(inventory.auditResult, "release runtime auditResult");

  assert.equal(
    sha256(Buffer.from(auditPackageText)),
    inventory.auditInput.packageJsonSha256,
    "desktop runtime audit package.json hash does not match inventory"
  );
  assert.equal(
    sha256(Buffer.from(auditLockText)),
    inventory.auditInput.packageLockSha256,
    "desktop runtime audit package-lock.json hash does not match inventory"
  );
  assert.equal(
    sha256(Buffer.from(auditReportText)),
    inventory.auditResult.reportSha256,
    "desktop runtime npm audit report hash does not match inventory"
  );
  const auditPackage = JSON.parse(auditPackageText);
  const auditLock = JSON.parse(auditLockText);
  const auditReport = JSON.parse(auditReportText);
  const runtime = inventory.desktopRuntime;
  assert.equal(runtime.name, "electron", "desktop runtime inventory must identify Electron");
  assert.match(runtime.version ?? "", /^\d+\.\d+\.\d+$/u, "desktop runtime Electron version must be exact");
  assert.equal(runtime.purl, npmPurl("electron", runtime.version), "desktop runtime Electron purl must be exact");
  assert.equal(runtime.manifestSection, "devDependencies", "Electron remains a build-tooling declaration while being audited as packaged runtime");
  assert.match(runtime.resolved ?? "", /^https:\/\/registry\.npmjs\.org\/electron\/-\/electron-/u, "Electron resolved artifact must be the locked npm tarball");
  assert.match(runtime.integrity ?? "", /^sha512-/u, "Electron audit root needs a locked integrity digest");
  assert.equal(runtime.licenseDeclared, "MIT", "Electron inventory must carry its declared MIT license");
  assertRecord(runtime.binaryArtifact, "desktop runtime Electron binaryArtifact");
  assert.equal(
    runtime.binaryArtifact.fileName,
    `electron-v${runtime.version}-win32-x64.zip`,
    "Electron binary artifact name must match the packaged Windows x64 runtime"
  );
  assert.equal(
    runtime.binaryArtifact.downloadLocation,
    `https://github.com/electron/electron/releases/download/v${runtime.version}/${runtime.binaryArtifact.fileName}`,
    "Electron binary download location must identify the exact upstream release asset"
  );
  assert.match(runtime.binaryArtifact.sha256 ?? "", SHA256_PATTERN, "Electron binary artifact needs the upstream SHA-256 digest");
  for (const field of ["installedPackageVersion", "stagedManifestVersion"]) {
    assert.equal(runtime[field], runtime.version, `desktop runtime ${field} must match Electron inventory version`);
  }
  assert.ok(
    ["local-electron-dist", "electron-builder-download"].includes(runtime.distributionSource),
    "desktop runtime distributionSource must identify the electron-builder input path"
  );
  if (runtime.distributionSource === "local-electron-dist") {
    assert.equal(runtime.electronDistVersion, runtime.version, "local Electron dist version must match inventory");
    assert.match(runtime.stagedElectronDist ?? "", /electron\/dist$/u, "local Electron dist path must be pinned in staging");
  } else {
    assert.equal(runtime.electronDistVersion, null, "electron-builder download path must not claim a local Electron dist version");
    assert.equal(runtime.stagedElectronDist, null, "electron-builder download path must not claim a local Electron dist path");
  }
  assertRecord(runtime.packagedExecutable, "desktop runtime packagedExecutable");
  assert.equal(
    runtime.packagedExecutable.reportedElectronVersion,
    runtime.version,
    "packaged executable process.versions.electron must match inventory"
  );
  assert.match(runtime.packagedExecutable.sha256 ?? "", SHA256_PATTERN, "packaged executable needs a SHA-256 digest");
  assert.match(runtime.packagedExecutable.sbomRelativePath ?? "", /\.exe$/iu, "packaged executable needs an SBOM-relative path");
  assert.ok(Array.isArray(runtime.finalArtifacts), "desktop runtime finalArtifacts must be an array");
  assert.deepEqual(
    runtime.finalArtifacts.map((entry) => entry.smokeLabel).sort(),
    ["setup"],
    "final artifact inventory must cover only Setup"
  );
  for (const artifact of runtime.finalArtifacts) {
    assert.match(artifact.sha256 ?? "", SHA256_PATTERN, `${artifact.fileName} needs a SHA-256 digest`);
    assert.equal(artifact.reportedElectronVersion, runtime.version, `${artifact.fileName} must report the inventory Electron version`);
    assert.match(artifact.versionEvidence ?? "", /(?:process\.versions\.electron|renderer-user-agent)/u, `${artifact.fileName} needs runtime-derived Electron version evidence`);
  }

  assert.deepEqual(auditPackage.dependencies, { electron: runtime.version }, "desktop audit package must have only Electron as a production root");
  assert.deepEqual(auditLock.packages?.[""]?.dependencies, { electron: runtime.version }, "desktop audit lock must have only Electron as a production root");
  const electronLock = auditLock.packages?.[runtime.lockPath];
  assertRecord(electronLock, "desktop audit Electron lock entry");
  assert.equal(electronLock.version, runtime.version, "desktop audit lock Electron version must match inventory");
  assert.equal(electronLock.resolved, runtime.resolved, "desktop audit lock Electron artifact must match inventory");
  assert.equal(electronLock.integrity, runtime.integrity, "desktop audit lock Electron integrity must match inventory");
  assert.equal(electronLock.dev, undefined, "desktop audit lock cannot mark Electron as dev");
  assert.equal(electronLock.devOptional, undefined, "desktop audit lock cannot mark Electron as devOptional");
  assert.ok(Array.isArray(inventory.auditInput.roots), "auditInput.roots must be an array");
  assert.equal(inventory.auditInput.roots.length, 1, "desktop audit inventory must have one explicit root");
  assert.deepEqual(
    inventory.auditInput.roots[0],
    {
      name: runtime.name,
      manifestSection: runtime.manifestSection,
      version: runtime.version,
      purl: runtime.purl,
      lockPath: runtime.lockPath,
      resolved: runtime.resolved,
      integrity: runtime.integrity
    },
    "desktop audit root and packaged runtime inventory must be identical"
  );
  assert.ok(Array.isArray(inventory.auditInput.closure) && inventory.auditInput.closure.length > 0, "desktop audit closure must not be empty");
  const closurePaths = inventory.auditInput.closure.map((entry) => entry.lockPath).sort();
  assert.deepEqual(
    Object.keys(auditLock.packages).filter((lockPath) => lockPath !== "").sort(),
    closurePaths,
    "desktop audit lock packages must exactly match the recorded Electron closure"
  );
  for (const closureEntry of inventory.auditInput.closure) {
    const lockEntry = auditLock.packages[closureEntry.lockPath];
    assert.equal(lockEntry.version, closureEntry.version, `${closureEntry.lockPath} version must match audit inventory`);
    assert.equal(lockEntry.resolved, closureEntry.resolved, `${closureEntry.lockPath} artifact must match audit inventory`);
    assert.equal(lockEntry.integrity, closureEntry.integrity, `${closureEntry.lockPath} integrity must match audit inventory`);
    assert.equal(lockEntry.dev, undefined, `${closureEntry.lockPath} cannot be omitted by --omit=dev`);
    assert.equal(lockEntry.devOptional, undefined, `${closureEntry.lockPath} cannot be omitted by --omit=dev`);
  }

  assert.deepEqual(
    auditReport.metadata?.vulnerabilities,
    inventory.auditResult.vulnerabilityCounts,
    "desktop runtime audit vulnerability counts must match the retained report"
  );
  assert.deepEqual(
    auditReport.metadata?.dependencies ?? null,
    inventory.auditResult.dependencyCounts,
    "desktop runtime audit dependency counts must match the retained report"
  );
  assert.equal(auditReport.metadata?.dependencies?.dev ?? 0, 0, "desktop runtime npm audit must not see a dev-only tree");
  const auditEvaluation = evaluateProductionAudit(auditReport, { schemaVersion: 1, exceptions: [] });
  assert.equal(auditEvaluation.ok, true, `desktop runtime npm audit report failed policy: ${auditEvaluation.errors.join("; ")}`);

  assert.ok(Array.isArray(inventory.productionRuntime.packages), "productionRuntime.packages must be an array");
  assert.deepEqual(
    inventory.productionRuntime.packages.map((entry) => entry.name).sort(),
    ["next", "sharp"],
    "production runtime inventory must independently retain Next and Sharp"
  );
  for (const entry of inventory.productionRuntime.packages) {
    assert.match(entry.version ?? "", /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, `${entry.name} packaged version must be exact`);
    assert.equal(entry.purl, npmPurl(entry.name, entry.version), `${entry.name} packaged purl must be exact`);
    assert.match(entry.manifestSha256 ?? "", SHA256_PATTERN, `${entry.name} packaged manifest needs a SHA-256 digest`);
  }
}

function createElectronPackage(inventory) {
  const runtime = inventory.desktopRuntime;
  const idHash = sha256(Buffer.from(runtime.purl)).slice(0, 16);
  return {
    name: "electron",
    SPDXID: `SPDXRef-Package-npm-electron-${idHash}`,
    versionInfo: runtime.version,
    supplier: "NOASSERTION",
    downloadLocation: runtime.binaryArtifact.downloadLocation,
    filesAnalyzed: false,
    checksums: [{ algorithm: "SHA256", checksumValue: runtime.binaryArtifact.sha256 }],
    sourceInfo: electronSourceInfo(inventory),
    licenseConcluded: "NOASSERTION",
    licenseDeclared: runtime.licenseDeclared,
    copyrightText: "NOASSERTION",
    primaryPackagePurpose: "LIBRARY",
    externalRefs: [
      {
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: runtime.purl
      },
      {
        referenceCategory: "SECURITY",
        referenceType: "cpe23Type",
        referenceLocator: electronCpe23Locator(runtime.version)
      }
    ]
  };
}

function electronCpe23Locator(version) {
  return `cpe:2.3:a:electronjs:electron:${version}:*:*:*:*:*:*:*`;
}

function electronSourceInfo(inventory) {
  const runtime = inventory.desktopRuntime;
  return `Version verified from packaged ${runtime.packagedExecutable.sbomRelativePath} process.versions.electron; upstream binary ${runtime.binaryArtifact.fileName} is SHA-256 ${runtime.binaryArtifact.sha256}; npm audit root is ${runtime.purl}.`;
}

function resolvePackagedApplicationContext(sbom, inventory, { requireSha256 = true } = {}) {
  const rootPackages = sbom.packages.filter((entry) => entry.SPDXID?.startsWith("SPDXRef-DocumentRoot-"));
  assert.equal(rootPackages.length, 1, "release SBOM must contain exactly one SPDX document root package");
  const executablePath = normalizeSbomPath(inventory.desktopRuntime.packagedExecutable.sbomRelativePath);
  const executableFiles = sbom.files.filter((entry) => normalizeSbomPath(entry.fileName) === executablePath);
  assert.equal(executableFiles.length, 1, "release SBOM must contain the exact packaged Electron executable file");
  const executableFile = executableFiles[0];
  const executableSha256 = executableFile.checksums?.find((entry) => entry.algorithm === "SHA256")?.checksumValue?.toLowerCase();
  if (requireSha256 || executableSha256) {
    assert.equal(
      executableSha256,
      inventory.desktopRuntime.packagedExecutable.sha256,
      "release SBOM executable SHA-256 must match desktop runtime inventory"
    );
  }
  const applicationPackages = sbom.packages.filter((entry) =>
    entry.name === inventory.application.productName &&
    sbom.relationships.some((relationship) =>
      relationship.spdxElementId === entry.SPDXID &&
      relationship.relatedSpdxElement === executableFile.SPDXID &&
      relationship.relationshipType === "OTHER"
    )
  );
  assert.equal(applicationPackages.length, 1, "release SBOM must identify one packaged desktop application binary");
  return {
    rootPackage: rootPackages[0],
    applicationPackage: applicationPackages[0],
    executableFile
  };
}

function findElectronPackages(sbom) {
  return sbom.packages.filter((entry) =>
    entry.name?.toLowerCase() === "electron" ||
    packagePurls(entry).some((purl) => npmPurlName(purl) === "electron")
  );
}

function packagePurls(entry) {
  return (entry.externalRefs ?? [])
    .filter((reference) => reference.referenceType === "purl" && reference.referenceLocator?.startsWith("pkg:npm/"))
    .map((reference) => reference.referenceLocator);
}

function npmPurlName(purl) {
  if (!purl.startsWith("pkg:npm/")) return "";
  const value = purl.slice("pkg:npm/".length);
  const versionMarker = value.lastIndexOf("@");
  const encodedName = versionMarker >= 0 ? value.slice(0, versionMarker) : value;
  return decodeURIComponent(encodedName);
}

function assertRelationship(sbom, left, right, type, message) {
  assert.ok(
    sbom.relationships.some((entry) =>
      entry.spdxElementId === left &&
      entry.relatedSpdxElement === right &&
      entry.relationshipType === type
    ),
    message
  );
}

function validateSpdxDocument(sbom) {
  assertRecord(sbom, "release SBOM");
  assert.equal(sbom.spdxVersion, "SPDX-2.3", "release SBOM must be SPDX 2.3 JSON");
  assert.ok(Array.isArray(sbom.packages) && sbom.packages.length > 0, "release SBOM must contain packages");
  assert.ok(Array.isArray(sbom.files) && sbom.files.length > 0, "release SBOM must contain file evidence");
  assert.ok(Array.isArray(sbom.relationships), "release SBOM must contain relationships");
}

function normalizeSbomPath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertRecord(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}
