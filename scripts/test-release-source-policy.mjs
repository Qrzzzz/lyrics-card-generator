import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  authorizeReleaseSource,
  ReleaseSourceError,
  releaseSourcePolicy
} from "./verify-release-source.mjs";

const fixtureUrl = (name) => new URL(`./fixtures/release-source/${name}`, import.meta.url);
const readFixture = (name) => JSON.parse(readFileSync(fixtureUrl(name), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

function applyScenario(base, scenario) {
  const fixture = clone(base);
  if (scenario.comparison) fixture.comparison = scenario.comparison;
  if (scenario.removeCheck) {
    fixture.jobs["9001"].jobs = fixture.jobs["9001"].jobs.filter((job) => job.name !== scenario.removeCheck);
  }
  if (scenario.overrideCheck) {
    Object.assign(
      fixture.jobs["9001"].jobs.find((job) => job.name === scenario.overrideCheck.name),
      scenario.overrideCheck
    );
  }
  if (scenario.overrideRun) Object.assign(fixture.workflowRuns.workflow_runs.find((run) => run.id === 9001), scenario.overrideRun);
  return fixture;
}

function createFixtureClient(fixture) {
  const requests = [];
  const route = async (path) => {
    requests.push(path);
    if (path.includes("/git/ref/tags/")) return fixture.tagRef;
    const annotatedTag = path.match(/\/git\/tags\/([0-9a-f]{40})$/);
    if (annotatedTag) return fixture.annotatedTags[annotatedTag[1]];
    if (path.includes("/branches/main")) return fixture.branch;
    if (path.includes("/compare/")) return fixture.comparison;
    if (/\/commits\/[0-9a-f]{40}\/pulls/.test(path)) return fixture.pullRequests;
    const reviews = path.match(/\/pulls\/(\d+)\/reviews/);
    if (reviews) return fixture.reviews[reviews[1]];
    if (path.includes("/actions/workflows/ci.yml/runs?")) return fixture.workflowRuns;
    const jobs = path.match(/\/actions\/runs\/(\d+)\/attempts\/\d+\/jobs/);
    if (jobs) return fixture.jobs[jobs[1]];
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  return {
    requests,
    get: route,
    async getAll(path, key = undefined) {
      const payload = await route(path);
      return key ? payload[key] : payload;
    }
  };
}

async function authorizeFixture(fixture) {
  const client = createFixtureClient(fixture);
  const evidence = await authorizeReleaseSource({
    client,
    repository: "Qrzzzz/lyrics-card-generator",
    tag: "v6.2.2",
    expectedSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  });
  return { client, evidence };
}

const eligible = readFixture("eligible.json");
const { client, evidence } = await authorizeFixture(eligible);
assert.equal(evidence.releaseSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
assert.equal(evidence.reviewedPullRequest.number, 200);
assert.notEqual(
  evidence.releaseSha,
  evidence.reviewedPullRequest.headSha,
  "squash/rebase review evidence is associated with, not mistaken for, the final main commit"
);
assert.equal(evidence.reviewedPullRequest.approvals.length, 1);
assert.equal(evidence.ci.runId, 9001, "a successful rerun supersedes an earlier failed run for the same SHA");
assert.deepEqual(evidence.ci.checks.map((check) => check.name), releaseSourcePolicy.requiredChecks);
assert.ok(
  client.requests.some((request) => request.includes("branch=main") && request.includes("event=push") && request.includes("head_sha=aaaaaaaa")),
  "CI lookup binds the workflow event, main branch, and exact release SHA"
);

for (const scenarioName of ["off-main.json", "missing-check.json", "failed-check.json"]) {
  const scenario = readFixture(scenarioName);
  const fixture = applyScenario(eligible, scenario);
  await assert.rejects(
    authorizeFixture(fixture),
    (error) => error instanceof ReleaseSourceError && error.code === scenario.expectedError,
    `${scenarioName} fails closed with ${scenario.expectedError}`
  );
}

const movedTag = clone(eligible);
movedTag.annotatedTags["dddddddddddddddddddddddddddddddddddddddd"].object.sha = "ffffffffffffffffffffffffffffffffffffffff";
await assert.rejects(
  authorizeFixture(movedTag),
  (error) => error instanceof ReleaseSourceError && error.code === "tag_sha_mismatch",
  "a moved annotated tag cannot reuse authorization for old bytes"
);

const staleApproval = clone(eligible);
staleApproval.reviews["200"][0].commit_id = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
await assert.rejects(
  authorizeFixture(staleApproval),
  (error) => error instanceof ReleaseSourceError && error.code === "current_approval_missing",
  "approval must apply to the pull request's final head commit"
);

const newestRunFailed = clone(eligible);
const failedRun = clone(newestRunFailed.workflowRuns.workflow_runs.find((run) => run.id === 9001));
failedRun.id = 9002;
failedRun.run_attempt = 1;
failedRun.created_at = "2026-08-30T13:00:00Z";
failedRun.conclusion = "failure";
newestRunFailed.workflowRuns.workflow_runs.push(failedRun);
newestRunFailed.jobs["9002"] = clone(newestRunFailed.jobs["9001"]);
for (const job of newestRunFailed.jobs["9002"].jobs) job.run_attempt = 1;
newestRunFailed.jobs["9002"].jobs.find((job) => job.name === "desktop-packaged-regression").conclusion = "failure";
await assert.rejects(
  authorizeFixture(newestRunFailed),
  (error) => error instanceof ReleaseSourceError && error.code === "required_ci_not_successful",
  "a newer failed push run cannot be masked by an older success for the same SHA"
);

console.log("Release source authorization fixture tests passed");
