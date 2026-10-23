import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBoundedFetch } from './release-cli.mjs';

const recovery = 'Inspect the source run, then explicitly rebuild desktop-build and rerun ALL three consumer groups. Do not combine old group results with a new bundle or automatically retry the download.';
function unavailable(reason) { throw Error(`Desktop runtime artifact unavailable (${reason}). ${recovery}`); }

function validateExpected(expected) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(expected.repository || '') || expected.repository.split('/').some(part => part === '.' || part === '..') || !/^[a-f0-9]{40}$/.test(expected.sha || '')
    || !/^[1-9]\d*$/.test(String(expected.runId || '')) || !/^[1-9]\d*$/.test(String(expected.artifactId || ''))
    || !Number.isSafeInteger(Number(expected.artifactId)) || !Number.isSafeInteger(Number(expected.runId))
    || !Number.isSafeInteger(expected.attempt) || expected.attempt < 1) throw Error('Explicit desktop artifact ID, source run/SHA/repository and attempt required');
}

export function assertDesktopArtifact(artifact, expected, now = Date.now()) {
  validateExpected(expected);
  if (!artifact || typeof artifact !== 'object' || typeof artifact.expired !== 'boolean'
    || !Number.isFinite(Date.parse(artifact.expires_at || '')) || !Number.isFinite(now)) throw Error('Invalid desktop artifact availability metadata');
  if (artifact.expired || Date.parse(artifact.expires_at) <= now) unavailable('expired');
  const name = /^desktop-runtime-([1-9]\d*)-([1-9]\d*)$/.exec(artifact.name || '');
  if (artifact.id !== Number(expected.artifactId) || String(artifact.workflow_run?.id) !== String(expected.runId)
    || artifact.workflow_run?.head_sha !== expected.sha || !name || name[1] !== String(expected.runId)
    || !Number.isSafeInteger(Number(name[2])) || Number(name[2]) > expected.attempt) throw Error('Desktop runtime artifact identity mismatch; refusing download');
  if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0 || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '')) throw Error('Invalid desktop runtime artifact size/digest');
  return { artifactId: artifact.id, buildAttempt: Number(name[2]), artifactDigest: artifact.digest, expiresAt: artifact.expires_at };
}

export async function checkDesktopArtifact({ expected, token, fetchImpl = createBoundedFetch(globalThis.fetch, 30000), now = Date.now() }) {
  validateExpected(expected);
  if (!token) throw Error('GH_TOKEN or GITHUB_TOKEN required for desktop artifact preflight');
  const response = await fetchImpl(`https://api.github.com/repos/${expected.repository}/actions/artifacts/${expected.artifactId}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (response.status === 404 || response.status === 410) unavailable(`HTTP ${response.status}; missing, expired or inaccessible`);
  if (!response.ok) throw Error(`Desktop artifact preflight API HTTP ${response.status}; inspect authentication, permissions or service availability before retrying`);
  return assertDesktopArtifact(await response.json(), expected, now);
}

async function main() {
  const expected = { repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, attempt: Number(process.env.GITHUB_RUN_ATTEMPT), artifactId: process.env.DESKTOP_ARTIFACT_ID };
  console.log(JSON.stringify(await checkDesktopArtifact({ expected, token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN })));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
