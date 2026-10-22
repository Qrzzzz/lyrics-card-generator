import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { createGitHubClient } from './verify-release-source.mjs';
import { createBoundedFetch } from './release-cli.mjs';

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function firstPassOutcome(jobs, required) {
  const matches=required.map(name=>jobs.filter(job=>job.name===name));
  if(matches.some(group=>group.length!==1)) return null;
  if(matches.some(([job])=>job.status==='completed' && job.conclusion!=='success')) return false;
  return matches.every(([job])=>job.status==='completed' && job.conclusion==='success') ? true : null;
}

async function main() {
const runId=process.argv.find(value=>value.startsWith('--run-id='))?.slice(9) || process.env.GITHUB_RUN_ID;
const repository=process.env.GITHUB_REPOSITORY;
if(!/^\d+$/.test(runId || '') || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw Error('Explicit repository and run ID required');
const report={runId,repository,observedAt:new Date().toISOString(),available:false};
try {
  const client=createGitHubClient({token:process.env.GH_TOKEN || process.env.GITHUB_TOKEN,fetchImpl:createBoundedFetch()});
  const base=`/repos/${repository}/actions/runs/${runId}`;
  const run=await client.get(base);
  const jobs=await client.getAll(`${base}/jobs?filter=all`,'jobs');
  const first=await client.getAll(`${base}/attempts/1/jobs`,'jobs');
  const seconds=(start,end)=>start && end ? Math.max(0,(Date.parse(end)-Date.parse(start))/1000) : null;
  const required=['verify','render-boundary-regression','web-lite-smoke','web-lite-cross-browser-smoke','desktop-packaged-regression'];
  Object.assign(report,{available:true,sha:run.head_sha,url:run.html_url,attempt:run.run_attempt,status:run.status,conclusion:run.conclusion,
    wallSeconds:run.status==='completed'?seconds(run.created_at,run.updated_at):null,
    firstPass:firstPassOutcome(first,required),
    jobs:jobs.map(job=>({name:job.name,attempt:job.run_attempt,status:job.status,conclusion:job.conclusion,queueSeconds:seconds(job.created_at,job.started_at),seconds:seconds(job.started_at,job.completed_at),
      steps:(job.steps || []).map(step=>({name:step.name,conclusion:step.conclusion,seconds:seconds(step.started_at,step.completed_at)}))}))});
} catch { report.reason='GitHub timing evidence unavailable; do not infer performance or first-pass success.'; }
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/desktop-timings.json',JSON.stringify(report,null,2));
if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,`\nTiming evidence: ${report.available?'available':'unavailable'}; run ${runId}; final wall time ${report.wallSeconds ?? 'not yet known'}s. Three completed releases remain required for evaluation.\n`);
console.log(JSON.stringify({available:report.available,runId,wallSeconds:report.wallSeconds ?? null}));

}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) main().catch(error=>{console.error(error.message);process.exitCode=1;});
