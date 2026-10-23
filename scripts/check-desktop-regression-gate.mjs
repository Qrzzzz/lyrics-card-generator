import { readFile, readdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { assertGroupResults, desktopGroups } from './desktop-regression-groups.mjs';
import { desktopContractDigest } from './desktop-test-bundle.mjs';
import { pathToFileURL } from 'node:url';

export function assertDesktopGate({ shared, legacy, build, groups, results, expected }) {
  if (!shared) { if (legacy !== 'success' || build !== 'skipped' || groups !== 'skipped') throw Error('Legacy desktop regression did not complete successfully'); return true; }
  if (legacy !== 'skipped' || build !== 'success' || groups !== 'success') throw Error('Shared build or a required desktop group did not succeed');
  return assertGroupResults(results, expected);
}
export function latestGroupResults(results, attempt) {
  if (results.some(result => !Object.hasOwn(desktopGroups, result.group || '') || !Number.isSafeInteger(result.attempt) || result.attempt < 1 || result.attempt > attempt)) throw Error('Unknown group or invalid result attempt');
  return Object.keys(desktopGroups).flatMap(group => {
    const candidates = results.filter(result => result.group === group && result.attempt <= attempt).sort((a, b) => b.attempt - a.attempt);
    if (candidates.length > 1 && candidates[0].attempt === candidates[1].attempt) throw Error(`Duplicate group evidence: ${group}`);
    return candidates.slice(0, 1);
  });
}
async function readResults(folder) {
  const results=[];
  for (const entry of await readdir(folder, {withFileTypes:true})) {
    const file=path.join(folder,entry.name);
    if(entry.isDirectory()) results.push(...await readResults(file));
    else if(/^result-(editor|data|native)-.*\.json$/.test(entry.name)) results.push(JSON.parse(await readFile(file,'utf8')));
  }
  return results;
}
async function main() {
  const shared=process.env.DESKTOP_SHARED === 'true';
  const attempt=Number(process.env.GITHUB_RUN_ATTEMPT);
  const expected={sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,attempt,buildDigest:process.env.DESKTOP_BUILD_DIGEST,contractDigest:await desktopContractDigest()};
  if (shared && (process.env.DESKTOP_BUILD_RESULT !== 'success' || process.env.DESKTOP_GROUPS_RESULT !== 'success')) throw Error('Shared build or desktop group failed, skipped or cancelled; refusing authorization');
  const results=shared ? latestGroupResults(await readResults('artifacts/desktop-results'),attempt) : [];
  assertDesktopGate({shared,legacy:process.env.DESKTOP_LEGACY_RESULT,build:process.env.DESKTOP_BUILD_RESULT,groups:process.env.DESKTOP_GROUPS_RESULT,results,expected});
  console.log(JSON.stringify({ok:true,mode:shared?'shared-canary':'legacy',sha:expected.sha,groups:results.map(result=>({group:result.group,attempt:result.attempt,entries:result.entries.length}))}));
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nDesktop gate: ${shared?'shared canary (measure before promotion)':'legacy'}; SHA ${expected.sha}.\n`);
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) main().catch(error=>{console.error(error.message);process.exitCode=1;});
