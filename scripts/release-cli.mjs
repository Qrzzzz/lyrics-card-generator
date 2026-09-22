#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authorizeReleaseSource, createGitHubClient, releaseSourcePolicy as policy } from './verify-release-source.mjs';
import { resolveGitHubRelease, createReleaseStateClient } from './resolve-github-release.mjs';

export function parseArgs(argv) {
  const result = { mode: 'check', timeout: '90' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2);
    if (!argv[i]?.startsWith('--') || !['version', 'mode', 'timeout'].includes(key) || !argv[i + 1]) throw Error('Invalid arguments');
    result[key] = argv[i + 1];
  }
  if (!/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(result.version || '')) throw Error('Version must be X.Y.Z or X.Y.Z-rc.N (without v)');
  if (!['check', 'publish', 'resume'].includes(result.mode)) throw Error('Invalid mode');
  if (!/^\d+$/.test(result.timeout) || +result.timeout < 1 || +result.timeout > 240) throw Error('Timeout must be 1..240 minutes');
  return result;
}

export function assertRun(run, sha, workflow, event) {
  if (run.head_sha !== sha || run.path?.split('@')[0] !== `.github/workflows/${workflow}` || (event && run.event !== event)) throw Error('Workflow evidence does not match exact commit/workflow/event');
  if (run.status !== 'completed') return false;
  if (run.conclusion !== 'success') throw Error(`Workflow failed: ${run.html_url}; inspect this run, then explicitly rerun it before Resume`);
  return true;
}

export function assertAssets(release, version) {
  const names = [`Lyrics.Card.Generator.Setup.${version}.exe`, 'SHA256SUMS', `lyrics-card-generator-${version}.spdx.json`, 'latest.yml'];
  if (release.draft || release.assets?.length !== names.length) throw Error('Release is not public or asset count differs');
  for (const name of names) {
    const matches = release.assets.filter(a => a.name === name);
    if (matches.length !== 1 || matches[0].state !== 'uploaded' || matches[0].size <= 0 || !/^sha256:[a-f0-9]{64}$/.test(matches[0].digest || '')) throw Error(`Invalid asset metadata: ${name}`);
  }
}

