import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { enrichReleaseSbom, inspectReleaseSbom } from "./release-sbom-policy.mjs";

const fixture = JSON.parse(await readFile("scripts/fixtures/release-sbom/cases.json", "utf8"));
const bundle = materialize(fixture);
const enriched = enrichReleaseSbom(bundle);
const summary = inspectReleaseSbom({ ...bundle, sbom: enriched });
assert.equal(summary.electron, "42.9.3");
assert.deepEqual(summary.productionRuntime, { next: "15.5.24", sharp: "0.35.4" });
assert.deepEqual(summary.relationships, {
  rootContainsElectron: true,
  applicationDependsOnElectron: true,
  executableEvidence: true
});
const enrichedWithAdditionalLegalReference = structuredClone(enriched);
enrichedWithAdditionalLegalReference.packages
  .find((entry) => entry.name === "electron")
  .externalRefs.push(structuredClone(fixture.additionalLegalElectronReference));
assert.doesNotThrow(
  () => inspectReleaseSbom({ ...bundle, sbom: enrichedWithAdditionalLegalReference }),
  "a legal non-CPE Electron external reference must not be rejected"
);

for (const invalidCase of fixture.invalidCases) {
  const invalid = { ...bundle, sbom: structuredClone(enriched), inventory: structuredClone(bundle.inventory) };
  applyMutation(invalidCase.mutation, invalid);
  assert.throws(
    () => inspectReleaseSbom(invalid),
    new RegExp(invalidCase.expected, "u"),
    `${invalidCase.name} must fail closed`
  );
}

console.log("Release SPDX Electron inventory policy tests passed");

function materialize(source) {
  const auditPackageText = `${JSON.stringify(source.auditPackage, null, 2)}\n`;
  const auditLockText = `${JSON.stringify(source.auditLock, null, 2)}\n`;
  const auditReportText = `${JSON.stringify(source.auditReport, null, 2)}\n`;
  const inventory = structuredClone(source.inventory);
  inventory.auditInput.packageJsonSha256 = sha256(auditPackageText);
  inventory.auditInput.packageLockSha256 = sha256(auditLockText);
  inventory.auditResult.reportSha256 = sha256(auditReportText);
  return {
    sbom: structuredClone(source.baseSbom),
    inventory,
    auditPackageText,
    auditLockText,
    auditReportText
  };
}

function applyMutation(mutation, bundle) {
  const electron = () => bundle.sbom.packages.find((entry) => entry.name === "electron");
  const electronCpe = () => electron().externalRefs.find((entry) => entry.referenceType === "cpe23Type");
  if (mutation === "missing-electron") {
    bundle.sbom.packages = bundle.sbom.packages.filter((entry) => entry.name !== "electron");
    return;
  }
  if (mutation === "wrong-electron-version") {
    electron().versionInfo = "42.9.2";
    return;
  }
  if (mutation === "broken-relationship") {
    bundle.sbom.relationships = bundle.sbom.relationships.filter((entry) => !(
      entry.relationshipType === "DEPENDS_ON" && entry.relatedSpdxElement === electron().SPDXID
    ));
    return;
  }
  if (mutation === "noassertion-component") {
    electron().downloadLocation = "NOASSERTION";
    electron().licenseDeclared = "NOASSERTION";
    electron().sourceInfo = "NOASSERTION";
    return;
  }
  if (mutation === "missing-electron-cpe") {
    electron().externalRefs = electron().externalRefs.filter((entry) => entry.referenceType !== "cpe23Type");
    return;
  }
  if (mutation === "duplicate-electron-cpe") {
    electron().externalRefs.push(structuredClone(electronCpe()));
    return;
  }
  if (mutation === "extra-electron-cpe") {
    electron().externalRefs.push({
      referenceCategory: "SECURITY",
      referenceType: "cpe23Type",
      referenceLocator: "cpe:2.3:a:forged:runtime:42.9.3:*:*:*:*:*:*:*"
    });
    return;
  }
  if (mutation === "noassertion-electron-cpe") {
    electronCpe().referenceLocator = "NOASSERTION";
    return;
  }
  if (mutation === "wrong-electron-cpe-category") {
    electronCpe().referenceCategory = "OTHER";
    return;
  }
  if (mutation === "wrong-electron-cpe-type") {
    electronCpe().referenceType = "purl";
    return;
  }
  if (mutation === "forged-electron-cpe-vendor") {
    electronCpe().referenceLocator = electronCpe().referenceLocator.replace(":electronjs:", ":forged:");
    return;
  }
  if (mutation === "forged-electron-cpe-product") {
    electronCpe().referenceLocator = electronCpe().referenceLocator.replace(":electron:", ":not-electron:");
    return;
  }
  if (mutation === "wrong-electron-cpe-version") {
    electronCpe().referenceLocator = electronCpe().referenceLocator.replace(":42.9.3:", ":42.9.2:");
    return;
  }
  if (mutation === "desktop-inventory-mismatch") {
    const runtime = bundle.inventory.desktopRuntime;
    runtime.version = "42.9.2";
    runtime.purl = "pkg:npm/electron@42.9.2";
    runtime.installedPackageVersion = "42.9.2";
    runtime.electronDistVersion = "42.9.2";
    runtime.stagedManifestVersion = "42.9.2";
    runtime.binaryArtifact.fileName = "electron-v42.9.2-win32-x64.zip";
    runtime.binaryArtifact.downloadLocation = "https://github.com/electron/electron/releases/download/v42.9.2/electron-v42.9.2-win32-x64.zip";
    runtime.packagedExecutable.reportedElectronVersion = "42.9.2";
    for (const artifact of runtime.finalArtifacts) artifact.reportedElectronVersion = "42.9.2";
    return;
  }
  if (mutation === "unexpected-portable-artifact") {
    bundle.inventory.desktopRuntime.finalArtifacts.push({
      fileName: "Lyrics.Card.Generator-6.2.2-portable.exe",
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      smokeLabel: "portable",
      reportedElectronVersion: "42.9.3",
      versionEvidence: "renderer-user-agent"
    });
    return;
  }
  if (mutation === "wrong-production-version") {
    const sharp = bundle.sbom.packages.find((entry) => entry.name === "sharp");
    sharp.versionInfo = "0.35.3";
    sharp.externalRefs[0].referenceLocator = "pkg:npm/sharp@0.35.3";
    return;
  }
  throw new Error(`Unknown fixture mutation ${mutation}`);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
