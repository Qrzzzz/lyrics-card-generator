import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);

export function assertBrowserRuntimePolicy(policy, lock) {
  if (policy.schema !== 1 || !/^\d+\.\d+\.\d+$/.test(policy.playwrightVersion || '')
    || !new RegExp(`^mcr\\.microsoft\\.com/playwright:v${policy.playwrightVersion.replaceAll('.', '\\.')}\\-noble@sha256:[a-f0-9]{64}$`).test(policy.image || '')) throw Error('Browser image must pin the Playwright version, Noble and immutable digest');
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    if (lock.packages?.[`node_modules/${name}`]?.version !== policy.playwrightVersion) throw Error(`Browser image/lock mismatch: ${name}`);
  }
  if (Object.keys(policy.browsers || {}).sort().join(',') !== 'chromium,firefox,webkit'
    || Object.values(policy.browsers).some(version => typeof version !== 'string' || !/^\d+(?:\.\d+)+$/.test(version))) throw Error('All three browser versions must be pinned');
  return true;
}

export async function probeBrowserRuntime({ name, expectedVersion, browserType, access = file => fs.accessSync(file, fs.constants.X_OK) }) {
  const executable = browserType.executablePath();
  access(executable);
  const browser = await browserType.launch({ headless: true, timeout: 30000 });
  try {
    const actualVersion = browser.version();
    if (actualVersion !== expectedVersion) throw Error(`${name}: browser version mismatch; expected ${expectedVersion}, got ${actualVersion}`);
    return { name, version: actualVersion, executable, launched: true };
  } finally { await browser.close(); }
}

async function main() {
  const policy = JSON.parse(fs.readFileSync('security/ci-browser-runtime.json', 'utf8'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  assertBrowserRuntimePolicy(policy, lock);
  if (process.platform !== 'linux') throw Error('The pinned CI browser image is Linux-only');
  const names = process.argv[2]?.replace(/^--browsers=/, '').split(',');
  if (!process.argv[2]?.startsWith('--browsers=') || process.argv.length !== 3 || !names?.length || new Set(names).size !== names.length || names.some(name => !Object.hasOwn(policy.browsers, name))) throw Error('Explicit supported --browsers list required');
  const core = JSON.parse(fs.readFileSync(require.resolve('playwright-core/package.json'), 'utf8'));
  if (core.version !== policy.playwrightVersion) throw Error('Installed Playwright differs from the image policy');
  const playwright = await import('playwright');
  const results = [];
  for (const name of names) results.push(await probeBrowserRuntime({ name, expectedVersion: policy.browsers[name], browserType: playwright[name] }));
  console.log(JSON.stringify({ image: policy.image, playwrightVersion: core.version, browsers: results }));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
