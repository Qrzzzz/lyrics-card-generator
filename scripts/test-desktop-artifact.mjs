import assert from 'node:assert/strict';
import { assertDesktopArtifact, checkDesktopArtifact } from './check-desktop-artifact.mjs';

const now = Date.parse('2026-10-23T12:00:00Z');
const expected = { repository: 'owner/repo', sha: 'a'.repeat(40), runId: '123', artifactId: '456', attempt: 2 };
const artifact = { id: 456, name: 'desktop-runtime-123-1', expired: false, expires_at: '2026-10-30T12:00:00Z', digest: `sha256:${'b'.repeat(64)}`, size_in_bytes: 100, workflow_run: { id: 123, head_sha: expected.sha } };
assert.equal(assertDesktopArtifact(artifact, expected, now).buildAttempt, 1, 'successful build from an earlier attempt remains reusable');
assert.equal(assertDesktopArtifact({ ...artifact, name: 'desktop-runtime-123-2' }, expected, now).buildAttempt, 2);
for (const patch of [{ expired: true }, { expires_at: '2026-10-23T12:00:00Z' }, { expires_at: '2026-10-22T12:00:00Z' }]) {
  assert.throws(() => assertDesktopArtifact({ ...artifact, ...patch }, expected, now), /expired.*rebuild desktop-build and rerun ALL/);
}
for (const patch of [
  { id: 789 }, { name: 'desktop-runtime-123-3' }, { name: 'desktop-runtime-999-1' }, { name: 'other' },
  { workflow_run: { id: 999, head_sha: expected.sha } }, { workflow_run: { id: 123, head_sha: 'c'.repeat(40) } },
  { expired: undefined }, { expires_at: 'invalid' }, { digest: null }, { size_in_bytes: 0 }
]) assert.throws(() => assertDesktopArtifact({ ...artifact, ...patch }, expected, now));
for (const patch of [{ repository: '../repo' }, { sha: 'invalid' }, { runId: '0' }, { artifactId: 'NaN' }, { artifactId: '9007199254740992' }, { attempt: 0 }]) {
  assert.throws(() => assertDesktopArtifact(artifact, { ...expected, ...patch }, now), /Explicit/);
}
let calls = 0;
const fetchImpl = async (url, init) => {
  calls++;
  assert.equal(url, 'https://api.github.com/repos/owner/repo/actions/artifacts/456');
  assert.equal(init.headers.Authorization, 'Bearer fixture-token');
  assert.equal(init.method, undefined, 'preflight only reads; it cannot delete or rebuild artifacts');
  return new Response(JSON.stringify(artifact));
};
await checkDesktopArtifact({ expected, token: 'fixture-token', fetchImpl, now });
assert.equal(calls, 1);
for (const status of [404, 410, 401, 403, 429, 500]) {
  let failedCalls = 0;
  await assert.rejects(checkDesktopArtifact({ expected, token: 'fixture-token', now, fetchImpl: async () => {
    failedCalls++; return new Response('body-must-not-be-logged', { status });
  } }), error => {
    assert.match(error.message, new RegExp(`HTTP ${status}`));
    assert.equal(error.message.includes('body-must-not-be-logged'), false);
    assert.equal(error.message.includes('fixture-token'), false);
    if ([404, 410].includes(status)) assert.match(error.message, /rerun ALL consumer groups/);
    return true;
  });
  assert.equal(failedCalls, 1, 'failure is diagnosed without automatic retries');
}
await assert.rejects(checkDesktopArtifact({ expected, token: 'fixture-token', fetchImpl: async () => { throw Error('network EOF'); }, now }), /network EOF/);
await assert.rejects(checkDesktopArtifact({ expected, token: 'fixture-token', fetchImpl: async () => new Response('invalid-json'), now }), SyntaxError);
await assert.rejects(checkDesktopArtifact({ expected, token: '', fetchImpl, now }), /TOKEN required/);
assert.equal(calls, 1, 'missing credentials stop before the request');
console.log('Desktop artifact preflight: reuse identity, expiry, missing/inaccessible artifacts, API failures and no automatic mutations/retries passed.');
