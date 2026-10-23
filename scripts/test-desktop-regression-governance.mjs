import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { installClipboardToastAudit } from './desktop-notification-audit.mjs';
import { desktopGroups, assertGroupResults } from './desktop-regression-groups.mjs';
import { assertDesktopGate, latestGroupResults } from './check-desktop-regression-gate.mjs';
import { packBundle, unpackBundle, validateBundleManifest, fileDigest } from './desktop-test-bundle.mjs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { firstPassOutcome } from './record-desktop-ci-timings.mjs';

const packageJson=JSON.parse(await readFile('package.json','utf8'));
assert.equal(firstPassOutcome([{name:'required',status:'in_progress',conclusion:null}],['required']),null,'incomplete first attempt is unknown');
assert.equal(firstPassOutcome([{name:'required',status:'completed',conclusion:'success'}],['required']),true);
assert.equal(firstPassOutcome([{name:'required',status:'completed',conclusion:'failure'}],['required']),false);
assert.equal(firstPassOutcome([],['required']),null,'missing timing evidence is unknown');
let observerCallback;
const renderer={window:{},performance:{now:()=>1},document:{body:{nodeType:1,matches:()=>false,querySelectorAll:()=>[]},visibilityState:'hidden',hasFocus:()=>false},MutationObserver:class {constructor(callback){observerCallback=callback;}observe(){}}};
vm.runInNewContext(`(${installClipboardToastAudit.toString()})()`,renderer);
const removedToast={nodeType:1,matches:()=>true,querySelectorAll:()=>[],textContent:'图片已复制到剪贴板',isConnected:false};
observerCallback([{target:renderer.document.body,addedNodes:[removedToast],removedNodes:[removedToast]}]);
assert.equal(renderer.window.__clipboardToastHistory[0],'图片已复制到剪贴板','added-and-removed toast is retained even when final DOM is empty');
assert.equal(renderer.window.__clipboardToastEvents[0].attached,false);
const flatten=Object.values(desktopGroups).flat();
const scenarios=flatten.filter(entry=>entry.command==='desktop:scenario-test');
assert.deepEqual(scenarios.map(entry=>entry.args[0].slice(11)),['search','song-import','examples','fonts','titlebar','lyrics-input']);
const grouped=flatten.filter(entry=>entry.command!=='desktop:scenario-test').map(entry=>packageJson.scripts[entry.command]);
const legacy=packageJson.scripts['desktop:interaction-test'].split(' && ').map(command=>command.startsWith('npm run ')?packageJson.scripts[command.slice(8)]:command);
assert.deepEqual([...grouped].sort(),[...legacy].sort(),'every legacy interaction is mapped once');
assert.equal(new Set(flatten.map(entry=>entry.id)).size,flatten.length);
const expected={sha:'a'.repeat(40),runId:'123',attempt:2,buildDigest:'b'.repeat(64),contractDigest:'c'.repeat(64)};
const results=Object.entries(desktopGroups).map(([group,entries])=>({...expected,attempt:1,group,outcome:'success',entries:entries.map(entry=>({id:entry.id,exitCode:0}))}));
assert.equal(assertGroupResults(results,expected),true);
assert.equal(assertDesktopGate({shared:false,legacy:'success',build:'skipped',groups:'skipped'}),true);
for(const state of ['failure','cancelled','skipped','missing']) {
  assert.throws(()=>assertDesktopGate({shared:true,legacy:'skipped',build:state,groups:'success',results,expected}));
  assert.throws(()=>assertDesktopGate({shared:true,legacy:'skipped',build:'success',groups:state,results,expected}));
  assert.throws(()=>assertDesktopGate({shared:false,legacy:state,build:'skipped',groups:'skipped'}));
}
for(const field of ['sha','runId','buildDigest','contractDigest']) {
  const invalid=structuredClone(results); invalid[0][field]='wrong'; assert.throws(()=>assertGroupResults(invalid,expected));
}
for(const outcome of ['failure','cancelled','skipped']) {const invalid=structuredClone(results);invalid[0].outcome=outcome;assert.throws(()=>assertGroupResults(invalid,expected));}
assert.throws(()=>assertGroupResults(results.slice(1),expected));
const missingEntry=structuredClone(results);missingEntry[0].entries.pop();assert.throws(()=>assertGroupResults(missingEntry,expected));
const failedAgain={...results[0],attempt:2,outcome:'failure'};
assert.throws(()=>assertGroupResults(latestGroupResults([...results,failedAgain],2),expected),'old successes cannot mask a failed retry');
assert.throws(()=>latestGroupResults([...results,results[0]],2));

