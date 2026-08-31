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
const FINAL_PR_HEAD = "cccccccccccccccccccccccccccccccccccccccc";

function review({
  id,
  login,
  state = "APPROVED",
  commitId = FINAL_PR_HEAD,
  submittedAt,
  accountType = "User"
}) {
  return {
    id,
    state,
    submitted_at: submittedAt,
    commit_id: commitId,
    user: { login, type: accountType }
  };
}

function configureReviewer(fixture, login, { permission = "write", accountType = "User" } = {}) {
  fixture.reviewerPermissions[login.toLowerCase()] = {
    permission,
    role_name: permission,
    user: { login, type: accountType }
  };
}

function approvalPolicy({ requiredApprovals = 1, trustedReviewers = [{ login: "trusted-reviewer" }] } = {}) {
  return { ...releaseSourcePolicy, requiredApprovals, trustedReviewers };
}

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
    const reviewerPermission = path.match(/\/collaborators\/([^/]+)\/permission$/);
    if (reviewerPermission) {
      const login = decodeURIComponent(reviewerPermission[1]).toLowerCase();
      if (fixture.reviewerPermissionErrors.includes(login)) throw new Error(`Permission lookup failed for ${login}`);
      const payload = fixture.reviewerPermissions[login];
      if (!payload) throw new Error(`Missing fixture permission for ${login}`);
      return payload;
    }
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

