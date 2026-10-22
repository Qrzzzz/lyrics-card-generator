import assert from 'node:assert/strict';
import { parseArgs, assertRun, assertAssets, publishRelease, probeCi, inspectJobs, createWaiter, createBoundedFetch } from './release-cli.mjs';
import { releaseSourcePolicy as policy } from './verify-release-source.mjs';

const sha = 'a'.repeat(40);
const state = () => ({ repository: 'owner/repo', tag: 'v1.2.3', packageVersion: '1.2.3', sourceSha: sha, branch: 'release/1.2.3' });
const run = workflow => ({ id: workflow === 'ci.yml' ? 10 : 20, head_sha: sha, head_branch: workflow === 'ci.yml' ? 'main' : 'v1.2.3', event: 'push', path: `.github/workflows/${workflow}`, status: 'completed', conclusion: 'success', run_attempt: 1, html_url: 'https://example.test/run' });
const jobs = () => policy.requiredChecks.map(name => ({ name, head_sha: sha, run_attempt: 1, status: 'completed', conclusion: 'success' }));
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
      if (path.includes('/ci.yml/')) { checks++; return { workflow_runs: [{ ...run('ci.yml'), event: path.includes('event=pull_request') ? 'pull_request' : 'push', pull_requests: [{ number: 1 }], status: pending && checks === 1 ? 'in_progress' : 'completed', conclusion: failedCi ? 'failure' : 'success' }] }; }
      if (path.includes('/attempts/1/jobs')) return { jobs: jobs() };
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

const identity = run('ci.yml');
for (const conclusion of ['failure', 'cancelled', 'skipped', 'neutral']) {
  const invalid = jobs(); invalid[0].conclusion = conclusion;
  assert.throws(() => inspectJobs(invalid, identity, sha, policy.requiredChecks));
}
for (const patch of [{head_sha:'b'.repeat(40)}, {run_attempt:2}]) {
  const invalid=jobs(); Object.assign(invalid[0],patch);
  assert.throws(() => inspectJobs(invalid,identity,sha,policy.requiredChecks), /SHA\/attempt/);
}
assert.throws(() => inspectJobs(jobs().slice(1),identity,sha,policy.requiredChecks), /Missing/);
assert.throws(() => inspectJobs([...jobs(),jobs()[0]],identity,sha,policy.requiredChecks), /Ambiguous/);
assert.throws(() => inspectJobs([{name:'desktop',status:'completed',conclusion:'failure',steps:[{name:'Native clipboard',conclusion:'failure'}]}],identity,sha), /Native clipboard/);
let fakeTime=0;
const registrationHost=host();
registrationHost.now=()=>fakeTime;
const registrationApi=registrationHost.api;
let registrationCalls=0;
registrationHost.api=path=>path.includes('/ci.yml/') && registrationCalls++ === 0 ? {workflow_runs:[]} : registrationApi(path);
const registeredState={...state(),pr:1};
assert.equal(await probeCi(registrationHost,registeredState,'pull_request',{started:0}),false);
assert.equal((await probeCi(registrationHost,registeredState,'pull_request',{started:0})).id,10);
registrationHost.api=path=>path.includes('/ci.yml/') ? {workflow_runs:[]} : registrationApi(path);
fakeTime=600000;
await assert.rejects(probeCi(registrationHost,registeredState,'pull_request',{started:0}),/not registered/);
for (const message of ['authentication 401','permission 403','network timeout','Invalid GitHub workflow runs response']) {
  registrationHost.api=async path=>{ if(path.includes('/ci.yml/')) throw Error(message); return registrationApi(path); };
  await assert.rejects(probeCi(registrationHost,registeredState,'pull_request',{started:fakeTime}),new RegExp(message));
}
registrationHost.api=path=>path.includes('/ci.yml/') ? {} : registrationApi(path);
await assert.rejects(probeCi(registrationHost,registeredState,'pull_request',{started:fakeTime}),/Invalid GitHub/);
registrationHost.api=path=>path.includes('/ci.yml/') ? {workflow_runs:[{}]} : registrationApi(path);
await assert.rejects(probeCi(registrationHost,registeredState,'pull_request',{started:fakeTime}),/Invalid GitHub workflow run record/);
const oldHead=host(); const oldHeadApi=oldHead.api;
oldHead.api=async path=>path.includes('/ci.yml/') ? {workflow_runs:[{...identity,head_sha:'b'.repeat(40),event:'pull_request',pull_requests:[{number:1}]}]} : oldHeadApi(path);
assert.equal(await probeCi(oldHead,registeredState,'pull_request',{started:Date.now()}),false,'old head never authorizes');
const latestFailure=host(); const latestApi=latestFailure.api;
latestFailure.api=async path=>path.includes('/ci.yml/') ? {workflow_runs:[{...identity,id:11,event:'pull_request',pull_requests:[{number:1}],conclusion:'failure'}, {...identity,event:'pull_request',pull_requests:[{number:1}]}]} : latestApi(path);
await assert.rejects(probeCi(latestFailure,registeredState,'pull_request',{started:Date.now()}),/Workflow failed/,'older success never masks the newest failure');
registrationHost.api=async path=>path.includes('/attempts/') ? {jobs:[]} : path.includes('/ci.yml/') ? {workflow_runs:[{...identity,status:'in_progress',event:'pull_request',pull_requests:[{number:1}]}]} : registrationApi(path);
await assert.rejects(probeCi(registrationHost,registeredState,'pull_request',{started:0}),/not registered/);
const oldState={schema:1}; const progress=[];
fakeTime=0; let attempts=0;
const waiter=createWaiter({state:oldState,save(){},report:value=>progress.push(value),now:()=>fakeTime,sleep:async ms=>{fakeTime+=ms;},timeoutMinutes:2});
await waiter.wait('registered',async()=>++attempts===2);
assert.equal(oldState.phaseHistory[0].elapsedMs,60000);
assert.equal(oldState.phaseHistory[0].outcome,'success');
await assert.rejects(waiter.wait('missing',async()=>false),/Timed out/);
assert.equal(oldState.phaseHistory[1].outcome,'failed');
assert.ok(progress.some(line=>line.includes('total=120s')));
const keepAlive=setTimeout(()=>{},100);
try {
  await assert.rejects(createBoundedFetch((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),5)('https://example.test'),/timeout/i);
} finally {clearTimeout(keepAlive);}
console.log('Release CLI: delayed registration/deadline, API errors, malformed evidence, missing/skipped/failed checks, exact attempts and additive timing state passed.');
