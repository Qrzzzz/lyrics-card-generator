import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createGitHubClient, releaseSourcePolicy } from './verify-release-source.mjs';
import { createBoundedFetch } from './release-cli.mjs';
import { assertDesktopArtifact } from './check-desktop-artifact.mjs';
import { bundleIdentity, unpackBundle, fileDigest, runtimeFileManifest } from './desktop-test-bundle.mjs';

const hash = /^[a-f0-9]{64}$/;
export function selectMainRuntime({ run, jobs, artifacts, expected, now = Date.now() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(expected.repository || '') || !/^[a-f0-9]{40}$/.test(expected.sha || '') || !Number.isSafeInteger(expected.runId) || expected.runId < 1 || !Number.isSafeInteger(expected.attempt) || expected.attempt < 1) throw Error('Explicit authorized main identity required');
  if (run.id !== expected.runId || run.head_sha !== expected.sha || run.repository?.full_name !== expected.repository || run.head_branch !== releaseSourcePolicy.baseBranch
    || run.event !== 'push' || run.path?.split('@')[0] !== releaseSourcePolicy.ciWorkflowPath || run.run_attempt !== expected.attempt || run.status !== 'completed' || run.conclusion !== 'success') throw Error('Main runtime source run/attempt is not the authorized successful main CI');
  for (const name of releaseSourcePolicy.requiredChecks) {
    const matches = jobs.filter(job => job.name === name);
    if (matches.length !== 1 || matches[0].head_sha !== expected.sha || matches[0].run_attempt !== expected.attempt || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') throw Error(`Main runtime lacks exact successful check: ${name}`);
  }
  const candidates = artifacts.flatMap(artifact => {
    const match = /^desktop-runtime-([1-9]\d*)-([1-9]\d*)$/.exec(artifact.name || '');
    if (!match || Number(match[1]) !== expected.runId || Number(match[2]) > expected.attempt) return [];
    return [{ artifact, producerAttempt: Number(match[2]) }];
  }).sort((a,b) => b.producerAttempt-a.producerAttempt);
  if (!candidates.length) return { available: false, reason: 'authorized-main-runtime-missing' };
  const producers = jobs.filter(job => job.name === 'desktop-build');
  if (producers.length !== 1 || producers[0].status !== 'completed' || producers[0].conclusion !== 'success' || producers[0].head_sha !== expected.sha || producers[0].run_attempt !== expected.attempt) throw Error('Main runtime producer is not successful at the authorized source/attempt');
  if (candidates.length > 1 && candidates[0].producerAttempt === candidates[1].producerAttempt) throw Error('Ambiguous main runtime producer');
  const { artifact, producerAttempt } = candidates[0];
  if (artifact.workflow_run?.id !== expected.runId || artifact.workflow_run?.head_sha !== expected.sha || typeof artifact.expired !== 'boolean' || !Number.isFinite(Date.parse(artifact.expires_at || ''))) throw Error('Invalid main runtime metadata/identity');
  if (artifact.expired || Date.parse(artifact.expires_at) <= now) return { available: false, reason: 'authorized-main-runtime-expired' };
  assertDesktopArtifact(artifact, { ...expected, artifactId: artifact.id }, now);
  return { available: true, artifactId: artifact.id, producerAttempt, digest: artifact.digest };
}

export function assertRuntimeProof(proof, identity, producerAttempt) {
  for (const [key, value] of Object.entries(identity)) {
    if (key !== 'buildAttempt' && proof[key] !== value) throw Error(`Reused main runtime identity mismatch: ${key}`);
  }
  if (proof.buildAttempt !== producerAttempt || producerAttempt < 1 || producerAttempt > identity.buildAttempt || !hash.test(proof.buildDigest || '') || !hash.test(proof.manifestDigest || '')) throw Error('Invalid attested producer proof');
}

export function assertAttestedManifest(manifest, proof, identity, manifestDigest) {
  for (const key of Object.keys(identity)) if (manifest[key] !== proof[key]) throw Error(`Attested manifest identity mismatch: ${key}`);
  if (manifestDigest !== proof.manifestDigest) throw Error('Attested manifest digest mismatch');
}

export async function verifyReusedFiles(proof, root = process.cwd(), installer = false) {
  if (!Array.isArray(proof.files) || !proof.files.length) throw Error('Verified reused file manifest required');
  const actual = await runtimeFileManifest(path.join(root, 'release'));
  const original = new Map(proof.files.map(file => [file.path, file]));
  const allowed = new Set(installer ? ['win-unpacked/resources/app-update.yml','win-unpacked/resources/elevate.exe'] : []);
  for (const file of actual) {
    const expected = original.get(file.path);
    if (!expected) { if (!allowed.has(file.path)) throw Error(`Unexpected reused runtime addition: ${file.path}`); continue; }
    if (file.sha256 !== expected.sha256 || file.size !== expected.size) throw Error(`Reused runtime changed: ${file.path}`);
    original.delete(file.path);
  }
  if (original.size) throw Error('Reused runtime resource missing');
  if (installer) for (const name of allowed) if (!actual.some(file => file.path === name && file.size > 0)) throw Error(`Installer resource missing: ${name}`);
  return actual.length;
}

async function main() {
  const expected = { repository: process.env.GITHUB_REPOSITORY, sha: process.env.EXPECTED_RELEASE_SHA, runId: Number(process.env.AUTHORIZED_CI_RUN_ID), attempt: Number(process.env.AUTHORIZED_CI_RUN_ATTEMPT) };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw Error('Actions read token required');
  const client = createGitHubClient({ token, fetchImpl: createBoundedFetch() });
  const base = `/repos/${expected.repository}`;
  const run = await client.get(`${base}/actions/runs/${expected.runId}`);
  const jobs = await client.getAll(`${base}/actions/runs/${expected.runId}/attempts/${expected.attempt}/jobs`, 'jobs');
  const artifacts = await client.getAll(`${base}/actions/runs/${expected.runId}/artifacts`, 'artifacts');
  const selected = selectMainRuntime({ run, jobs, artifacts, expected });
  if (process.argv[2] === 'select') {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `available=${selected.available}\nartifact-id=${selected.artifactId || ''}\nproducer-attempt=${selected.producerAttempt || ''}\n`);
    console.log(JSON.stringify(selected)); return;
  }
  if (process.argv[2] !== 'unpack' || !selected.available || selected.artifactId !== Number(process.env.MAIN_RUNTIME_ARTIFACT_ID)) throw Error('The selected exact main runtime is no longer available');
  const identity = await bundleIdentity({ ...process.env, DESKTOP_SOURCE_SHA: expected.sha, GITHUB_RUN_ID: String(expected.runId), GITHUB_RUN_ATTEMPT: String(expected.attempt) });
  const directory = path.resolve('artifacts/desktop-bundle');
  fs.mkdirSync('output', { recursive: true });
  for (const name of ['runtime.lcg.gz', 'runtime.lcg.gz.json']) {
    const verification = execFileSync('gh', ['attestation','verify',path.join(directory,name),'--repo',expected.repository,
      '--signer-workflow',`${expected.repository}/${releaseSourcePolicy.ciWorkflowPath}`,'--source-ref',`refs/heads/${releaseSourcePolicy.baseBranch}`,'--source-digest',expected.sha,'--signer-digest',expected.sha,'--deny-self-hosted-runners','--format','json'],
    { encoding:'utf8', timeout:120000, windowsHide:true, maxBuffer:8*1024*1024 });
    fs.writeFileSync(path.join('output', `main-runtime-attestation-${name.endsWith('.json')?'proof':'bundle'}.json`), verification);
  }
  const proofFile = path.join(directory, 'runtime.lcg.gz.json');
  if (fs.statSync(proofFile).size > 1024 * 1024) throw Error('Attested runtime proof exceeds its metadata limit');
  const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
  assertRuntimeProof(proof, identity, selected.producerAttempt);
  if (await fileDigest(path.join(directory,'runtime.lcg.gz')) !== proof.buildDigest) throw Error('Attested main runtime content changed');
  let files, unpackedManifest;
  const result = await unpackBundle({ file: path.join(directory,'runtime.lcg.gz'), destination:path.resolve('release'), identity, expectedDigest:proof.buildDigest, onManifest: manifest => { files=manifest.files; unpackedManifest=manifest; } });
  assertAttestedManifest(unpackedManifest, proof, identity, result.manifestDigest);
  fs.writeFileSync('output/reused-main-runtime.json', JSON.stringify({ ...proof, artifactId:selected.artifactId, authorizedCiAttempt:expected.attempt, files, attested:true },null,2)+'\n');
  console.log(JSON.stringify({ reused:true, artifactId:selected.artifactId, runId:expected.runId, producerAttempt:proof.buildAttempt, ...result }));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error=>{console.error(error.message);process.exitCode=1;});
