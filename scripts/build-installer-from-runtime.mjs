import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyReusedFiles } from './release-main-runtime.mjs';
import { runtimeFileManifest } from './desktop-test-bundle.mjs';

const local = process.argv.includes('--local-validation');
if (local && process.env.CI === 'true') throw Error('Local fixture mode is not a Release authorization');
const proofPath = 'output/reused-main-runtime.json';
let proof;
if (local) {
  proof = { files:await runtimeFileManifest(path.resolve('release')), attested:false, localValidation:true };
} else {
  proof = JSON.parse(fs.readFileSync(proofPath,'utf8'));
  if (process.env.CI !== 'true' || !proof.attested || proof.sha !== process.env.EXPECTED_RELEASE_SHA || Number(proof.runId) !== Number(process.env.AUTHORIZED_CI_RUN_ID)) throw Error('Verified exact main runtime proof required');
}
await verifyReusedFiles(proof);
execFileSync(process.execPath,['scripts/prepare-electron-dist.mjs','--from-unpacked'],{stdio:'inherit',windowsHide:true});
const staged=JSON.parse(fs.readFileSync('dist-desktop/app/package.json','utf8'));
const cacheName=staged.name.toLowerCase()+'-updater';
const config=`provider: github\nowner: Qrzzzz\nrepo: lyrics-card-generator\nupdaterCacheDirName: ${cacheName}\n`;
const updatePath='release/win-unpacked/resources/app-update.yml';
if (fs.existsSync(updatePath) && fs.readFileSync(updatePath,'utf8').replaceAll('\r\n','\n') !== config) throw Error('Unexpected update configuration in reused runtime');
fs.writeFileSync(updatePath,config);
execFileSync(process.execPath,['node_modules/electron-builder/out/cli/cli.js','--publish','never','--projectDir','dist-desktop/app','--prepackaged',path.resolve('release/win-unpacked')],{stdio:'inherit',windowsHide:true});
await verifyReusedFiles(proof,process.cwd(),true);
proof.installerInputVerified=true;
if (!local) fs.writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({ok:true,mode:local?'local-validation':'attested-main-runtime',sourceSha:proof.sha||null,resources:proof.files.length}));
