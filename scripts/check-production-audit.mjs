import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { evaluateProductionAudit } from "./production-audit-policy.mjs";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Run the production audit through npm run dependency-audit:check.");
}
const auditResult = spawnSync(process.execPath, [npmCli, "audit", "--omit=dev", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  windowsHide: true
});

if (auditResult.error) {
  throw auditResult.error;
}
if (![0, 1].includes(auditResult.status)) {
  process.stderr.write(auditResult.stderr || "");
  throw new Error(`npm audit failed before policy evaluation (exit ${auditResult.status}).`);
}

let audit;
try {
  audit = JSON.parse(auditResult.stdout);
} catch (error) {
  process.stderr.write(auditResult.stderr || "");
  throw new Error(`npm audit did not return valid JSON: ${error.message}`);
}

const policy = JSON.parse(readFileSync("security/npm-audit-exceptions.json", "utf8"));
const evaluation = evaluateProductionAudit(audit, policy);
if (!evaluation.ok) {
  for (const error of evaluation.errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  const counts = evaluation.metadata ?? {};
  console.log(
    `Production audit policy passed: ${counts.critical ?? 0} critical, ` +
    `${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low package finding(s).`
  );
  for (const exception of evaluation.exceptions) {
    console.log(
      `Approved until ${exception.expires}: ${exception.advisory} ` +
      `(${exception.package} ${exception.affectedRange}, ${exception.severity}).`
    );
  }
}