async function authorizeFixture(fixture, policy = releaseSourcePolicy) {
  const client = createFixtureClient(fixture);
  const evidence = await authorizeReleaseSource({
    client,
    repository: "Qrzzzz/lyrics-card-generator",
    tag: "v6.2.2",
    expectedSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    policy
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
assert.equal(evidence.reviewedPullRequest.approvals.length, 0, "the current zero-approval policy accepts a merged PR with no reviews");
assert.ok(
  !client.requests.some((request) => request.includes("/reviews") || request.includes("/collaborators/")),
  "zero required approvals do not make review or reviewer-permission requests"
);
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

const authorSelfApproval = clone(eligible);
configureReviewer(authorSelfApproval, "author");
authorSelfApproval.reviews["200"] = [review({
  id: 300,
  login: "author",
  submittedAt: "2026-08-30T11:00:00Z"
})];
await assert.rejects(
  authorizeFixture(authorSelfApproval, approvalPolicy({ trustedReviewers: [{ login: "author" }] })),
  (error) => error instanceof ReleaseSourceError && error.code === "current_approval_missing",
  "the pull request author's approval never counts"
);

const missingAuthorIdentity = clone(authorSelfApproval);
delete missingAuthorIdentity.pullRequests[0].user;
await assert.rejects(
  authorizeFixture(missingAuthorIdentity, approvalPolicy({ trustedReviewers: [{ login: "author" }] })),
  (error) => error instanceof ReleaseSourceError && error.code === "review_identity_unavailable",
  "missing pull request author identity fails closed"
);

const untrustedExternalApproval = clone(eligible);
configureReviewer(untrustedExternalApproval, "trusted-reviewer");
untrustedExternalApproval.reviews["200"] = [review({
  id: 301,
  login: "external-reviewer",
  submittedAt: "2026-08-30T11:00:00Z"
})];
await assert.rejects(
  authorizeFixture(untrustedExternalApproval, approvalPolicy()),
  (error) => error instanceof ReleaseSourceError && error.code === "current_approval_missing",
  "an approval from an account outside the explicit trusted allowlist never counts"
);

const staleApproval = clone(eligible);
configureReviewer(staleApproval, "trusted-reviewer");
staleApproval.reviews["200"] = [review({
  id: 302,
  login: "trusted-reviewer",
  commitId: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  submittedAt: "2026-08-30T11:00:00Z"
})];
await assert.rejects(
  authorizeFixture(staleApproval, approvalPolicy()),
  (error) => error instanceof ReleaseSourceError && error.code === "current_approval_missing",
  "a trusted approval must apply to the pull request's final head commit"
);

const trustedFinalHeadApproval = clone(eligible);
configureReviewer(trustedFinalHeadApproval, "trusted-reviewer");
trustedFinalHeadApproval.reviews["200"] = [review({
  id: 303,
  login: "trusted-reviewer",
  submittedAt: "2026-08-30T11:00:00Z"
})];
const trustedEvidence = (await authorizeFixture(trustedFinalHeadApproval, approvalPolicy())).evidence;
assert.deepEqual(trustedEvidence.reviewedPullRequest.approvals, [{
  reviewer: "trusted-reviewer",
  reviewId: 303,
  commitSha: FINAL_PR_HEAD,
  permission: "write",
  accountType: "User"
}], "an explicitly trusted current writer's final-head approval counts");

for (const [state, id] of [["CHANGES_REQUESTED", 305], ["DISMISSED", 307]]) {
  const supersededApproval = clone(eligible);
  configureReviewer(supersededApproval, "trusted-reviewer");
  supersededApproval.reviews["200"] = [
    review({ id: id - 1, login: "trusted-reviewer", submittedAt: "2026-08-30T11:00:00Z" }),
    review({ id, login: "trusted-reviewer", state, submittedAt: "2026-08-30T11:05:00Z" })
  ];
  await assert.rejects(
    authorizeFixture(supersededApproval, approvalPolicy()),
    (error) => error instanceof ReleaseSourceError && error.code === "current_approval_missing",
    `a later ${state} decision supersedes the reviewer's approval`
  );
}

const duplicateReviewer = clone(eligible);
configureReviewer(duplicateReviewer, "trusted-reviewer");
configureReviewer(duplicateReviewer, "second-trusted-reviewer");
duplicateReviewer.reviews["200"] = [
  review({ id: 308, login: "trusted-reviewer", submittedAt: "2026-08-30T11:00:00Z" }),
  review({ id: 309, login: "TRUSTED-REVIEWER", submittedAt: "2026-08-30T11:05:00Z" })
];
await assert.rejects(
  authorizeFixture(duplicateReviewer, approvalPolicy({
    requiredApprovals: 2,
    trustedReviewers: [{ login: "trusted-reviewer" }, { login: "second-trusted-reviewer" }]
  })),
  (error) => error instanceof ReleaseSourceError
    && error.code === "current_approval_missing"
    && error.details.approvals.length === 1,
  "multiple approvals from the same reviewer count only once, case-insensitively"
);

await assert.rejects(
  authorizeFixture(clone(eligible), approvalPolicy({
    requiredApprovals: 2,
    trustedReviewers: [{ login: "trusted-reviewer" }]
  })),
  (error) => error instanceof ReleaseSourceError && error.code === "trusted_reviewer_capacity",
  "required approvals cannot exceed the explicit trusted reviewer population"
);

const permissionLookupFailure = clone(eligible);
permissionLookupFailure.reviewerPermissionErrors.push("trusted-reviewer");
permissionLookupFailure.reviews["200"] = [review({
  id: 310,
  login: "trusted-reviewer",
  submittedAt: "2026-08-30T11:00:00Z"
})];
await assert.rejects(
  authorizeFixture(permissionLookupFailure, approvalPolicy()),
  (error) => error instanceof ReleaseSourceError && error.code === "reviewer_permission_unavailable",
  "a reviewer permission query failure blocks authorization"
);

const insufficientPermission = clone(eligible);
configureReviewer(insufficientPermission, "trusted-reviewer", { permission: "read" });
insufficientPermission.reviews["200"] = [review({
  id: 311,
  login: "trusted-reviewer",
  submittedAt: "2026-08-30T11:00:00Z"
})];
await assert.rejects(
  authorizeFixture(insufficientPermission, approvalPolicy()),
  (error) => error instanceof ReleaseSourceError && error.code === "trusted_reviewer_capacity",
  "an allowlisted reviewer without current write permission cannot satisfy the policy"
);

const botApproval = clone(eligible);
configureReviewer(botApproval, "release-reviewer[bot]", { accountType: "Bot" });
botApproval.reviews["200"] = [review({
  id: 312,
  login: "release-reviewer[bot]",
  accountType: "Bot",
  submittedAt: "2026-08-30T11:00:00Z"
})];
await assert.rejects(
  authorizeFixture(botApproval, approvalPolicy({ trustedReviewers: [{ login: "release-reviewer[bot]" }] })),
  (error) => error instanceof ReleaseSourceError && error.code === "trusted_reviewer_capacity",
  "an allowlisted bot still requires explicit allowBot authorization"
);
const trustedBotEvidence = (await authorizeFixture(botApproval, approvalPolicy({
  trustedReviewers: [{ login: "release-reviewer[bot]", allowBot: true }]
}))).evidence;
assert.equal(trustedBotEvidence.reviewedPullRequest.approvals.length, 1, "an explicitly allowed trusted bot can count");

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
