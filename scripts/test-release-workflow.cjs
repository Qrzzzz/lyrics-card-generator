const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { readWorkflow, commandStep, before, checkActions } = require('./workflow-test-helpers.cjs');

function validate(workflow) {
  assert.deepEqual(workflow.permissions, {}, 'jobs opt into their own permissions');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.ok(workflow.on.push.tags.includes('v*.*.*'));
  const { authorize, build, publish } = workflow.jobs;
  assert.equal(authorize.permissions.contents, 'read');
  assert.equal(build.permissions.contents, 'read');
  assert.equal(publish.permissions.contents, 'write');
  assert.ok(Object.values(authorize.permissions).every(permission => permission === 'read'),
    'source authorization has read-only permissions');
  for (const [permission, access] of Object.entries(build.permissions)) {
    assert.ok(access !== 'write' || ['attestations', 'id-token'].includes(permission),
      'artifact construction can write provenance, not repository state');
  }
  assert.equal(build.needs, 'authorize');
  assert.deepEqual(new Set(publish.needs), new Set(['authorize', 'build']));
  for (const job of [authorize, build, publish]) {
    assert.ok(!job['continue-on-error']);
    const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with['persist-credentials'], false);
    assert.equal(checkout.with.ref, 'refs/tags/${{ env.RELEASE_TAG }}');
  }
  before(authorize, 'node ./scripts/verify-release-source.mjs', 'node ./scripts/resolve-github-release.mjs');
  assert.equal(build.env.EXPECTED_RELEASE_SHA, '${{ needs.authorize.outputs.release_sha }}');
  commandStep(build, 'npm run dependency-audit:check');
  commandStep(build, 'npm run desktop-runtime-lock-audit:check');
  commandStep(build, 'npm run desktop:build');
  commandStep(build, 'npm run desktop:build-from-main');
  before(build, 'npm run desktop:packaged-assets-test', 'npm run desktop:final-artifact-smoke');
  before(build, 'npm run desktop:final-artifact-smoke', 'npm run desktop:updater-install-test');
  before(build, 'npm run desktop-runtime-audit:prepare', 'npm run desktop-runtime-audit:check');
  before(build, 'npm run desktop-runtime-audit:check', 'npm run sbom:prepare');
  before(build, 'npm run sbom:finalize', 'npm run sbom:inspect');
  const provenance = build.steps.find(step => step.uses?.startsWith('actions/attest-build-provenance@'));
  assert.ok(provenance && build.steps.indexOf(provenance) > build.steps.indexOf(commandStep(build, 'npm run sbom:inspect')));
  const upload = build.steps.find(step => step.uses?.startsWith('actions/upload-artifact@') && step.with.name.includes('-tested'));
  const download = publish.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.ok(upload && download);
  assert.equal(upload.with.name, download.with.name, 'publication consumes the tested bundle');
  assert.ok(upload.with.name.includes('needs.authorize.outputs.release_sha'));
  const sourceChecks = publish.steps.filter(step => (step.run || '').split(/\r?\n/).some(line => line.trim().startsWith('node ./scripts/verify-release-source.mjs')));
  const draft = publish.steps.find(step => step.run?.includes('& gh release create '));
  const verification = commandStep(publish, './scripts/verify-github-release.ps1');
  const publication = commandStep(publish, '$published = gh api --method PATCH');
  assert.ok(draft && sourceChecks.length >= 2);
  const index = step => publish.steps.indexOf(step);
  assert.ok(index(sourceChecks[0]) < index(draft) && index(draft) < index(verification));
  assert.ok(index(verification) < index(sourceChecks.at(-1)) && index(sourceChecks.at(-1)) < index(publication));
  assert.match(draft.run, /--draft\b/);
  assert.match(draft.run, /--verify-tag\b/);
  assert.match(verification.run, /-ExpectedState draft/);
  assert.match(verification.run, /-ExpectedAssetDirectory release/);
  for (const job of [authorize, build, publish]) {
    for (const step of job.steps) assert.ok(!step['continue-on-error'], 'release failures remain blocking');
  }
  checkActions(workflow);
}
const workflow = readWorkflow('.github/workflows/release.yml');
validate(workflow);
const renamed = structuredClone(workflow);
for (const job of Object.values(renamed.jobs)) for (const step of job.steps || []) step.name = 'Display name may change';
validate(renamed);
for (const mutation of [
  w => { w.jobs.build.permissions.contents = 'write'; },
  w => { w.jobs.authorize.permissions.actions = 'write'; },
  w => { w.jobs.publish.needs = ['authorize']; },
  w => { commandStep(w.jobs.build, 'npm run desktop:final-artifact-smoke').run = '# npm run desktop:final-artifact-smoke\necho skipped'; },
  w => { commandStep(w.jobs.publish, './scripts/verify-github-release.ps1')['continue-on-error'] = true; },
  w => { const steps = w.jobs.publish.steps; const step = commandStep(w.jobs.publish, './scripts/verify-github-release.ps1'); steps.splice(steps.indexOf(step), 1); steps.push(step); }
]) {
  const invalid = structuredClone(workflow); mutation(invalid);
  assert.throws(() => validate(invalid), 'unsafe publication contract must fail');
}
assert.deepEqual(readdirSync('.github/workflows').filter(name => /^release-\d+\.\d+\.\d+\.yml$/.test(name)), []);
console.log('Executable release workflow contracts passed');
