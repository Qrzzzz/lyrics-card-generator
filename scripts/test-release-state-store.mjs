import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveReleaseState } from './release-state-store.mjs';

const root = mkdtempSync(join(tmpdir(), 'lcg-release-state-'));
const path = join(root, 'v6.8.3.json');
const old = { sourceSha: 'a'.repeat(40), releaseSha: 'b'.repeat(40), pr: 249 };
const next = { ...old, tagPushStarted: true };
const fail = code => Object.assign(new Error('injected filesystem failure'), { code });
try {
  saveReleaseState(path, old);
  let writes = 0, renames = 0;
  const delays = [], reports = [];
  saveReleaseState(path, next, {
    platform: 'win32',
    write: (...args) => { writes++; writeFileSync(...args); },
    rename: (...args) => {
      renames++;
      if (renames < 3) {
        assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), old);
        throw fail(renames === 1 ? 'EPERM' : 'EBUSY');
      }
      renameSync(...args);
    }, sleep: ms => delays.push(ms), report: message => reports.push(message)
  });
  assert.equal(writes, 1, 'retries only replace the same complete temporary file');
  assert.equal(renames, 3);
  assert.deepEqual(delays, [25, 50]);
  assert.equal(reports.length, 2);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), next);

  for (const [platform, code, attempts] of [['win32', 'EPERM', 6], ['win32', 'EBUSY', 6], ['win32', 'EACCES', 1], ['win32', 'ENOSPC', 1], ['linux', 'EPERM', 1]]) {
    renames = 0;
    assert.throws(() => saveReleaseState(path, old, {
      platform, rename: () => { renames++; throw fail(code); }, sleep() {}, report() {}
    }), error => error.code === code && error.cause.code === code && error.message.includes('preserved'));
    assert.equal(renames, attempts);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), next, 'failed replacement preserves authoritative state');
    assert.deepEqual(JSON.parse(readFileSync(`${path}.tmp`, 'utf8')), old, 'temporary evidence remains available');
  }
  assert.throws(() => saveReleaseState(path, old, {
    write: () => { throw fail('ENOSPC'); }, rename: () => assert.fail('must not rename after failed write')
  }), { code: 'ENOSPC' });
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), next);
  // A resumed writer uses the authoritative old state and overwrites stale tmp;
  // it never promotes tmp identity or treats local flags as remote authorization.
  saveReleaseState(path, next);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), next);
  console.log('Release state atomic replacement tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