// All remote mutations go through this orchestration function. Tests inject a
// fake host; the production host below never invokes a shell with interpolated text.
export async function publishRelease(h, state) {
  const { repository, tag, sourceSha, branch } = state;
  const base = `repos/${repository}`;
  const save = patch => { Object.assign(state, patch); h.save(state); };
  if (!state.releaseSha) {
    if (branch === policy.baseBranch) {
      const prs = await h.api(`${base}/commits/${sourceSha}/pulls`);
      const merged = prs.filter(p => p.merged_at && p.base.ref === policy.baseBranch && p.merge_commit_sha === sourceSha);
      if (merged.length !== 1) throw Error('main HEAD must belong to exactly one merged PR; prepare changes on a release branch');
      save({ pr: merged[0].number, releaseSha: sourceSha });
    } else {
      let pr;
      if (state.pr) pr = await h.api(`${base}/pulls/${state.pr}`);
      else {
        const prs = await h.api(`${base}/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0] + ':' + branch)}&base=${policy.baseBranch}&per_page=100`);
        const matching = prs.filter(p => p.head.sha === sourceSha && (p.state === 'open' || p.merged_at));
        if (matching.length > 1) throw Error('Ambiguous release PR');
        pr = matching[0];
        if (!pr) {
          h.command('git', ['push', 'origin', `HEAD:refs/heads/${branch}`]);
          h.command('gh', ['pr', 'create', '--repo', repository, '--base', policy.baseBranch, '--head', branch, '--title', `Release ${tag}`, '--body-file', `docs/releases/v${state.packageVersion}.zh-CN.md`]);
          const created = await h.api(`${base}/pulls?state=open&head=${encodeURIComponent(repository.split('/')[0] + ':' + branch)}&base=${policy.baseBranch}`);
          if (created.length !== 1) throw Error('Cannot resolve created PR; Resume will rediscover it');
          pr = created[0];
        }
        save({ pr: pr.number });
      }
      if (pr.head.sha !== sourceSha || pr.base.ref !== policy.baseBranch || pr.head.repo?.full_name !== repository) throw Error('PR source changed; refusing merge');
      if (!pr.merged_at) {
        if (pr.state !== 'open' || pr.draft) throw Error('PR must be open and ready for review');
        await h.wait('PR checks', async () => {
          const checks = h.json('gh', ['pr', 'checks', String(state.pr), '--repo', repository, '--json', 'name,bucket']);
          if (checks.some(c => ['fail', 'cancel'].includes(c.bucket))) throw Error('PR checks failed; inspect the PR before Resume');
          return policy.requiredChecks.every(name => checks.some(c => c.name === name && c.bucket === 'pass'));
        });
        h.command('gh', ['pr', 'merge', String(state.pr), '--repo', repository, '--squash', '--match-head-commit', sourceSha]);
        pr = await h.api(`${base}/pulls/${state.pr}`);
      }
      if (!pr.merged_at || !pr.merge_commit_sha) throw Error('PR merge is not confirmed; Resume after merge completes');
      save({ releaseSha: pr.merge_commit_sha });
    }
  }
  const sha = state.releaseSha;
  const ci = await h.wait('main CI', async () => {
    const runs = (await h.api(`${base}/actions/workflows/${policy.ciWorkflow}/runs?head_sha=${sha}&event=push&branch=${policy.baseBranch}&per_page=100`)).workflow_runs;
    const run = runs[0];
    return run && assertRun(run, sha, policy.ciWorkflow, 'push') ? run : false;
  });
  save({ ciRunId: ci.id, ciRunAttempt: ci.run_attempt });
  // Fetch only after main CI; never move an existing local or remote tag.
  h.command('git', ['fetch', 'origin', policy.baseBranch]);
  const remote = h.command('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  if (remote.trim()) {
    const rows = remote.trim().split(/\r?\n/).map(line => line.split(/\s+/));
    const peeled = rows.find(row => row[1].endsWith('^{}')) || rows[0];
    if (peeled[0] !== sha) throw Error('Existing remote tag points to a different commit');
  } else {
    const local = h.command('git', ['tag', '--list', tag]).trim();
    if (local && h.command('git', ['rev-parse', `${tag}^{commit}`]).trim() !== sha) throw Error('Existing local tag points to a different commit');
    if (!local) h.command('git', ['tag', '-a', tag, sha, '-m', `Release ${tag}`]);
    // Persist the intent before push: a crash cannot cause a duplicate dispatch.
    save({ tagPushStarted: true });
    h.command('git', ['push', 'origin', `refs/tags/${tag}`]);
  }
  const source = await h.authorize(state);
  save({ sourceEvidence: source });
  const run = await h.wait('Release workflow', async () => {
    const runs = (await h.api(`${base}/actions/workflows/release.yml/runs?head_sha=${sha}&per_page=100`)).workflow_runs;
    const exact = runs.filter(r => r.head_branch === tag && ['push', 'workflow_dispatch'].includes(r.event));
    const current = exact[0];
    // Missing runs are not an excuse for blindly dispatching a second build.
    if (!current) return false;
    save({ releaseRunId: current.id, releaseRunAttempt: current.run_attempt });
    return assertRun(current, sha, 'release.yml') ? current : false;
  });
  const resolved = await h.resolve(state);
  if (resolved.state !== 'published') throw Error('Successful workflow did not produce a public Release');
  const release = await h.api(`${base}/releases/${resolved.release.id}`);
  if (release.tag_name !== tag || release.prerelease !== /-rc\.\d+$/.test(tag)) throw Error('Release tag/type mismatch');
  assertAssets(release, state.packageVersion);
  save({ status: 'complete', releaseId: release.id, url: release.html_url, releaseRunId: run.id, assets: release.assets.map(({ name, size, digest }) => ({ name, size, digest })) });
  h.report(`Published and verified: ${release.html_url}`);
  return state;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  process.chdir(root);
  const command = (exe, argv, options = {}) => {
    try { return execFileSync(exe, argv, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000, windowsHide: true, ...options }).trim(); }
    catch (error) {
      // gh pr checks uses exit 8 for pending checks while still returning JSON.
      if (exe === 'gh' && argv[0] === 'pr' && argv[1] === 'checks' && error.status === 8) return String(error.stdout).trim();
      throw Error(`${exe} ${argv.slice(0, 3).join(' ')} failed (exit ${error.status ?? 'unknown'}):\n${String(error.stderr || error.stdout || error.message).slice(-4000)}`);
    }
  };
  const json = (exe, argv) => JSON.parse(command(exe, argv));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  if (args.version.split('-rc.')[0] !== pkg.version || lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw Error('Package/lock/requested version mismatch');
  for (const lang of ['zh-CN', 'zh-TW', 'en', 'fr', 'ja', 'es']) {
    if (!existsSync(`docs/releases/v${pkg.version}.${lang}.md`)) throw Error(`Missing release notes: ${lang}`);
  }
  // Cheap source contracts only. Full application/build gates belong to CI.
  command(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/test-release-consistency.ts'], { env: { ...process.env, REQUIRE_PUBLISHED_RELEASE_NOTES: '1' } });
  const sourceSha = command('git', ['rev-parse', 'HEAD']);
  const branch = command('git', ['branch', '--show-current']);
  if (!branch) throw Error('Detached HEAD is unsupported');
  const repository = json('gh', ['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
  const origin = command('git', ['remote', 'get-url', '--push', 'origin']);
  if (![ `https://github.com/${repository}.git`, `https://github.com/${repository}`, `git@github.com:${repository}.git` ].includes(origin)) throw Error('origin push URL must match the GitHub repository');
  const dirty = command('git', ['status', '--porcelain', '--untracked-files=normal']);
  if (args.mode === 'check') {
    console.log(JSON.stringify({ mode: 'check', repository, version: args.version, branch, sourceSha, ready: !dirty, blockers: dirty ? ['Commit or move working-tree changes, including untracked files, before Publish'] : [], next: 'Publish pushes the prepared branch, merges its PR after CI, tags and waits for Release. No remote mutations were performed.' }, null, 2));
    if (dirty) process.exitCode = 1;
    return;
  }
  if (dirty) throw Error('Working tree must be clean, including untracked files; no automatic staging or committing');
  const folder = resolve(command('git', ['rev-parse', '--git-path', 'release-state']));
  mkdirSync(folder, { recursive: true });
  const statePath = resolve(folder, `v${args.version}.json`);
  const lockPath = `${statePath}.lock`;
  let fd;
  try { fd = openSync(lockPath, 'wx'); } catch { throw Error(`Another release process may be running. Check it before removing stale lock: ${lockPath}`); }
  try {
    let state;
    if (existsSync(statePath)) {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
      if (args.mode !== 'resume') throw Error('State already exists; use -Resume');
      if (state.repository !== repository || state.sourceSha !== sourceSha || state.branch !== branch || state.tag !== `v${args.version}` || state.packageVersion !== pkg.version) throw Error('Resume checkout does not match original repository/branch/commit/version');
    } else {
      if (args.mode === 'resume') throw Error('No saved state exists; use -Publish first');
      state = { schema: 1, repository, tag: `v${args.version}`, packageVersion: pkg.version, sourceSha, branch };
    }
    const save = value => { writeFileSync(`${statePath}.tmp`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${statePath}.tmp`, statePath); };
    save(state);
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || command('gh', ['auth', 'token']);
    const client = createGitHubClient({ token });
    const stateClient = createReleaseStateClient({ token });
    const deadline = Date.now() + Number(args.timeout) * 60000;
    await publishRelease({
      command, json, save, report: console.log,
      api: path => client.get(`/${path}`),
      authorize: s => authorizeReleaseSource({ client, repository, tag: s.tag, expectedSha: s.releaseSha }),
      resolve: s => resolveGitHubRelease({ client: stateClient, repository, tag: s.tag, expectedSha: s.releaseSha }),
      wait: async (label, probe) => {
        console.log(`Waiting: ${label} (60-second polling; deadline ${args.timeout} minutes for this invocation)`);
        while (Date.now() < deadline) {
          const result = await probe();
          if (result) return result;
          await new Promise(r => setTimeout(r, 60000));
        }
        throw Error(`Timed out at ${label}; use -Resume. If no Release run exists, inspect GitHub Actions and explicitly dispatch release.yml with --ref ${state.tag} -f tag=${state.tag}; do not recreate the tag.`);
      }
    }, state);
  } finally { closeSync(fd); unlinkSync(lockPath); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
