import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createDesktopRuntimeAuditInput } from './desktop-runtime-dependency-policy.mjs';
import { evaluateProductionAudit } from './production-audit-policy.mjs';

// Early advisory discovery only. The Release gate still binds the real installed
// executable, final Setup byte stream, runtime inventory and SBOM independently.
export function preflightRuntimeAudit({ rootPackage, rootLock, policy, runAudit }) {
  const input = createDesktopRuntimeAuditInput({ rootPackage, rootLock, policy });
  const result = runAudit(input);
  if (result.error) throw result.error;
  if (![0, 1].includes(result.status)) throw Error(`Runtime preflight audit failed before policy evaluation (exit ${result.status})`);
  let audit;
  try { audit = JSON.parse(result.stdout); } catch { throw Error('Runtime preflight audit returned invalid JSON'); }
  const evaluation = evaluateProductionAudit(audit, { schemaVersion: 1, exceptions: policy.exceptions });
  if (!evaluation.ok) throw Error(evaluation.errors.join('\n'));
  return { ok: true, runtimeRoots: input.inventory.roots.map(entry => `${entry.name}@${entry.version}`), vulnerabilities: evaluation.metadata };
}

async function main() {
  if (!process.env.npm_execpath) throw Error('Run through npm run desktop-runtime-lock-audit:check');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-runtime-audit-'));
  try {
    const result = preflightRuntimeAudit({ rootPackage: read('package.json'), rootLock: read('package-lock.json'), policy: read('security/desktop-runtime-audit.json'), runAudit(input) {
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(input.packageJson));
      fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify(input.packageLock));
      return spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--omit=dev', '--json'], { cwd: directory, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000, windowsHide: true });
    } });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('lyrics-runtime-audit-')) throw Error('Unexpected runtime preflight temporary directory');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
