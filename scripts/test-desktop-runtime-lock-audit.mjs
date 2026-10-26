import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preflightRuntimeAudit } from './check-desktop-runtime-lock-audit.mjs';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const inputs = { rootPackage: read('package.json'), rootLock: read('package-lock.json'), policy: read('security/desktop-runtime-audit.json') };
const clean = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };
const checked = preflightRuntimeAudit({ ...inputs, runAudit(input) {
  assert.equal(input.packageJson.dependencies.electron, inputs.rootPackage.devDependencies.electron, 'the packaged runtime is audited as production even though the repository declares it under devDependencies');
  assert.equal(input.packageLock.packages['node_modules/electron'].dev, undefined);
  return { status: 0, stdout: JSON.stringify(clean) };
} });
assert.equal(checked.ok, true);
const advisory = { ...clean, vulnerabilities: { electron: { severity: 'high', via: [{ source: 1243069, name: 'electron', dependency: 'electron', severity: 'high', range: '<42.11.16', url: 'https://github.com/advisories/GHSA-jr5w-w6x2-84p9' }] } }, metadata: { vulnerabilities: { high: 1, total: 1 } } };
assert.throws(() => preflightRuntimeAudit({ ...inputs, runAudit: () => ({ status: 1, stdout: JSON.stringify(advisory) }) }), /GHSA-jr5w-w6x2-84p9/);
for (const result of [{ status: 2, stdout: '{}' }, { status: 0, stdout: 'broken' }, { status: null, error: Error('network timeout') }]) assert.throws(() => preflightRuntimeAudit({ ...inputs, runAudit: () => result }));
assert.throws(() => preflightRuntimeAudit({ ...inputs, policy: { ...inputs.policy, exceptions: [{}] }, runAudit() { assert.fail('invalid policy must fail before network'); } }), /exceptions/);
console.log('Runtime lock preflight: actual Electron closure, high advisory, malformed/network failures and empty-exception policy passed.');
