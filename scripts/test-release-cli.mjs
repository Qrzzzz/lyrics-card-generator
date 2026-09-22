import assert from 'node:assert/strict';
import { parseArgs, assertRun, assertAssets, publishRelease } from './release-cli.mjs';
import { releaseSourcePolicy as policy } from './verify-release-source.mjs';

const sha = 'a'.repeat(40);
const state = () => ({ repository: 'owner/repo', tag: 'v1.2.3', packageVersion: '1.2.3', sourceSha: sha, branch: 'release/1.2.3' });
const run = workflow => ({ id: workflow === 'ci.yml' ? 10 : 20, head_sha: sha, head_branch: 'v1.2.3', event: 'push', path: `.github/workflows/${workflow}`, status: 'completed', conclusion: 'success', run_attempt: 1 });
const release = () => ({ id: 30, tag_name: 'v1.2.3', draft: false, prerelease: false, html_url: 'https://example.test/release', assets: ['Lyrics.Card.Generator.Setup.1.2.3.exe', 'SHA256SUMS', 'lyrics-card-generator-1.2.3.spdx.json', 'latest.yml'].map(name => ({ name, state: 'uploaded', size: 100, digest: `sha256:${sha}${'b'.repeat(24)}` })) });
function host({ failedCi = false, movedPr = false, conflictingTag = false, pending = false } = {}) {
  const commands = [];
  let merged = false;
  let pushed = false;
  let checks = 0;
  const pr = () => ({ number: 1, state: 'open', head: { sha: movedPr ? 'b'.repeat(40) : sha, repo: { full_name: 'owner/repo' } }, base: { ref: 'main' }, merged_at: merged ? 'today' : null, merge_commit_sha: merged ? sha : null });
  return {
    commands, save() {}, report() {},
    command(exe, args) {
      commands.push([exe, ...args]);
      if (args[0] === 'merge' || args[1] === 'merge') merged = true;
      if (args[0] === 'ls-remote') return conflictingTag ? `${'b'.repeat(40)} refs/tags/v1.2.3` : pushed ? `${sha} refs/tags/v1.2.3^{}` : '';
      if (args[0] === 'push' && args[2]?.startsWith('refs/tags/')) pushed = true;
      return '';
    },
    json() { checks++; return policy.requiredChecks.map(name => ({ name, bucket: pending && checks === 1 ? 'pending' : 'pass' })); },
    async api(path) {
      if (path.includes('/pulls?')) return [pr()];
      if (path.endsWith('/pulls/1')) return pr();
      if (path.includes('/ci.yml/')) return { workflow_runs: [{ ...run('ci.yml'), conclusion: failedCi ? 'failure' : 'success' }] };
      if (path.includes('/release.yml/')) return { workflow_runs: [run('release.yml')] };
      if (path.endsWith('/releases/30')) return release();
      throw Error(`Unexpected API: ${path}`);
    },
    async wait(label, probe) { for (let i = 0; i < 3; i++) { const result = await probe(); if (result) return result; } throw Error(`timeout: ${label}`); },
    async authorize() { return { authorized: true }; },
    async resolve() { return { state: 'published', release: { id: 30 } }; }
  };
}
assert.equal(parseArgs(['--version', '1.2.3']).mode, 'check');
for (const version of ['../bad', 'v1.2.3', '1.2.3;echo', '1.2.3-rc.x']) assert.throws(() => parseArgs(['--version', version]));
assert.throws(() => assertRun(run('ci.yml'), 'b'.repeat(40), 'ci.yml'));
assert.throws(() => assertRun({ ...run('ci.yml'), event: 'pull_request' }, sha, 'ci.yml', 'push'));
assert.throws(() => assertAssets({ ...release(), assets: release().assets.slice(1) }, '1.2.3'));
assert.throws(() => assertAssets({ ...release(), draft: true }, '1.2.3'));
const h = host({ pending: true });
const s = state();
await publishRelease(h, s);
assert.equal(s.status, 'complete');
assert.equal(s.releaseId, 30);
assert.equal(h.commands.filter(c => c.includes('--squash')).length, 1);
assert.equal(h.commands.filter(c => c[1] === 'push').length, 1);
await publishRelease(h, s);
assert.equal(h.commands.filter(c => c.includes('--squash')).length, 1, 'resume must not merge again');
assert.equal(h.commands.filter(c => c[1] === 'push').length, 1, 'resume must not push tag again');
for (const options of [{ failedCi: true }, { movedPr: true }, { conflictingTag: true }]) {
  const failing = host(options);
  const saved = state();
  if (options.movedPr) saved.pr = 1;
  await assert.rejects(publishRelease(failing, saved));
  assert.equal(failing.commands.some(c => c[1] === 'push' && c.some(a => a.startsWith('refs/tags/'))), false);
}
const missing = host();
const originalApi = missing.api;
missing.api = path => path.includes('/release.yml/') ? { workflow_runs: [] } : originalApi(path);
await assert.rejects(publishRelease(missing, state()), /timeout/);
assert.equal(missing.commands.some(c => c.includes('workflow')), false, 'missing run must not trigger duplicate dispatch');
// New PR creation, followed by interruption immediately after the remote
// mutation: retry must discover the PR instead of creating another one.
const interrupted = host();
const apiBefore = interrupted.api;
const commandBefore = interrupted.command;
let created = false;
let crash = true;
interrupted.api = path => path.includes('/pulls?') && !created ? [] : apiBefore(path);
interrupted.command = (exe, argv) => {
  const result = commandBefore(exe, argv);
  if (exe === 'gh' && argv[0] === 'pr' && argv[1] === 'create') {
    created = true;
    if (crash) { crash = false; throw Error('simulated disconnection after PR creation'); }
  }
  return result;
};
const recovery = state();
await assert.rejects(publishRelease(interrupted, recovery), /simulated disconnection/);
await publishRelease(interrupted, recovery);
assert.equal(interrupted.commands.filter(c => c[0] === 'gh' && c[2] === 'create').length, 1);
assert.equal(recovery.status, 'complete');
const badDigest = release();
badDigest.assets[0].digest = null;
assert.throws(() => assertAssets(badDigest, '1.2.3'));
console.log('Release CLI: success, pending, resume, exact SHA, failed CI, changed PR, conflicting tag and missing-run checks passed.');
