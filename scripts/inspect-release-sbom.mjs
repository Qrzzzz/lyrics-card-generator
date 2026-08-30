import { readFileSync } from "node:fs";
import path from "node:path";
import { inspectReleaseSbom } from "./release-sbom-policy.mjs";

const sbomPath = process.argv[2];
if (!sbomPath) throw new Error("Usage: npm run sbom:inspect -- <release SPDX JSON path>");
const auditDirectory = path.join("dist-desktop", "desktop-runtime-audit");
const inventoryPath = process.argv[3] ?? path.join(auditDirectory, "runtime-inventory.json");
const auditPackagePath = process.argv[4] ?? path.join(auditDirectory, "package.json");
const auditLockPath = process.argv[5] ?? path.join(auditDirectory, "package-lock.json");
const auditReportPath = process.argv[6] ?? path.join(auditDirectory, "npm-audit.json");

const summary = inspectReleaseSbom({
  sbom: JSON.parse(readFileSync(sbomPath, "utf8")),
  inventory: JSON.parse(readFileSync(inventoryPath, "utf8")),
  auditPackageText: readFileSync(auditPackagePath, "utf8"),
  auditLockText: readFileSync(auditLockPath, "utf8"),
  auditReportText: readFileSync(auditReportPath, "utf8"),
  productionAuditPolicy: JSON.parse(readFileSync("security/npm-audit-exceptions.json", "utf8"))
});
console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
