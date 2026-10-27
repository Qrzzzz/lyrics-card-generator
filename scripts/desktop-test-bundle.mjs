import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function desktopContractDigest(root = process.cwd()) {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const scripts = (await readdir(path.join(root, 'scripts'))).filter(name => /(?:desktop|electron-test-lifecycle|editor-language-test|choice-test|prepare-electron-dist|build-installer|stage-updater-runtime|release-main-runtime)/.test(name)).sort();
  const hash = createHash('sha256').update(JSON.stringify(packageJson.scripts));
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml', 'security/release-source-policy.json', ...scripts.map(name => `scripts/${name}`)]) {
    hash.update(file); hash.update((await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n'));
  }
  return hash.digest('hex');
}
export async function bundleIdentity(env = process.env, root = process.cwd()) {
  const sourceSha = env.DESKTOP_SOURCE_SHA || env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sourceSha || '') || !/^\d+$/.test(env.GITHUB_RUN_ID || '') || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw Error('Explicit source SHA/run/attempt required for a shared desktop bundle');
  if (env.CI !== 'true' || env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false') throw Error('Shared desktop runtime configuration mismatch');
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim() !== sourceSha) throw Error('Checkout differs from source SHA');
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()) throw Error('Shared desktop bundle requires an unchanged source checkout');
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '')) throw Error('Source repository required');
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  return { schema: 1, repository: env.GITHUB_REPOSITORY, sha: sourceSha, runId: env.GITHUB_RUN_ID, buildAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    nodeVersion: process.versions.node, electronVersion: lock.packages['node_modules/electron'].version, builderVersion: lock.packages['node_modules/electron-builder'].version,
    platform: process.platform, arch: process.arch, lockDigest: await fileDigest(path.join(root, 'package-lock.json')),
    contractDigest: await desktopContractDigest(root), configuration: 'desktop:pack;CI=true;CSC_IDENTITY_AUTO_DISCOVERY=false' };
}
export function validateBundleManifest(manifest, expected) {
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceTree || '') || ['nodeVersion','electronVersion','builderVersion'].some(key => !/^\d+\.\d+\.\d+$/.test(manifest[key] || ''))) throw Error('Desktop bundle content/toolchain identity missing');
  for (const key of ['schema', 'repository', 'sha', 'runId', 'platform', 'arch', 'lockDigest', 'contractDigest', 'configuration', 'sourceTree', 'nodeVersion', 'electronVersion', 'builderVersion']) {
    if (manifest[key] !== expected[key]) throw Error(`Desktop bundle identity mismatch: ${key}`);
  }
  if (!Number.isSafeInteger(manifest.buildAttempt) || manifest.buildAttempt < 1 || manifest.buildAttempt > expected.buildAttempt) throw Error('Invalid build attempt');
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 20000) throw Error('Invalid bundle file list');
  const seen = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !file.path.startsWith('win-unpacked/') || /[\\:]/.test(file.path) || [...file.path].some(character => character.charCodeAt(0) < 32) || file.path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error('Unsafe bundle path');
    const normalized = file.path.toLowerCase();
    if (seen.has(normalized)) throw Error('Duplicate bundle path'); seen.add(normalized);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 2 ** 32 || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777) throw Error('Invalid file metadata');
  }
  for (const required of ['win-unpacked/Lyrics Card Generator.exe', 'win-unpacked/resources/app.asar']) if (!seen.has(required.toLowerCase())) throw Error(`Missing runtime resource: ${required}`);
}
async function collect(root, relative = 'win-unpacked') {
  const files = [];
  for (const name of (await readdir(path.join(root, relative))).sort()) {
    const file = path.posix.join(relative, name); const stat = await lstat(path.join(root, file));
    if (stat.isSymbolicLink()) throw Error('Desktop bundles cannot contain symlinks');
    if (stat.isDirectory()) files.push(...await collect(root, file));
    else if (stat.isFile()) files.push({ path: file, size: stat.size, sha256: await fileDigest(path.join(root, file)), mode: stat.mode & 0o777 });
    else throw Error('Unsupported desktop resource type');
  }
  return files;
}
export async function runtimeFileManifest(root) { return collect(root); }
export async function packBundle({ root, file, identity }) {
  const started = Date.now(); const manifest = { ...identity, files: await collect(root) };
  validateBundleManifest(manifest, identity);
  const header = Buffer.from(JSON.stringify(manifest));
  if (header.length > 20 * 1024 * 1024) throw Error('Bundle manifest too large');
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  async function* content() {
    yield Buffer.from('LCG1'); yield length; yield header;
    for (const entry of manifest.files) yield* createReadStream(path.join(root, entry.path));
  }
  await mkdir(path.dirname(file), { recursive: true });
  await pipeline(Readable.from(content()), createGzip({ level: 1 }), createWriteStream(file));
  const result = { ...identity, buildDigest: await fileDigest(file), manifestDigest: digest(header), rawBytes: manifest.files.reduce((n, item) => n + item.size, 0), wireBytes: (await lstat(file)).size, packMs: Date.now() - started };
  await writeFile(`${file}.json`, JSON.stringify(result, null, 2));
  return result;
}
export async function unpackBundle({ file, destination, identity, expectedDigest, onManifest }) {
  const started = Date.now();
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || '') || await fileDigest(file) !== expectedDigest) throw Error('Desktop bundle digest mismatch');
  const input = createReadStream(file).pipe(createGunzip());
  const iterator = input[Symbol.asyncIterator](); let buffered = Buffer.alloc(0);
  async function take(size) {
    const chunks = []; let remaining = size;
    while (remaining) {
      if (!buffered.length) { const next = await iterator.next(); if (next.done) throw Error('Truncated desktop bundle'); buffered = next.value; }
      const count = Math.min(buffered.length, remaining); chunks.push(buffered.subarray(0, count)); buffered = buffered.subarray(count); remaining -= count;
    }
    return Buffer.concat(chunks, size);
  }
  try {
    if ((await take(4)).toString() !== 'LCG1') throw Error('Invalid bundle magic');
    const length = (await take(4)).readUInt32BE(); if (length > 20 * 1024 * 1024) throw Error('Bundle manifest too large');
    const header = await take(length);
    const manifest = JSON.parse(header.toString()); validateBundleManifest(manifest, identity);
    // A fresh directory prevents pre-existing junctions or files redirecting writes.
    await mkdir(destination, { recursive: false });
    for (const entry of manifest.files) {
      const target = path.join(destination, ...entry.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      const output = createWriteStream(target, { flags: 'wx' }); const hash = createHash('sha256'); let remaining = entry.size;
      try {
        while (remaining) { const bytes = await take(Math.min(65536, remaining)); hash.update(bytes); if (!output.write(bytes)) await once(output, 'drain'); remaining -= bytes.length; }
        await new Promise((resolve, reject) => { output.once('error', reject); output.end(resolve); });
      } catch (error) { output.destroy(); throw error; }
      if (hash.digest('hex') !== entry.sha256) throw Error(`Desktop resource digest mismatch: ${entry.path}`);
      await chmod(target, entry.mode);
      if ((await lstat(target)).size !== entry.size) throw Error('Desktop resource size mismatch');
    }
    if (buffered.length || !(await iterator.next()).done) throw Error('Unexpected bundle trailing bytes');
    await onManifest?.(manifest);
    return { buildDigest: expectedDigest, manifestDigest: digest(header), unpackMs: Date.now() - started, files: manifest.files.length };
  } finally { input.destroy(); }
}
async function main() {
  const mode = process.argv[2]; const identity = await bundleIdentity();
  if (mode === 'pack') {
    const result = await packBundle({ root: path.resolve('release'), file: path.resolve('artifacts/desktop-bundle/runtime.lcg.gz'), identity });
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `digest=${result.buildDigest}\ncontract=${result.contractDigest}\n`, { flag: 'a' });
    console.log(JSON.stringify(result));
  } else if (mode === 'unpack') {
    const result = await unpackBundle({ file: path.resolve('artifacts/desktop-bundle/runtime.lcg.gz'), destination: path.resolve('release'), identity, expectedDigest: process.env.DESKTOP_BUILD_DIGEST });
    console.log(JSON.stringify(result));
  } else throw Error('Select pack|unpack');
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
