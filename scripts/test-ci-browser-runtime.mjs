import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertBrowserRuntimePolicy, probeBrowserRuntime } from './check-ci-browser-runtime.mjs';
const policy = JSON.parse(fs.readFileSync('security/ci-browser-runtime.json','utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json','utf8'));
assert.equal(assertBrowserRuntimePolicy(policy, lock), true);
for (const patch of [{ schema: 2 }, { image: 'mcr.microsoft.com/playwright:latest' }, { image: policy.image.replace(`:v${policy.playwrightVersion}`,':v0.0.0') }, { browsers: { chromium: policy.browsers.chromium } }]) {
  assert.throws(() => assertBrowserRuntimePolicy({ ...policy, ...patch }, lock));
}
for (const name of ['@playwright/test','playwright','playwright-core']) {
  const changed = structuredClone(lock); changed.packages[`node_modules/${name}`].version = '0.0.0';
  assert.throws(() => assertBrowserRuntimePolicy(policy, changed), /mismatch/);
}
let closes = 0, launches = 0;
const browserType = { executablePath: () => '/fixture/browser', launch: async () => { launches++; return { version: () => '1.2.3', close: async () => { closes++; } }; } };
const probe = (expectedVersion, access = file => assert.equal(file,'/fixture/browser')) => probeBrowserRuntime({ name:'fixture', expectedVersion, browserType, access });
assert.equal((await probe('1.2.3')).launched, true);
await assert.rejects(probe('4.5.6'), /version mismatch/);
assert.equal(closes, 2, 'a version mismatch still closes the actual browser');
await assert.rejects(probe('1.2.3', () => { throw Error('missing executable'); }), /missing executable/);
assert.equal(launches, 2, 'missing binaries fail before launch or any download');
await assert.rejects(probeBrowserRuntime({ name:'fixture', expectedVersion:'1.2.3', browserType:{ ...browserType,launch:async()=>{throw Error('missing system dependency');}},access:()=>{} }), /missing system dependency/);
console.log('CI browser runtime: locked image/version, three engines, executable failures, startup failure and mismatch cleanup passed.');
