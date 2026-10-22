import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { desktopGroups } from './desktop-regression-groups.mjs';
import { desktopContractDigest } from './desktop-test-bundle.mjs';

const group = process.argv.find(value => value.startsWith('--group='))?.slice(8);
if (!Object.hasOwn(desktopGroups, group || '')) throw Error('Select --group=editor|data|native');
if (!process.env.npm_execpath) throw Error('Run through npm run desktop:group:<name>');
const sessionLock = path.join(tmpdir(), 'lyrics-desktop-regression-session.lock');
let lock;
try { lock = await open(sessionLock, 'wx'); } catch { throw Error(`Another desktop group may own this session. Inspect ${sessionLock} and its PID before removing a stale lock; never run groups concurrently on one desktop.`); }
let temporary;
let report;
const evidence = path.resolve('artifacts/desktop-groups', group);
const attempt = Number(process.env.GITHUB_RUN_ATTEMPT || 1);
const invocation = `${attempt}-${Date.now()}`;
try {
temporary = await mkdtemp(path.join(tmpdir(), `lyrics-group-${group}-`));
await mkdir(evidence, { recursive: true });
report = { group, sha: process.env.GITHUB_SHA || 'local-uncommitted', runId: process.env.GITHUB_RUN_ID || 'local', attempt,
  buildDigest: process.env.DESKTOP_BUILD_DIGEST || 'local-unshared', contractDigest: await desktopContractDigest(), startedAt: new Date().toISOString(), outcome: 'failure', entries: [] };
await lock.writeFile(JSON.stringify({ pid: process.pid, group, startedAt: report.startedAt }));
  for (const entry of desktopGroups[group]) {
    const started = Date.now();
    const log = createWriteStream(path.join(evidence, `${invocation}-${entry.id}.log`));
    process.stdout.write(`[desktop-group] ${group}/${entry.id} started\n`);
    let child;
    let timedOut = false;
    const exitCode = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, [process.env.npm_execpath, 'run', entry.command, ...(entry.args ? ['--', ...entry.args] : [])], {
        env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
      const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === 'win32') {
          const termination = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          termination.once('error', () => child.kill('SIGKILL'));
        }
        else child.kill('SIGKILL');
      }, 8 * 60000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    }).finally(() => new Promise(resolve => log.end(resolve)));
    const result = { id: entry.id, expectedExitCode: 0, exitCode, timedOut, elapsedMs: Date.now() - started };
    report.entries.push(result);
    process.stdout.write(`[desktop-group] ${group}/${entry.id} exit=${exitCode} elapsed=${result.elapsedMs}ms\n`);
    if (exitCode !== 0 || timedOut) throw Error(`${group}/${entry.id} failed; preserve ${evidence}. Diagnose before an explicit rerun.`);
  }
  report.outcome = 'success';
} finally {
  try {
    if (report) {
      report.finishedAt = new Date().toISOString();
      await writeFile(path.join(evidence, `result-${group}-${invocation}.json`), JSON.stringify(report, null, 2));
    }
  } finally {
    await lock.close(); await rm(sessionLock);
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
