import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { enrichReleaseSbom } from "./release-sbom-policy.mjs";

const sbomPath = process.argv[2];
if (!sbomPath) throw new Error("Usage: npm run sbom:finalize -- <release SPDX JSON path>");
const auditDirectory = path.join("dist-desktop", "desktop-runtime-audit");
const inventoryPath = process.argv[3] ?? path.join(auditDirectory, "runtime-inventory.json");
const auditPackagePath = process.argv[4] ?? path.join(auditDirectory, "package.json");
const auditLockPath = process.argv[5] ?? path.join(auditDirectory, "package-lock.json");
const auditReportPath = process.argv[6] ?? path.join(auditDirectory, "npm-audit.json");
const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const enriched = enrichReleaseSbom({
  sbom,
  inventory,
  auditPackageText: readFileSync(auditPackagePath, "utf8"),
  auditLockText: readFileSync(auditLockPath, "utf8"),
  auditReportText: readFileSync(auditReportPath, "utf8")
});
writeFileSync(sbomPath, `${JSON.stringify(enriched, null, 2)}\n`);
console.log(`Bound Electron ${inventory.desktopRuntime.version} inventory and executable evidence into ${sbomPath}`);
