import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDesktopRuntimeAuditInput } from "./desktop-runtime-dependency-policy.mjs";
import { evaluateProductionAudit } from "./production-audit-policy.mjs";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run the desktop runtime audit through npm run desktop-runtime-audit:check.");

const projectRoot = process.cwd();
const auditDirectory = path.join(projectRoot, "dist-desktop", "desktop-runtime-audit");
const packagePath = path.join(auditDirectory, "package.json");
const lockPath = path.join(auditDirectory, "package-lock.json");
const inventoryPath = path.join(auditDirectory, "runtime-inventory.json");
const reportPath = path.join(auditDirectory, "npm-audit.json");
const rootPackage = readJson(path.join(projectRoot, "package.json"));
const rootLock = readJson(path.join(projectRoot, "package-lock.json"));
const policy = readJson(path.join(projectRoot, "security", "desktop-runtime-audit.json"));
const expected = createDesktopRuntimeAuditInput({ rootPackage, rootLock, policy });
assert.deepEqual(readJson(packagePath), expected.packageJson, "prepared desktop audit package.json drifted from the authoritative lock");
assert.deepEqual(readJson(lockPath), expected.packageLock, "prepared desktop audit package-lock.json drifted from the authoritative lock");

const auditResult = spawnSync(process.execPath, [npmCli, "audit", "--omit=dev", "--json"], {
  cwd: auditDirectory,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  windowsHide: true
});
if (auditResult.error) throw auditResult.error;
if (![0, 1].includes(auditResult.status)) {
  process.stderr.write(auditResult.stderr || "");
  throw new Error(`desktop runtime npm audit failed before policy evaluation (exit ${auditResult.status})`);
}

let audit;
try {
  audit = JSON.parse(auditResult.stdout);
} catch (error) {
  process.stderr.write(auditResult.stderr || "");
  throw new Error(`desktop runtime npm audit did not return valid JSON: ${error.message}`);
}
const evaluation = evaluateProductionAudit(audit, { schemaVersion: 1, exceptions: policy.exceptions });
if (!evaluation.ok) {
  for (const error of evaluation.errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  const reportText = `${JSON.stringify(audit, null, 2)}\n`;
  writeFileSync(reportPath, reportText);
  const inventory = readJson(inventoryPath);
  inventory.auditResult = {
    reportSha256: sha256(Buffer.from(reportText)),
    vulnerabilityCounts: audit.metadata.vulnerabilities,
    dependencyCounts: audit.metadata.dependencies ?? null
  };
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  const counts = evaluation.metadata ?? {};
  console.log(JSON.stringify({
    ok: true,
    runtimeRoots: expected.inventory.roots.map((entry) => `${entry.name}@${entry.version}`),
    closurePackages: expected.inventory.closure.length,
    vulnerabilities: counts,
    dependencyCounts: audit.metadata.dependencies ?? null
  }, null, 2));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