const temporary=await mkdtemp(path.join(tmpdir(),'lyrics-bundle-contract-'));
try {
  await mkdir(path.join(temporary,'source/win-unpacked/resources'),{recursive:true});
  await writeFile(path.join(temporary,'source/win-unpacked/Lyrics Card Generator.exe'),'fixture executable');
  await writeFile(path.join(temporary,'source/win-unpacked/resources/app.asar'),'fixture asar');
  const identity={schema:1,repository:'test/repo',sha:expected.sha,runId:'123',buildAttempt:1,platform:process.platform,arch:process.arch,lockDigest:expected.buildDigest,contractDigest:expected.contractDigest,configuration:'fixture'};
  const file=path.join(temporary,'runtime.gz');
  const bundle=await packBundle({root:path.join(temporary,'source'),file,identity});
  await unpackBundle({file,destination:path.join(temporary,'restored'),identity:{...identity,buildAttempt:2},expectedDigest:bundle.buildDigest});
  assert.equal(await readFile(path.join(temporary,'restored/win-unpacked/resources/app.asar'),'utf8'),'fixture asar');
  await assert.rejects(unpackBundle({file,destination:path.join(temporary,'wrong'),identity:{...identity,sha:'d'.repeat(40)},expectedDigest:bundle.buildDigest}),/identity mismatch/);
  await assert.rejects(unpackBundle({file,destination:path.join(temporary,'bad'),identity,expectedDigest:'0'.repeat(64)}),/digest mismatch/);
  const inflated=gunzipSync(await readFile(file));
  const headerLength=inflated.readUInt32BE(4);
  const manifest=JSON.parse(inflated.subarray(8,8+headerLength).toString());
  manifest.files[0].sha256='0'.repeat(64);
  const badHeader=Buffer.from(JSON.stringify(manifest));
  const badLength=Buffer.alloc(4);badLength.writeUInt32BE(badHeader.length);
  const tampered=path.join(temporary,'bad-resource.gz');
  await writeFile(tampered,gzipSync(Buffer.concat([Buffer.from('LCG1'),badLength,badHeader,inflated.subarray(8+headerLength)])));
  await assert.rejects(unpackBundle({file:tampered,destination:path.join(temporary,'bad-resource'),identity,expectedDigest:await fileDigest(tampered)}),/resource digest mismatch/);
  for(const field of ['sha','repository','runId','arch','platform','lockDigest','contractDigest','configuration']) {
    assert.throws(()=>validateBundleManifest({...identity,files:[]},{...identity,[field]:'wrong'}),/identity mismatch/);
  }
  for(const unsafe of ['win-unpacked/../escape','win-unpacked/C:/escape','win-unpacked/CON.txt','win-unpacked/folder./file','win-unpacked/bad'+String.fromCharCode(0)+'file']) {
    assert.throws(()=>validateBundleManifest({...identity,files:[{path:unsafe,size:0,sha256:'a'.repeat(64),mode:0o644}]},identity),/Unsafe/);
  }
  const bytes=await readFile(file);bytes[bytes.length-1]^=1;await writeFile(file,bytes);
  await assert.rejects(unpackBundle({file,destination:path.join(temporary,'corrupt'),identity,expectedDigest:bundle.buildDigest}),/digest mismatch/);
} finally { await rm(temporary,{recursive:true,force:true}); }
console.log('Desktop governance: complete legacy mapping, fail-closed aggregate, retry identity, streaming bundle roundtrip/corruption/path guards passed.');
