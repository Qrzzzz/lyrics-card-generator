const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { readWorkflow, runs, commandStep, before, checkActions } = require('./workflow-test-helpers.cjs');
const policy = JSON.parse(readFileSync('security/release-source-policy.json', 'utf8'));

function validate(workflow) {
  assert.ok(workflow.on.push.branches.includes('main'));
  assert.ok(workflow.on.pull_request.branches.includes('main'));
  for (const check of policy.requiredChecks) {
    const jobs = Object.values(workflow.jobs).filter(job => job.name === check);
    assert.equal(jobs.length, 1, `${check} has one required result`);
    assert.ok(!jobs[0]['continue-on-error'], `${check} remains blocking`);
  }
  const jobs = workflow.jobs;
  for (const script of ['dependency-audit:gate', 'sbom:test', 'web-lite:check', 'font-license:test',
    'distribution-budgets:check', 'typecheck', 'lint', 'stability:test', 'coverage',
    'preferences-writer:coverage', 'electron-runtime:coverage', 'core:test']) {
    const step = commandStep(jobs.verify, `npm run ${script}`);
    assert.equal(step.if, undefined, `${script} is unconditional in verify`);
  }
  commandStep(jobs['render-boundary-regression'], 'npm run render-boundaries:test');
  commandStep(jobs['web-lite-smoke'], 'npm run web-lite:smoke');
  commandStep(jobs['web-lite-smoke'], 'npm run deferred-surfaces:test');
  before(jobs['web-lite-cross-browser-smoke'], 'npm run pages:prepare', 'npm run web-lite:cross-browser-smoke');
  before(jobs['desktop-build'], 'npm run desktop:pack', 'npm run desktop:packaged-assets-test');
  commandStep(jobs['desktop-groups'], 'npm run desktop:group:${{ matrix.group }}');
  assert.deepEqual(new Set(jobs['desktop-groups'].strategy.matrix.group), new Set(['editor', 'workspace', 'data', 'native']));
  const gate = jobs['desktop-packaged-regression'];
  assert.deepEqual(new Set(gate.needs), new Set(['desktop-legacy', 'desktop-build', 'desktop-groups']));
  commandStep(gate, 'node scripts/check-desktop-regression-gate.mjs');
  assert.match(gate.if, /always\(\)/, 'the gate resolves failures and skipped dependencies');
  const head = '${{ github.event.pull_request.head.sha || github.sha }}';
  assert.equal(workflow.env.DESKTOP_SOURCE_SHA, head);
  for (const job of Object.values(jobs)) {
    for (const step of job.steps || []) {
      if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with.ref, head);
    }
  }
  const attestation = jobs['desktop-build'].steps.find(step => step.uses?.startsWith('actions/attest-build-provenance@'));
  assert.equal(attestation.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  checkActions(workflow);
}

const workflow = readWorkflow('.github/workflows/ci.yml');
validate(workflow);
// Harmless presentation and scheduling changes must not break the contract.
const renamed = structuredClone(workflow);
for (const job of Object.values(renamed.jobs)) {
  job['timeout-minutes'] = 30;
  for (const step of job.steps || []) step.name = 'Display name may change';
}
validate(renamed);
for (const mutation of [
  w => { commandStep(w.jobs.verify, 'npm run core:test').run = '# npm run core:test\necho skipped'; },
  w => { commandStep(w.jobs.verify, 'npm run core:test').run = 'echo "npm run core:test"'; },
  w => { commandStep(w.jobs.verify, 'npm run core:test')['continue-on-error'] = true; },
  w => { commandStep(w.jobs.verify, 'npm run core:test').if = false; },
  w => { w.jobs['desktop-groups'].strategy.matrix.group.pop(); },
  w => { w.jobs['desktop-packaged-regression'].needs.pop(); }
]) {
  const invalid = structuredClone(workflow);
  mutation(invalid);
  assert.throws(() => validate(invalid), 'weakened executable gates must fail');
}
const pages = readWorkflow('.github/workflows/pages.yml');
commandStep(pages.jobs.deploy, 'npm run web-lite:check');
checkActions(pages);
const benchmark = readWorkflow('.github/workflows/background-composition-benchmark.yml');
assert.ok(benchmark.on.workflow_dispatch !== undefined);
assert.equal(benchmark.on.push, undefined);
assert.equal(benchmark.on.pull_request, undefined);
assert.ok(!Object.values(workflow.jobs).some(job => job.steps?.some(step => runs(step, 'npm run background-composition:benchmark'))));
console.log('Executable CI workflow contracts passed');
