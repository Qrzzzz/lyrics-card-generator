import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function validateCandidateTransition({ previous, next, pr, remoteTag, localTag, releases }) {
  for (const key of ['repository', 'branch', 'tag', 'packageVersion']) if (previous[key] !== next[key]) throw Error(`New candidate ${key} differs from the original release`);
  if (previous.schema !== 1 || next.schema !== 1 || !/^[a-f0-9]{40}$/.test(previous.sourceSha || '') || !/^[a-f0-9]{40}$/.test(next.sourceSha || '') || next.sourceSha === previous.sourceSha) throw Error('A new committed source SHA is required');
  if (previous.status === 'complete' || previous.releaseSha || previous.tagPushStarted || previous.sourceEvidence || previous.releaseRunId || previous.releaseId) throw Error('A merged, tagged or published release cannot be replaced by a new candidate');
  if (!previous.pr || pr.number !== previous.pr || pr.merged_at || pr.state !== 'open' || pr.base?.ref !== 'main'
    || pr.draft || pr.head?.repo?.full_name !== next.repository || pr.head?.ref !== next.branch || ![previous.sourceSha, next.sourceSha].includes(pr.head?.sha)) throw Error('The original PR is no longer an unchanged open candidate');
  if (remoteTag.trim() || localTag.trim() || releases.some(release => release.tag_name === next.tag)) throw Error('An existing local/remote tag or draft/public Release prevents candidate replacement');
  return { ...next, pr: previous.pr, candidatePush: pr.head.sha === next.sourceSha ? null : { sourceSha: next.sourceSha, previousHead: pr.head.sha }, supersedes: previous.sourceSha, candidateHistory: [...(previous.candidateHistory || []), { sourceSha: previous.sourceSha, pr: previous.pr, phaseHistory: previous.phaseHistory || [], outcome: previous.progress?.outcome || 'interrupted' }] };
}

export async function prepareReleaseCandidate(h, previous, next) {
  const pr = await h.api(`repos/${next.repository}/pulls/${previous.pr}`);
  const releases = [];
  for (let page = 1; ; page++) {
    if (page > 20) throw Error('Release enumeration exceeded the candidate preparation limit');
    const batch = await h.api(`repos/${next.repository}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw Error('Invalid Release enumeration');
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return validateCandidateTransition({ previous, next, pr, releases,
    remoteTag: h.command('git', ['ls-remote', '--tags', 'origin', `refs/tags/${next.tag}`, `refs/tags/${next.tag}^{}`]),
    localTag: h.command('git', ['tag', '--list', next.tag]) });
}

export function archiveReleaseCandidate(statePath, previous, write = writeFileSync) {
  const archive = path.join(path.dirname(statePath), `${previous.tag}.candidate-${previous.sourceSha}-${randomUUID()}.json`);
  write(archive, JSON.stringify(previous, null, 2) + '\n', { flag: 'wx' });
  return path.basename(archive);
}
